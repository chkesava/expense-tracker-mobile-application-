/**
 * SPENDLY-297 — tax deadlines as Financial Calendar events (SPENDLY-176).
 *
 * Derived, never stored. The id is `tax:{fy}-{deadlineId}:{date}`, so the
 * same deadline is one event however often the calendar is rebuilt, and a
 * notification keyed on it is never duplicated. Events carry no amounts.
 *
 * Lifecycle, from the user's tax records (read only):
 * - Advance tax: done when an advance-tax payment is dated in the
 *   instalment's window (after the previous due date, up to this one). A past
 *   instalment with no payment is overdue only if the user pays advance tax
 *   that year (has any advance-tax payment); otherwise it stays informational,
 *   since many people owe none.
 * - Form 16: shown for a year with salary (salary credits, or a Form 16 the
 *   year before); done once a Form 16 is entered or uploaded; overdue after
 *   its date while still missing.
 * - Filing dates and the year end: informational. Spendly doesn't know
 *   whether a return was filed, so a past filing date never reads overdue.
 *
 * User-made tax reminders stay `calendarReminders` with category `tax`.
 */

import type { CalendarEvent, CalendarEventState } from "@/shared/types/calendar";
import type { Income } from "@/shared/types/expense";
import type { CalendarContext } from "@/shared/utils/calendarSources";
import { calendarEventId, calendarPriority } from "@/shared/utils/calendarSources";
import { TAX_DEADLINE_SETS, type TaxDeadline } from "../data/taxDeadlines";
import type { FinancialYearKey, TaxDocument, TaxEntry } from "../types";
import { taxRuleForIncomeSource, financialYearOfIncome } from "./income";
import { taxYearLabel } from "./taxYear";

export interface TaxCalendarFacts {
  /** Advance-tax payment dates, by year. */
  advancePayments: ReadonlyMap<FinancialYearKey, readonly string[]>;
  /** Years with a Form 16 entered or uploaded. */
  form16Years: ReadonlySet<FinancialYearKey>;
  /** Years with salary credits in Spendly. */
  salaryYears: ReadonlySet<FinancialYearKey>;
}

export function taxCalendarFacts(args: {
  entries: readonly TaxEntry[];
  documents: readonly TaxDocument[];
  incomes?: readonly Pick<Income, "source" | "date" | "month" | "deletedAt">[];
}): TaxCalendarFacts {
  const advancePayments = new Map<string, string[]>();
  const form16Years = new Set<string>();
  for (const e of args.entries) {
    if (e.deletedAt) continue;
    if (e.kind === "form16") form16Years.add(e.fy);
    if (e.kind === "tax_payment" && e.fields.paymentType === "advance_tax") {
      advancePayments.set(e.fy, [...(advancePayments.get(e.fy) ?? []), e.fields.date].sort());
    }
  }
  for (const d of args.documents) if (d.category === "form16") form16Years.add(d.fy);
  const salaryYears = new Set<string>();
  for (const i of args.incomes ?? []) {
    if (i.deletedAt || taxRuleForIncomeSource(i.source).category !== "salary") continue;
    const fy = financialYearOfIncome(i);
    if (fy) salaryYears.add(fy);
  }
  return { advancePayments, form16Years, salaryYears };
}

function previousFy(fy: string): string {
  const start = Number(fy.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function stateOf(d: TaxDeadline, fy: string, facts: TaxCalendarFacts, today: string, previousDue: string | null): { state: CalendarEventState; subtitle: string } | null {
  const past = d.date < today;
  switch (d.kind) {
    case "advance_tax": {
      const payments = facts.advancePayments.get(fy) ?? [];
      const paid = payments.some((p) => p <= d.date && (previousDue === null || p > previousDue));
      if (paid) return { state: "completed", subtitle: "Advance tax payment recorded" };
      if (!past) return { state: "scheduled", subtitle: d.detail };
      return payments.length > 0
        ? { state: "overdue", subtitle: "No payment recorded for this instalment" }
        : { state: "expected", subtitle: "No advance tax recorded for this year" };
    }
    case "form16": {
      if (facts.form16Years.has(fy)) return { state: "completed", subtitle: "Form 16 added" };
      if (!facts.salaryYears.has(fy) && !facts.form16Years.has(previousFy(fy))) return null;
      return past ? { state: "overdue", subtitle: "Ask your employer for Form 16, then add it" } : { state: "scheduled", subtitle: d.detail };
    }
    default:
      // Spendly doesn't know whether a return was filed: informational only.
      return { state: past ? "expected" : "scheduled", subtitle: past ? "This date has passed" : d.detail };
  }
}

function hrefOf(d: TaxDeadline, fy: string): string {
  switch (d.kind) {
    case "advance_tax":
      return `/tax/${fy}/payments`;
    case "form16":
      return `/tax/${fy}/tds`;
    case "year_end":
      return `/tax/${fy}/deductions`;
    default:
      return `/tax?fy=${fy}`;
  }
}

/** Tax deadline events inside `ctx.range`. */
export function taxEvents(facts: TaxCalendarFacts, ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const set of TAX_DEADLINE_SETS) {
    const advance = set.deadlines.filter((d) => d.kind === "advance_tax").sort((a, b) => a.date.localeCompare(b.date));
    for (const d of set.deadlines) {
      if (d.date < ctx.range.from || d.date > ctx.range.to) continue;
      const i = advance.indexOf(d);
      const s = stateOf(d, set.fy, facts, ctx.today, i > 0 ? advance[i - 1].date : null);
      if (!s) continue;
      const refId = `${set.fy}-${d.id}`;
      out.push({
        id: calendarEventId("tax", refId, d.date),
        source: "tax",
        refId,
        date: d.date,
        title: d.title,
        subtitle: `${s.subtitle} · ${taxYearLabel(set.fy)}`,
        // Deadlines, not cash movements: no amount, and notifications show none.
        amount: null,
        currency: ctx.currency,
        direction: "neutral",
        state: s.state,
        priority: calendarPriority(s.state, d.date, ctx.today),
        actionable: s.state === "scheduled" || s.state === "overdue",
        href: hrefOf(d, set.fy),
      });
    }
  }
  return out;
}

/**
 * Events the reminders inbox and notifications may raise: open and either
 * still ahead or truly overdue. Informational past dates ("expected") never
 * nag.
 */
export function actionableTaxEvents(events: readonly CalendarEvent[], today: string): CalendarEvent[] {
  return events.filter((e) => e.source === "tax" && (e.state === "overdue" || (e.state === "scheduled" && e.date >= today)));
}

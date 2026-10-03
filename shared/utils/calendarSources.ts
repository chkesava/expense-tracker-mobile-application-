/**
 * Source → Financial Calendar event mapping (SPENDLY-177).
 *
 * One pure adapter per domain. Adapters read canonical records and return
 * events within a range; they never create, change or delete a record, and
 * they never invent money: income appears only as recorded, goals only when a
 * deadline exists, EPF only where a date exists. Recurring items reuse the
 * runway schedule helper (`occurrencesBetween`).
 */

import type { CalendarDirection, CalendarEvent, CalendarEventState, CalendarPriority, CalendarRange, CalendarSource } from "../types/calendar";
import type { Borrowing } from "../types/borrowing";
import type { CreditCardBill } from "../types/creditCardBill";
import { OPEN_BILL_STATUSES } from "../types/creditCardBill";
import type { FinancialGoal, Income } from "../types/expense";
import type { Investment } from "../types/investment";
import type { Receivable } from "../types/receivable";
import { subscriptionFrequency, type Subscription } from "../types/subscription";
import type { EpfContribution } from "../features/epf/types";
import type { SipPlan } from "../features/sip/types";
import { daysBetweenDateKeys, isValidDateKey, parseLocalDate } from "./dates";
import { getInvestmentValuation } from "./investmentInterest";
import { isActiveLedgerRow } from "./ledgerRow";
import { roundMoney } from "./money";
import { occurrencesBetween, type RunwaySchedule } from "./runwayEngine";
import { getNextRenewalDate, isEmiTermCompleted } from "./subscriptionProcessor";
import { transactionHref } from "./transactionRef";

export interface CalendarContext {
  range: CalendarRange;
  /** Local date key in the user's timezone. */
  today: string;
  currency: string;
}

export const calendarEventId = (source: CalendarSource, refId: string, date: string) => `${source}:${refId}:${date}`;

const inRange = (date: string, r: CalendarRange) => date >= r.from && date <= r.to;

/** Overdue beats everything; then due within 3 days; then other open items. */
export function calendarPriority(state: CalendarEventState, date: string, today: string): CalendarPriority {
  if (state === "overdue") return 3;
  if (state === "scheduled" || state === "expected") {
    const days = daysBetweenDateKeys(today, date);
    return days >= 0 && days <= 3 ? 2 : 1;
  }
  return 0;
}

function event(
  ctx: CalendarContext,
  e: Omit<CalendarEvent, "id" | "priority" | "currency"> & { currency?: string }
): CalendarEvent {
  return {
    ...e,
    id: calendarEventId(e.source, e.refId, e.date),
    currency: e.currency || ctx.currency,
    priority: calendarPriority(e.state, e.date, ctx.today),
  };
}

/** Open past-due items are overdue; otherwise the given open state. */
const openState = (date: string, today: string, open: "scheduled" | "expected"): CalendarEventState => (date < today ? "overdue" : open);

// ── Card bills ──────────────────────────────────────────────────────────────

export function cardBillEvents(bills: readonly CreditCardBill[], cardNames: ReadonlyMap<string, string>, ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const b of bills) {
    if (!b.id || !isValidDateKey(b.dueDate) || !inRange(b.dueDate, ctx.range)) continue;
    const open = OPEN_BILL_STATUSES.includes(b.status) && b.remainingAmount > 0;
    const state: CalendarEventState = b.status === "CANCELLED" ? "cancelled" : open ? openState(b.dueDate, ctx.today, "scheduled") : "completed";
    out.push(
      event(ctx, {
        source: "card_bill",
        refId: b.id,
        date: b.dueDate,
        title: `${cardNames.get(b.accountId) ?? "Credit card"} bill`,
        subtitle: open ? `Minimum ${roundMoney(b.minimumDueAmount)}` : state === "completed" ? "Paid" : undefined,
        amount: roundMoney(open ? b.remainingAmount : b.statementAmount),
        currency: b.currency,
        direction: "out",
        state,
        actionable: open,
        href: `/credit-card-bills/${b.id}`,
      })
    );
  }
  return out;
}

// ── Recurring items (subscriptions, EMIs) ───────────────────────────────────

/**
 * Future renewals only: past renewals were posted as expenses already, and the
 * calendar never re-shows a posted expense as a second commitment. Recurring
 * transfers between the user's own accounts are not shown (money movement).
 */
export function subscriptionEvents(subs: readonly Subscription[], ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const start = ctx.range.from > ctx.today ? ctx.range.from : ctx.today;
  if (start > ctx.range.to) return out;
  const [y, m] = ctx.today.split("-").map(Number);
  for (const sub of subs) {
    if (!sub.id || !sub.isActive || sub.isCompleted || sub.type === "transfer" || !(sub.amount > 0)) continue;
    if (sub.type === "emi" && isEmiTermCompleted(sub, y, m)) continue;
    const first = getNextRenewalDate(sub, parseLocalDate(start)).dateStr;
    const untilMonth = sub.endYear && sub.endMonth ? `${sub.endYear}-${String(sub.endMonth).padStart(2, "0")}` : undefined;
    const schedule: RunwaySchedule =
      subscriptionFrequency(sub) === "every_n_days"
        ? { kind: "every_n_days", firstDate: first, intervalDays: Math.max(1, Math.round(sub.intervalDays || 1)) }
        : { kind: "monthly", firstDate: first, dayOfMonth: sub.dayOfMonth || 1, untilMonth };
    const source: CalendarSource = sub.type === "emi" ? "emi" : "subscription";
    for (const date of occurrencesBetween(schedule, start, ctx.range.to)) {
      out.push(
        event(ctx, {
          source,
          refId: sub.id,
          date,
          title: sub.name,
          subtitle: source === "emi" ? "EMI" : sub.category,
          amount: roundMoney(sub.amount),
          direction: "out",
          state: "scheduled",
          actionable: true,
          href: "/ledger?tab=subscriptions",
          recurrenceId: `${source}:${sub.id}`,
        })
      );
    }
  }
  return out;
}

// ── Borrowings and receivables ──────────────────────────────────────────────

const SETTLED = new Set(["FULLY_SETTLED", "CLOSED"]);

export function borrowingEvents(borrowings: readonly Borrowing[], ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const b of borrowings) {
    const date = b.dueDate ?? "";
    if (!b.id || !isValidDateKey(date) || !inRange(date, ctx.range)) continue;
    const settled = SETTLED.has(b.status);
    const state: CalendarEventState = settled ? "completed" : b.status === "OVERDUE" ? "overdue" : openState(date, ctx.today, "scheduled");
    const amount = typeof b.totalOutstanding === "number" ? roundMoney(b.totalOutstanding) : null;
    out.push(
      event(ctx, {
        source: "borrowing",
        refId: b.id,
        date,
        title: `Repay ${b.lenderName}`,
        subtitle: settled ? "Settled" : "Loan due date",
        amount: settled ? null : amount,
        direction: "out",
        state,
        actionable: !settled,
        href: `/ledger?tab=borrowings&id=${b.id}`,
      })
    );
  }
  return out;
}

export function receivableEvents(receivables: readonly Receivable[], ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const r of receivables) {
    const date = r.dueDate ?? "";
    if (!r.id || !isValidDateKey(date) || !inRange(date, ctx.range)) continue;
    const state: CalendarEventState =
      r.status === "CANCELLED" ? "cancelled" : r.status === "FULLY_SETTLED" ? "completed" : r.status === "OVERDUE" ? "overdue" : openState(date, ctx.today, "expected");
    const open = state === "expected" || state === "overdue";
    out.push(
      event(ctx, {
        source: "receivable",
        refId: r.id,
        date,
        title: `${r.personName} owes you`,
        subtitle: r.purpose || undefined,
        amount: open && typeof r.outstandingAmount === "number" ? roundMoney(r.outstandingAmount) : null,
        direction: "in",
        state,
        actionable: open,
        href: `/ledger?tab=receivables&id=${r.id}`,
      })
    );
  }
  return out;
}

// ── Income (recorded only) ──────────────────────────────────────────────────

export function incomeEvents(incomes: readonly Income[], ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const inc of incomes) {
    if (!inc.id || !isActiveLedgerRow(inc) || !isValidDateKey(inc.date) || !inRange(inc.date, ctx.range)) continue;
    out.push(
      event(ctx, {
        source: "income",
        refId: inc.id,
        date: inc.date,
        title: inc.source,
        subtitle: inc.note || undefined,
        amount: roundMoney(inc.amount),
        direction: "in",
        state: "actual",
        actionable: false,
        href: transactionHref({ kind: "income", id: inc.id }, inc.accountId),
      })
    );
  }
  return out;
}

// ── Goals (deadline milestones only) ────────────────────────────────────────

export function goalEvents(goals: readonly FinancialGoal[], ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const g of goals) {
    const date = g.deadline ?? "";
    if (!g.id || !isValidDateKey(date) || !inRange(date, ctx.range)) continue;
    const reached = g.currentAmount >= g.targetAmount;
    out.push(
      event(ctx, {
        source: "goal",
        refId: g.id,
        date,
        title: `${g.name} deadline`,
        subtitle: reached ? "Goal reached" : `${roundMoney(Math.max(0, g.targetAmount - g.currentAmount))} to go`,
        // A milestone, not a cash movement: no amount.
        amount: null,
        direction: "neutral",
        state: reached ? "completed" : openState(date, ctx.today, "scheduled"),
        actionable: !reached,
        href: "/settings/money",
      })
    );
  }
  return out;
}

// ── Investments (FD maturity) ───────────────────────────────────────────────

export function investmentEvents(investments: readonly Investment[], ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const inv of investments) {
    const date = inv.maturityDate ?? "";
    if (!inv.id || inv.status === "closed" || !isValidDateKey(date) || !inRange(date, ctx.range)) continue;
    const matured = inv.status === "matured";
    out.push(
      event(ctx, {
        source: "investment",
        refId: inv.id,
        date,
        title: `${inv.name} matures`,
        subtitle: matured ? "Matured" : "Maturity value is an estimate",
        amount: roundMoney(getInvestmentValuation(inv, date).totalValue),
        direction: "in",
        state: matured ? "completed" : openState(date, ctx.today, "expected"),
        actionable: false,
        href: `/investments?tab=investments&id=${inv.id}`,
      })
    );
  }
  return out;
}

// ── SIP plans ───────────────────────────────────────────────────────────────

function sipSchedule(plan: SipPlan): RunwaySchedule {
  const first = plan.nextExecutionDate.slice(0, 10);
  switch (plan.frequency) {
    case "daily":
      return { kind: "every_n_days", firstDate: first, intervalDays: 1, untilDate: plan.endDate?.slice(0, 10) };
    case "weekly":
      return { kind: "every_n_days", firstDate: first, intervalDays: 7, untilDate: plan.endDate?.slice(0, 10) };
    case "quarterly":
      return { kind: "monthly", firstDate: first, dayOfMonth: plan.executionDay, intervalMonths: 3, untilMonth: plan.endDate?.slice(0, 7) };
    case "yearly":
      return { kind: "monthly", firstDate: first, dayOfMonth: plan.executionDay, intervalMonths: 12, untilMonth: plan.endDate?.slice(0, 7) };
    default:
      return { kind: "monthly", firstDate: first, dayOfMonth: plan.executionDay, untilMonth: plan.endDate?.slice(0, 7) };
  }
}

export function sipEvents(plans: readonly SipPlan[], ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const p of plans) {
    if (!p.id || p.status !== "active" || !isValidDateKey(p.nextExecutionDate?.slice(0, 10) ?? "")) continue;
    const end = p.endDate?.slice(0, 10);
    const dates = occurrencesBetween(sipSchedule(p), ctx.range.from, ctx.range.to).filter((d) => !end || d <= end);
    dates.forEach((date) => {
      const skipped = p.skipNextExecution && date === p.nextExecutionDate.slice(0, 10);
      out.push(
        event(ctx, {
          source: "sip",
          refId: p.id,
          date,
          title: `SIP: ${p.assetName}`,
          subtitle: skipped ? "Skipped" : undefined,
          amount: roundMoney(p.investmentAmount),
          currency: p.currency,
          direction: "out",
          state: skipped ? "cancelled" : openState(date, ctx.today, "scheduled"),
          actionable: !skipped,
          href: "/investments?tab=sip",
          recurrenceId: `sip:${p.id}`,
        })
      );
    });
  }
  return out;
}

// ── EPF ─────────────────────────────────────────────────────────────────────

/**
 * EPF credits land in the EPF account, not bank cash, so they are neutral.
 * Credited months show on their credit date; expected ones on the end of the
 * expected credit window; anything without a date is not shown.
 */
export function epfEvents(contributions: readonly EpfContribution[], employerNames: ReadonlyMap<string, string>, ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const c of contributions) {
    if (c.status === "draft" || c.status === "reversed") continue;
    const credited = c.status === "credited" || c.status === "partial";
    const date = (credited ? c.creditDate : c.expectedCreditTo) ?? "";
    if (!c.id || !isValidDateKey(date) || !inRange(date, ctx.range)) continue;
    const state: CalendarEventState = credited ? "actual" : c.status === "missed" ? "overdue" : openState(date, ctx.today, "expected");
    out.push(
      event(ctx, {
        source: "epf",
        refId: c.id,
        date,
        title: `EPF credit · ${employerNames.get(c.establishmentId) ?? "Employer"}`,
        subtitle: `Wage month ${c.month}`,
        amount: Number.isFinite(c.epfCredit) ? roundMoney(c.epfCredit) : null,
        direction: "neutral" as CalendarDirection,
        state,
        actionable: state === "overdue",
        href: `/epf/${c.establishmentId}`,
      })
    );
  }
  return out;
}

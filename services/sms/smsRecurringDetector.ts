/**
 * Phase 14 — detect recurring merchant + amount patterns from expenses.
 * Pure: no Firebase / expo-notifications.
 */

import { foldMerchantKey, normalizeMerchantName } from "./smsMerchantNormalizer";
import { parseLocalDate } from "@/shared/utils/dates";
import type {
  Subscription,
  SubscriptionFrequency,
} from "@/shared/types/subscription";
import { subscriptionFrequency } from "@/shared/types/subscription";

export const SMS_RECURRING_MIN_OCCURRENCES = 3;
export const SMS_RECURRING_MIN_MONTHS = 3;
export const SMS_RECURRING_MIN_INTERVAL_DAYS = 20;
export const SMS_RECURRING_MAX_INTERVAL_DAYS = 40;
export const SMS_RECURRING_MAX_SHORT_INTERVAL_DAYS = 19;
export const SMS_RECURRING_SHORT_MIN_OCCURRENCES = 4;
export const SMS_RECURRING_SHORT_MIN_SPAN_DAYS = 14;
export const SMS_RECURRING_GAP_TOLERANCE = 0.5;
export const SMS_RECURRING_DAY_OF_MONTH_SLACK = 3;

export type RecurringExpenseInput = {
  amount: number;
  date: string;
  note: string;
  category: string;
  subcategory?: string;
  accountId?: string | null;
  subscriptionId?: string;
  /** When known from SMS parse, preferred over note. */
  merchantHint?: string;
};

export type RecurringPattern = {
  merchant: string;
  amount: number;
  category: string;
  subcategory?: string;
  accountId?: string;
  occurrences: number;
  dates: string[];
  dayOfMonth: number;
  frequency: SubscriptionFrequency;
  intervalDays?: number;
  key: string;
};

const AUTO_NOTE = /^\[(Subscription|EMI|Auto-Transfer)\]/i;

export function recurringPatternKey(merchant: string, amount: number): string {
  return `${recurringMerchantKey(merchant)}|${amount.toFixed(2)}`;
}

/** Folded merchant identity used for permanent dismissals. */
export function recurringMerchantKey(merchant: string): string {
  const canonical = normalizeMerchantName(merchant).merchant || merchant;
  return foldMerchantKey(canonical);
}

export function merchantFromExpense(
  input: RecurringExpenseInput
): string | null {
  if (input.subscriptionId) return null;
  if (AUTO_NOTE.test(input.note || "")) return null;

  const raw = (input.merchantHint || input.note || "").trim();
  if (!raw) return null;

  const first = raw.split(/[·|,]/)[0]?.trim() || raw;
  if (!first || AUTO_NOTE.test(first)) return null;

  const normalized = normalizeMerchantName(first);
  const name = normalized.merchant?.trim();
  return name || null;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function daysBetween(a: string, b: string): number {
  const ms = parseLocalDate(b).getTime() - parseLocalDate(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function dateGaps(dates: string[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(daysBetween(dates[i - 1]!, dates[i]!));
  }
  return gaps;
}

function gapsAreConsistent(gaps: number[], mid: number): boolean {
  if (mid <= 0) return false;
  const lo = mid * (1 - SMS_RECURRING_GAP_TOLERANCE);
  const hi = mid * (1 + SMS_RECURRING_GAP_TOLERANCE);
  return gaps.every((gap) => gap >= lo && gap <= hi);
}

function sameishDayOfMonth(dates: string[]): boolean {
  const days = dates.map((d) => Number(d.slice(8, 10))).filter(Number.isFinite);
  if (days.length < SMS_RECURRING_MIN_MONTHS) return false;
  const mid = median(days);
  return days.every(
    (day) => Math.abs(day - mid) <= SMS_RECURRING_DAY_OF_MONTH_SLACK
  );
}

function medianDayOfMonth(dates: string[]): number {
  const days = dates.map((d) => Number(d.slice(8, 10))).filter(Number.isFinite);
  return Math.min(31, Math.max(1, Math.round(median(days)) || 1));
}

type Cadence =
  | { frequency: "monthly"; dayOfMonth: number }
  | { frequency: "every_n_days"; intervalDays: number; dayOfMonth: number };

/**
 * Classify a sorted unique-date series. Spanning three calendar months is not
 * enough on its own — chicken every two days over a quarter is still interval.
 */
export function classifyRecurringCadence(dates: string[]): Cadence | null {
  if (dates.length < SMS_RECURRING_MIN_OCCURRENCES) return null;
  const gaps = dateGaps(dates);
  if (!gaps.length) return null;
  const mid = median(gaps);
  const span = daysBetween(dates[0]!, dates[dates.length - 1]!);
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  const dayOfMonth = medianDayOfMonth(dates);

  const monthlyByGap =
    mid >= SMS_RECURRING_MIN_INTERVAL_DAYS &&
    mid <= SMS_RECURRING_MAX_INTERVAL_DAYS;
  const monthlyByDayOfMonth =
    months.size >= SMS_RECURRING_MIN_MONTHS &&
    mid >= SMS_RECURRING_MIN_INTERVAL_DAYS &&
    sameishDayOfMonth(dates);

  if (monthlyByGap || monthlyByDayOfMonth) {
    return { frequency: "monthly", dayOfMonth };
  }

  const shortEnough =
    mid >= 1 && mid <= SMS_RECURRING_MAX_SHORT_INTERVAL_DAYS;
  const enoughHistory =
    dates.length >= SMS_RECURRING_SHORT_MIN_OCCURRENCES ||
    span >= SMS_RECURRING_SHORT_MIN_SPAN_DAYS;

  if (shortEnough && gapsAreConsistent(gaps, mid) && enoughHistory) {
    return {
      frequency: "every_n_days",
      intervalDays: Math.max(1, Math.round(mid)),
      dayOfMonth,
    };
  }

  return null;
}

export function detectRecurringPatterns(
  expenses: RecurringExpenseInput[]
): RecurringPattern[] {
  const groups = new Map<string, RecurringExpenseInput[]>();

  for (const expense of expenses) {
    if (!Number.isFinite(expense.amount) || expense.amount <= 0) continue;
    if (!expense.date) continue;
    const merchant = merchantFromExpense(expense);
    if (!merchant) continue;
    const key = recurringPatternKey(merchant, expense.amount);
    const list = groups.get(key) ?? [];
    list.push(expense);
    groups.set(key, list);
  }

  const patterns: RecurringPattern[] = [];

  for (const [, group] of groups) {
    const byDate = new Map<string, RecurringExpenseInput>();
    for (const item of group) {
      if (!byDate.has(item.date)) byDate.set(item.date, item);
    }
    const unique = [...byDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    if (unique.length < SMS_RECURRING_MIN_OCCURRENCES) continue;
    const dates = unique.map((item) => item.date);
    const cadence = classifyRecurringCadence(dates);
    if (!cadence) continue;

    const merchant = merchantFromExpense(unique[unique.length - 1]!) as string;
    const amount = unique[0]!.amount;
    const category =
      mostCommon(unique.map((item) => item.category).filter(Boolean)) ||
      "Entertainment";
    const subcategory = mostCommon(
      unique.map((item) => item.subcategory || "").filter(Boolean)
    );
    const accountId = mostCommon(
      unique.map((item) => item.accountId || "").filter(Boolean)
    );

    patterns.push({
      merchant,
      amount,
      category,
      subcategory,
      accountId,
      occurrences: unique.length,
      dates,
      dayOfMonth: cadence.dayOfMonth,
      frequency: cadence.frequency,
      intervalDays:
        cadence.frequency === "every_n_days" ? cadence.intervalDays : undefined,
      key: recurringPatternKey(merchant, amount),
    });
  }

  return patterns.sort((a, b) => b.occurrences - a.occurrences);
}

function foldedNamesMatch(a: string, b: string): boolean {
  const fa = foldMerchantKey(normalizeMerchantName(a).merchant || a);
  const fb = foldMerchantKey(normalizeMerchantName(b).merchant || b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  if (fa.length >= 4 && fb.length >= 4) {
    return fa.startsWith(fb) || fb.startsWith(fa);
  }
  return false;
}

export function matchesExistingSubscription(
  sub: Pick<Subscription, "name" | "amount">,
  pattern: Pick<RecurringPattern, "merchant" | "amount">
): boolean {
  if (Math.abs((sub.amount || 0) - pattern.amount) >= 0.5) return false;
  return foldedNamesMatch(sub.name, pattern.merchant);
}

export function matchesExistingMerchant(
  subName: string,
  merchant: string
): boolean {
  return foldedNamesMatch(subName, merchant);
}

export function isMerchantDismissed(
  dismissedKeys: Iterable<string>,
  merchant: string
): boolean {
  const key = recurringMerchantKey(merchant);
  if (!key) return false;
  const set = dismissedKeys instanceof Set ? dismissedKeys : new Set(dismissedKeys);
  return set.has(key);
}

/** Patterns the user should review — not already subscribed and not declined. */
export function filterPatternsForReview(
  patterns: RecurringPattern[],
  existing: Pick<Subscription, "name">[],
  dismissedMerchants: Iterable<string>
): RecurringPattern[] {
  const dismissed = new Set(dismissedMerchants);
  return patterns.filter((pattern) => {
    if (isMerchantDismissed(dismissed, pattern.merchant)) return false;
    if (existing.some((sub) => matchesExistingMerchant(sub.name, pattern.merchant))) {
      return false;
    }
    return true;
  });
}

export function formatRecurringCadence(
  pattern: Pick<RecurringPattern, "frequency" | "intervalDays">
): string {
  if (pattern.frequency === "every_n_days") {
    const n = Math.max(1, pattern.intervalDays || 1);
    return n === 1 ? "every day" : `every ${n} days`;
  }
  return "month";
}

export function patternToSubscription(
  pattern: RecurringPattern
): Omit<Subscription, "id"> {
  const latest = pattern.dates[pattern.dates.length - 1] || "";
  const latestMonth = latest.slice(0, 7);
  const frequency = subscriptionFrequency(pattern);
  return {
    name: pattern.merchant,
    amount: pattern.amount,
    category: pattern.category,
    dayOfMonth: pattern.dayOfMonth,
    frequency,
    intervalDays: frequency === "every_n_days" ? pattern.intervalDays : undefined,
    isActive: true,
    lastProcessed: latestMonth,
    lastProcessedDate: latest || undefined,
    type: "subscription",
    source: "sms",
    accountId: pattern.accountId,
  };
}

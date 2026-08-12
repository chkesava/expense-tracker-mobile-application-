/**
 * Phase 14 — detect recurring merchant + amount patterns from expenses.
 * Pure: no Firebase / expo-notifications.
 */

import { foldMerchantKey, normalizeMerchantName } from "./smsMerchantNormalizer";
import { parseLocalDate } from "@/shared/utils/dates";
import type { Subscription } from "@/shared/types/subscription";

export const SMS_RECURRING_MIN_OCCURRENCES = 3;
export const SMS_RECURRING_MIN_MONTHS = 3;
export const SMS_RECURRING_MIN_INTERVAL_DAYS = 20;
export const SMS_RECURRING_MAX_INTERVAL_DAYS = 40;

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
  key: string;
};

const AUTO_NOTE = /^\[(Subscription|EMI|Auto-Transfer)\]/i;

export function recurringPatternKey(merchant: string, amount: number): string {
  const canonical = normalizeMerchantName(merchant).merchant || merchant;
  return `${foldMerchantKey(canonical)}|${amount.toFixed(2)}`;
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

function isMonthlyCadence(dates: string[]): boolean {
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  if (months.size >= SMS_RECURRING_MIN_MONTHS) return true;
  if (dates.length < 2) return false;
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(daysBetween(dates[i - 1]!, dates[i]!));
  }
  const mid = median(gaps);
  return (
    months.size >= 2 &&
    mid >= SMS_RECURRING_MIN_INTERVAL_DAYS &&
    mid <= SMS_RECURRING_MAX_INTERVAL_DAYS
  );
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
    if (!isMonthlyCadence(dates)) continue;

    const merchant = merchantFromExpense(unique[unique.length - 1]!) as string;
    const amount = unique[0]!.amount;
    const days = dates.map((d) => Number(d.slice(8, 10))).filter(Number.isFinite);
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
      dayOfMonth: Math.min(31, Math.max(1, Math.round(median(days)) || 1)),
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

export function patternToSubscription(
  pattern: RecurringPattern
): Omit<Subscription, "id"> {
  const latestMonth = pattern.dates[pattern.dates.length - 1]?.slice(0, 7) || "";
  return {
    name: pattern.merchant,
    amount: pattern.amount,
    category: pattern.category,
    dayOfMonth: pattern.dayOfMonth,
    isActive: true,
    lastProcessed: latestMonth,
    type: "subscription",
    source: "sms",
    accountId: pattern.accountId,
  };
}

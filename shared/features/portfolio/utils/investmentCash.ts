/**
 * Investment Cash Balance arithmetic.
 *
 * The balance is a fold over the `investmentCashTransactions` ledger on top of a
 * one-time baseline, never a stored scalar. That is what makes KAN-77's core
 * guarantee structural rather than careful: recomputing market value, reopening the
 * app or replaying a sync cannot restore cash a purchase already consumed, because
 * nothing here reads a number that a purchase has to remember to decrement.
 *
 * Pure and Firestore-free so it can be tested under the `shared/**` vitest glob.
 */

import { roundMoney } from "@/shared/utils/money";
import type {
  InvestmentCashBaseline,
  InvestmentCashEntry,
  InvestmentCashEntryType,
} from "@/shared/features/portfolio/types";

/** Positive for money arriving, negative for money leaving. */
export function signedAmount(entry: InvestmentCashEntry): number {
  const amount = Math.abs(Number(entry.amount) || 0);
  return entry.direction === "credit" ? amount : -amount;
}

/**
 * Drops entries sharing an id, keeping the first.
 *
 * A retried write targets the same doc id on purpose (see
 * `services/portfolio/investmentCash.ts`), so a duplicate id in a snapshot is a
 * replay rather than a second movement of money.
 */
export function dedupeEntries(entries: InvestmentCashEntry[]): InvestmentCashEntry[] {
  const seen = new Set<string>();
  const result: InvestmentCashEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

/** Oldest first: by date, then by client clock, then by id for a stable order. */
export function sortEntriesChronologically(
  entries: InvestmentCashEntry[]
): InvestmentCashEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = String(a.date ?? "").localeCompare(String(b.date ?? ""));
    if (byDate !== 0) return byDate;
    const byClock = (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
    if (byClock !== 0) return byClock;
    return a.id.localeCompare(b.id);
  });
}

export function baselineAmount(
  baseline: InvestmentCashBaseline | undefined | null
): number {
  return roundMoney(Number(baseline?.amount) || 0);
}

/** Baseline + every ledger movement. The authoritative Investment Cash Balance. */
export function computeInvestmentCashBalance(
  baseline: InvestmentCashBaseline | undefined | null,
  entries: InvestmentCashEntry[]
): number {
  const total = dedupeEntries(entries).reduce(
    (sum, entry) => sum + signedAmount(entry),
    baselineAmount(baseline)
  );
  return roundMoney(total);
}

/**
 * What the user may actually spend.
 *
 * Clamped at zero so historical drift can never present a negative balance as
 * though it were spendable, while `computeInvestmentCashBalance` still reports the
 * real (possibly negative) figure for the history header to explain.
 */
export function availableInvestmentCash(balance: number): number {
  return balance > 0 ? roundMoney(balance) : 0;
}

export type AffordabilityCheck = {
  ok: boolean;
  /** How much more cash is needed. Zero when affordable. */
  shortfall: number;
};

export function canAfford(balance: number, cost: number): AffordabilityCheck {
  const available = availableInvestmentCash(balance);
  const needed = roundMoney(Math.max(0, Number(cost) || 0));
  if (needed <= available) return { ok: true, shortfall: 0 };
  return { ok: false, shortfall: roundMoney(needed - available) };
}

/** Cash a holding consumes. `Holding` stores no cost, so it is derived. */
export function holdingPurchaseAmount(
  quantity: number,
  averageBuyPrice: number
): number {
  const qty = Number(quantity) || 0;
  const price = Number(averageBuyPrice) || 0;
  if (qty <= 0 || price <= 0) return 0;
  return roundMoney(qty * price);
}

export type InvestmentCashActivity = {
  entry: InvestmentCashEntry;
  /** Signed, so the row can render +/- without re-deriving the direction. */
  delta: number;
  /** Balance immediately after this entry. */
  runningBalance: number;
};

/**
 * History rows, newest first, each carrying the balance as of that entry.
 *
 * Mirrors what `buildAccountActivities` does for a bank account in
 * `shared/utils/accountBalance.ts`, so the cash history screen reads the same way
 * the account detail screen does.
 */
export function buildInvestmentCashActivities(
  baseline: InvestmentCashBaseline | undefined | null,
  entries: InvestmentCashEntry[]
): InvestmentCashActivity[] {
  const ordered = sortEntriesChronologically(dedupeEntries(entries));
  let running = baselineAmount(baseline);
  const rows: InvestmentCashActivity[] = ordered.map((entry) => {
    const delta = signedAmount(entry);
    running = roundMoney(running + delta);
    return { entry, delta, runningBalance: running };
  });
  return rows.reverse();
}

const ENTRY_LABELS: Record<InvestmentCashEntryType, string> = {
  TOP_UP: "Transfer In / Top Up",
  WITHDRAWAL: "Withdrawal to Bank",
  PURCHASE: "Stock/ETF Purchase",
  SALE: "Stock/ETF Sale",
  ADJUSTMENT: "Manual Adjustment",
  REVERSAL: "Refund / Reversal",
};

export function investmentCashEntryLabel(entry: InvestmentCashEntry): string {
  return ENTRY_LABELS[entry.type] ?? "Cash Movement";
}

/** The line under the title: the reason for an adjustment, else the note. */
export function investmentCashEntryDetail(entry: InvestmentCashEntry): string {
  if (entry.type === "ADJUSTMENT" && entry.reason?.trim()) return entry.reason.trim();
  if (entry.note?.trim()) return entry.note.trim();
  if (entry.symbol) return entry.symbol;
  return "";
}

export type InvestmentCashFilter =
  | "all"
  | "top_ups"
  | "purchases"
  | "sales"
  | "adjustments";

const FILTER_TYPES: Record<InvestmentCashFilter, InvestmentCashEntryType[] | null> = {
  all: null,
  top_ups: ["TOP_UP", "WITHDRAWAL"],
  purchases: ["PURCHASE"],
  sales: ["SALE"],
  adjustments: ["ADJUSTMENT", "REVERSAL"],
};

export function filterInvestmentCashActivities(
  activities: InvestmentCashActivity[],
  filter: InvestmentCashFilter
): InvestmentCashActivity[] {
  const types = FILTER_TYPES[filter];
  if (!types) return activities;
  return activities.filter((row) => types.includes(row.entry.type));
}

/** How close two adjustments must be, in ms, to be treated as an accidental repeat. */
export const DUPLICATE_ADJUSTMENT_WINDOW_MS = 60_000;

/**
 * Finds an adjustment that looks like the one about to be written.
 *
 * A double-tap that lands two distinct doc ids cannot be caught by the
 * write-level idempotency key, so the same amount, direction and reason arriving
 * within a minute is worth a confirmation.
 */
export function findRecentDuplicateAdjustment(
  entries: InvestmentCashEntry[],
  candidate: { amount: number; direction: "credit" | "debit"; reason: string },
  now: number,
  windowMs: number = DUPLICATE_ADJUSTMENT_WINDOW_MS
): InvestmentCashEntry | null {
  const reason = candidate.reason.trim().toLowerCase();
  const amount = roundMoney(candidate.amount);
  return (
    entries.find(
      (entry) =>
        entry.type === "ADJUSTMENT" &&
        entry.direction === candidate.direction &&
        roundMoney(entry.amount) === amount &&
        (entry.reason ?? "").trim().toLowerCase() === reason &&
        now - (entry.createdAtMs ?? 0) <= windowMs
    ) ?? null
  );
}

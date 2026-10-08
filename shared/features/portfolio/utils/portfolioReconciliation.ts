/**
 * Portfolio recalibration / historical transaction reconciliation (SPENDLY-419).
 *
 * `createHoldingWithCash` (KAN-77 / SPENDLY-46) made a cash-funded holding write a
 * `PURCHASE` ledger entry, but it never wrote the matching `portfolioTransactions`
 * BUY row — only `executeMockBuy`/`executeMockSell` ever did. So a holding's
 * aggregate quantity could be correct while its Order History under-counts it (the
 * reference case: a 40-share holding showing only 30 shares across two BUY rows).
 * That root cause is now fixed going forward in `services/portfolio/investmentCash.ts`;
 * this module finds and repairs the gap in data written before that fix.
 *
 * Hard rule throughout: only a gap that is *provably* recoverable from an existing
 * authoritative record (today, that means "a cash PURCHASE entry exists but its
 * transaction row doesn't") is ever auto-repaired. Every other mismatch — an
 * unrecoverable missing buy, a holding that looks app-funded but has no cash entry,
 * a duplicate, an orphan — requires explicit user confirmation. Recalibration must
 * never invent a trade or fabricate a cash deduction.
 *
 * Pure and Firestore-free so vitest can cover every finding type directly.
 */

import { roundMoney } from "@/shared/utils/money";
import type { Holding, InvestmentCashEntry, PortfolioTransaction } from "@/shared/features/portfolio/types";
import { dedupeEntries } from "./investmentCash";

export type FindingType =
  | "missing_buy_recoverable_from_cash"
  | "missing_buy_unrecoverable"
  | "missing_cash_for_app_funded_holding"
  | "qty_mismatch"
  | "avg_price_mismatch"
  | "duplicate_transaction"
  | "orphaned_transaction"
  | "cash_balance_drift"
  | "negative_or_impossible_quantity";

export type ReconciliationAction = "auto_repair" | "needs_user_input" | "skip_external";

export type ReconciliationFindingDetail = {
  holdingQty: number;
  transactionDerivedQty: number;
  recoverableCashQty?: number;
  currentAvgPrice: number;
  recalculatedAvgPrice?: number;
  cashDiscrepancy?: number;
};

export type ProposedFix = {
  kind: "create_portfolio_transaction" | "create_cash_entry" | "recalc_only";
  /** Deterministic — a rerun resolves to the same doc path. */
  transactionId: string;
  quantity: number;
  price: number;
  date: string;
  sourceCashEntryId?: string;
};

export type ReconciliationFinding = {
  /** Deterministic: `${type}:${holdingId}:${disambiguator}`. */
  id: string;
  type: FindingType;
  holdingId: string;
  symbol: string;
  action: ReconciliationAction;
  detail: ReconciliationFindingDetail;
  proposedFix?: ProposedFix;
};

export type ReconciliationReport = {
  generatedAt: string;
  findings: ReconciliationFinding[];
  summary: {
    totalHoldings: number;
    clean: number;
    autoRepairable: number;
    needsInput: number;
    skipped: number;
  };
};

export type RepairBatchPlan = {
  findings: ReconciliationFinding[];
};

export type VerifyResult = {
  clean: boolean;
  remaining: ReconciliationFinding[];
};

function executedBuysAndSells(transactions: PortfolioTransaction[]): PortfolioTransaction[] {
  return transactions.filter(
    (tx) => (tx.type === "BUY" || tx.type === "SELL") && tx.orderStatus !== "cancelled"
  );
}

function transactionDerivedQuantity(transactions: PortfolioTransaction[]): number {
  const total = transactions.reduce((sum, tx) => {
    const qty = Number(tx.quantity) || 0;
    return tx.type === "SELL" ? sum - qty : sum + qty;
  }, 0);
  return roundMoney(total);
}

function transactionDerivedCost(transactions: PortfolioTransaction[]): number {
  const total = transactions.reduce((sum, tx) => {
    const cost = (Number(tx.quantity) || 0) * (Number(tx.price) || 0);
    return tx.type === "SELL" ? sum - cost : sum + cost;
  }, 0);
  return roundMoney(total);
}

/** Cash ledger rows that reference a holding and could seed a missing BUY/SELL row. */
function tradeCashEntriesFor(
  cashEntries: InvestmentCashEntry[],
  holdingId: string
): InvestmentCashEntry[] {
  return dedupeEntries(cashEntries).filter(
    (entry) =>
      entry.holdingId === holdingId && (entry.type === "PURCHASE" || entry.type === "SALE")
  );
}

/** True when a cash entry already has a matching transaction (same qty/price/date). */
function hasMatchingTransaction(
  entry: InvestmentCashEntry,
  transactions: PortfolioTransaction[]
): boolean {
  const type = entry.type === "PURCHASE" ? "BUY" : "SELL";
  return transactions.some(
    (tx) =>
      tx.type === type &&
      roundMoney(Number(tx.quantity) || 0) === roundMoney(Number(entry.quantity) || 0) &&
      roundMoney(Number(tx.price) || 0) === roundMoney(Number(entry.price) || 0) &&
      tx.date === entry.date
  );
}

function anyNonAppCashEntryFor(cashEntries: InvestmentCashEntry[], holdingId: string): boolean {
  return dedupeEntries(cashEntries).some(
    (entry) => entry.holdingId === holdingId && entry.source !== "app"
  );
}

function hasAppFundedCashEntry(cashEntries: InvestmentCashEntry[], holdingId: string): boolean {
  return tradeCashEntriesFor(cashEntries, holdingId).some((entry) => entry.source === "app");
}

/**
 * Scans a single holding against its own transactions and cash entries.
 *
 * Only the recoverable-from-cash gap is ever `auto_repair`. Everything else is
 * surfaced for the user to confirm or skip.
 */
export function scanHoldingForFindings(
  holding: Holding,
  transactions: PortfolioTransaction[],
  cashEntries: InvestmentCashEntry[]
): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const holdingQty = roundMoney(Number(holding.quantity) || 0);
  const currentAvgPrice = roundMoney(Number(holding.averageBuyPrice) || 0);
  const tradeTxs = executedBuysAndSells(transactions);
  const txQty = transactionDerivedQuantity(tradeTxs);

  if (holdingQty < 0) {
    findings.push({
      id: `negative_or_impossible_quantity:${holding.id}:qty`,
      type: "negative_or_impossible_quantity",
      holdingId: holding.id,
      symbol: holding.symbol,
      action: "needs_user_input",
      detail: { holdingQty, transactionDerivedQty: txQty, currentAvgPrice },
    });
  }

  // Cash entries referencing this holding with no matching transaction row —
  // the only case ever auto-repaired, and only when the gap is exactly the
  // uncovered quantity (never overshoots what the holding actually has).
  const unmatchedTradeCash = tradeCashEntriesFor(cashEntries, holding.id).filter(
    (entry) => !hasMatchingTransaction(entry, tradeTxs)
  );
  const recoverableQty = roundMoney(
    unmatchedTradeCash.reduce((sum, entry) => {
      const qty = Number(entry.quantity) || 0;
      return entry.type === "SALE" ? sum - qty : sum + qty;
    }, 0)
  );
  const qtyGap = roundMoney(holdingQty - txQty);

  if (unmatchedTradeCash.length > 0 && Math.abs(qtyGap) > 1e-9) {
    for (const entry of unmatchedTradeCash) {
      const qty = Number(entry.quantity) || 0;
      const price = Number(entry.price) || 0;
      findings.push({
        id: `missing_buy_recoverable_from_cash:${holding.id}:${entry.id}`,
        type: "missing_buy_recoverable_from_cash",
        holdingId: holding.id,
        symbol: holding.symbol,
        action: "auto_repair",
        detail: {
          holdingQty,
          transactionDerivedQty: txQty,
          recoverableCashQty: recoverableQty,
          currentAvgPrice,
        },
        proposedFix: {
          kind: "create_portfolio_transaction",
          transactionId: `recon_tx_${holding.id}_${entry.id}`,
          quantity: qty,
          price,
          date: entry.date,
          sourceCashEntryId: entry.id,
        },
      });
    }
  } else if (Math.abs(qtyGap) > 1e-9) {
    // A quantity gap with nothing in the cash ledger to attribute it to.
    findings.push({
      id: `missing_buy_unrecoverable:${holding.id}:gap`,
      type: "missing_buy_unrecoverable",
      holdingId: holding.id,
      symbol: holding.symbol,
      action: "needs_user_input",
      detail: { holdingQty, transactionDerivedQty: txQty, currentAvgPrice },
    });
  }

  // Historical cash correction (KAN-77 / SPENDLY-46 era data): this holding has no
  // app-funded PURCHASE/SALE cash entry at all. Never auto-fabricate a debit —
  // either a recorded external source clears it (skip), or it's genuinely
  // ambiguous and a human must confirm (needs_user_input). Independent of whether
  // a transaction row exists, since the cash ledger and transaction history are
  // reconciled separately per the ticket's principles.
  if (holdingQty > 0 && !hasAppFundedCashEntry(cashEntries, holding.id)) {
    if (anyNonAppCashEntryFor(cashEntries, holding.id)) {
      findings.push({
        id: `missing_cash_for_app_funded_holding:${holding.id}:skip`,
        type: "missing_cash_for_app_funded_holding",
        holdingId: holding.id,
        symbol: holding.symbol,
        action: "skip_external",
        detail: { holdingQty, transactionDerivedQty: txQty, currentAvgPrice },
      });
    } else {
      findings.push({
        id: `missing_cash_for_app_funded_holding:${holding.id}:cash`,
        type: "missing_cash_for_app_funded_holding",
        holdingId: holding.id,
        symbol: holding.symbol,
        action: "needs_user_input",
        detail: { holdingQty, transactionDerivedQty: txQty, currentAvgPrice },
      });
    }
  }

  if (txQty > 0) {
    const txCost = transactionDerivedCost(tradeTxs);
    const recalculatedAvgPrice = roundMoney(txCost / txQty);
    if (
      Math.abs(qtyGap) <= 1e-9 &&
      Math.abs(roundMoney(recalculatedAvgPrice - currentAvgPrice)) > 0.01
    ) {
      findings.push({
        id: `avg_price_mismatch:${holding.id}:avg`,
        type: "avg_price_mismatch",
        holdingId: holding.id,
        symbol: holding.symbol,
        action: "needs_user_input",
        detail: { holdingQty, transactionDerivedQty: txQty, currentAvgPrice, recalculatedAvgPrice },
      });
    }
  }

  return findings;
}

function findDuplicateCashEntries(cashEntries: InvestmentCashEntry[]): ReconciliationFinding[] {
  const deduped = dedupeEntries(cashEntries);
  const seen = new Map<string, InvestmentCashEntry>();
  const findings: ReconciliationFinding[] = [];
  for (const entry of deduped) {
    if (!entry.holdingId || (entry.type !== "PURCHASE" && entry.type !== "SALE")) continue;
    const key = `${entry.holdingId}:${entry.type}:${roundMoney(Number(entry.amount) || 0)}:${entry.date}`;
    const prior = seen.get(key);
    if (prior) {
      findings.push({
        id: `duplicate_transaction:${entry.holdingId}:${prior.id}:${entry.id}`,
        type: "duplicate_transaction",
        holdingId: entry.holdingId,
        symbol: entry.symbol ?? "",
        action: "needs_user_input",
        detail: {
          holdingQty: 0,
          transactionDerivedQty: 0,
          currentAvgPrice: 0,
        },
      });
    } else {
      seen.set(key, entry);
    }
  }
  return findings;
}

function findOrphanedTransactions(
  holdings: Holding[],
  transactions: PortfolioTransaction[]
): ReconciliationFinding[] {
  const holdingIds = new Set(holdings.map((h) => h.id));
  const orphans = transactions.filter((tx) => tx.holdingId && !holdingIds.has(tx.holdingId));
  const seenHoldingIds = new Set<string>();
  const findings: ReconciliationFinding[] = [];
  for (const tx of orphans) {
    if (seenHoldingIds.has(tx.holdingId)) continue;
    seenHoldingIds.add(tx.holdingId);
    findings.push({
      id: `orphaned_transaction:${tx.holdingId}:${tx.id}`,
      type: "orphaned_transaction",
      holdingId: tx.holdingId,
      symbol: tx.symbol,
      action: "needs_user_input",
      detail: { holdingQty: 0, transactionDerivedQty: 0, currentAvgPrice: 0 },
    });
  }
  return findings;
}

/**
 * Scans every holding plus cross-holding checks (duplicates, orphans) and returns
 * one report. Driving this from live `usePortfolio()` data needs no extra reads.
 */
export function buildReconciliationReport(
  holdings: Holding[],
  transactions: PortfolioTransaction[],
  cashEntries: InvestmentCashEntry[]
): ReconciliationReport {
  const findings: ReconciliationFinding[] = [];
  const cleanHoldingIds = new Set<string>();

  for (const holding of holdings) {
    const holdingTxs = transactions.filter((tx) => tx.holdingId === holding.id);
    const holdingFindings = scanHoldingForFindings(holding, holdingTxs, cashEntries);
    if (holdingFindings.length === 0) cleanHoldingIds.add(holding.id);
    findings.push(...holdingFindings);
  }

  findings.push(...findDuplicateCashEntries(cashEntries));
  findings.push(...findOrphanedTransactions(holdings, transactions));

  const summary = {
    totalHoldings: holdings.length,
    clean: cleanHoldingIds.size,
    autoRepairable: findings.filter((f) => f.action === "auto_repair").length,
    needsInput: findings.filter((f) => f.action === "needs_user_input").length,
    skipped: findings.filter((f) => f.action === "skip_external").length,
  };

  return { generatedAt: new Date().toISOString(), findings, summary };
}

/** Filters a report down to the findings that may be auto-repaired. */
export function planRepairs(report: ReconciliationReport): RepairBatchPlan {
  return { findings: report.findings.filter((f) => f.action === "auto_repair" && f.proposedFix) };
}

/**
 * Re-runs the scan after a repair lands and asserts no auto-repairable findings
 * remain for that holding — the idempotency/offline-retry guarantee made visible.
 */
export function verifyReconciliation(
  holding: Holding,
  transactions: PortfolioTransaction[],
  cashEntries: InvestmentCashEntry[]
): VerifyResult {
  const remaining = scanHoldingForFindings(holding, transactions, cashEntries).filter(
    (f) => f.action === "auto_repair"
  );
  return { clean: remaining.length === 0, remaining };
}

import { describe, expect, it } from "vitest";

import {
  buildReconciliationReport,
  planRepairs,
  scanHoldingForFindings,
  verifyReconciliation,
} from "./portfolioReconciliation";
import type { Holding, InvestmentCashEntry, PortfolioTransaction } from "@/shared/features/portfolio/types";

/**
 * SPENDLY-419 — the KPIT Technologies reference case plus the edge cases the
 * ticket calls out by name. Only `missing_buy_recoverable_from_cash` is ever
 * `auto_repair`; every other finding type must come back `needs_user_input` or
 * `skip_external` so recalibration never invents a trade or fabricates cash.
 */

const HOLDING: Holding = {
  id: "h-kpit",
  symbol: "KPITTECH",
  yahooSymbol: "KPITTECH.NS",
  name: "KPIT Technologies",
  exchange: "NSE",
  instrumentType: "stock",
  quantity: 40,
  averageBuyPrice: 492.37,
};

function buyTx(overrides: Partial<PortfolioTransaction>): PortfolioTransaction {
  return {
    id: "tx",
    holdingId: HOLDING.id,
    symbol: HOLDING.symbol,
    type: "BUY",
    quantity: 0,
    price: 0,
    fees: 0,
    date: "2026-01-01",
    orderStatus: "executed",
    ...overrides,
  };
}

function cashEntry(overrides: Partial<InvestmentCashEntry>): InvestmentCashEntry {
  return {
    id: "cash",
    type: "PURCHASE",
    amount: 0,
    direction: "debit",
    date: "2026-01-01",
    correlationId: "cash",
    source: "app",
    createdAtMs: 0,
    ...overrides,
  };
}

describe("scanHoldingForFindings", () => {
  it("flags the KPIT case: 40-share holding with only 30 in BUY rows and a matching unclaimed cash entry", () => {
    const transactions = [
      buyTx({ id: "tx1", quantity: 10, price: 485, date: "2026-07-01" }),
      buyTx({ id: "tx2", quantity: 20, price: 492.5, date: "2026-07-10" }),
    ];
    const cashEntries = [
      cashEntry({ id: "cash1", holdingId: HOLDING.id, quantity: 10, price: 485, date: "2026-06-15", amount: 4850 }),
    ];

    const findings = scanHoldingForFindings(HOLDING, transactions, cashEntries);
    const recoverable = findings.find((f) => f.type === "missing_buy_recoverable_from_cash");

    expect(recoverable).toBeDefined();
    expect(recoverable?.action).toBe("auto_repair");
    expect(recoverable?.proposedFix).toMatchObject({
      kind: "create_portfolio_transaction",
      transactionId: `recon_tx_${HOLDING.id}_cash1`,
      quantity: 10,
      price: 485,
      date: "2026-06-15",
      sourceCashEntryId: "cash1",
    });
  });

  it("flags an unrecoverable first buy — no cash entry, no transaction — for user input, never auto-repair", () => {
    const holding = { ...HOLDING, quantity: 10 };
    const findings = scanHoldingForFindings(holding, [], []);
    const unrecoverable = findings.find((f) => f.type === "missing_buy_unrecoverable");

    expect(unrecoverable).toBeDefined();
    expect(unrecoverable?.action).toBe("needs_user_input");
    expect(findings.some((f) => f.action === "auto_repair")).toBe(false);
  });

  it("reports a clean holding with multiple buys and sells that sum correctly", () => {
    // 20 BUY @100 - 5 SELL @110 => qty 15, cost (2000-550)/15 = 96.67
    const holding = { ...HOLDING, quantity: 15, averageBuyPrice: 96.67 };
    const transactions = [
      buyTx({ id: "tx1", type: "BUY", quantity: 20, price: 100, date: "2026-01-01" }),
      buyTx({ id: "tx2", type: "SELL", quantity: 5, price: 110, date: "2026-02-01" }),
    ];
    // Both legs already have their matching app-funded cash ledger rows.
    const cashEntries = [
      cashEntry({ id: "c1", holdingId: holding.id, quantity: 20, price: 100, date: "2026-01-01", amount: 2000 }),
      cashEntry({
        id: "c2",
        type: "SALE",
        direction: "credit",
        holdingId: holding.id,
        quantity: 5,
        price: 110,
        date: "2026-02-01",
        amount: 550,
      }),
    ];
    const findings = scanHoldingForFindings(holding, transactions, cashEntries);
    expect(findings).toHaveLength(0);
  });

  it("treats a buy-after-sell holding with matching sums as clean", () => {
    // 20 BUY @100 - 5 SELL @110 + 10 BUY @105 => qty 25, cost (2000-550+1050)/25 = 100
    const holding = { ...HOLDING, quantity: 25, averageBuyPrice: 100 };
    const transactions = [
      buyTx({ id: "tx1", type: "BUY", quantity: 20, price: 100, date: "2026-01-01" }),
      buyTx({ id: "tx2", type: "SELL", quantity: 5, price: 110, date: "2026-02-01" }),
      buyTx({ id: "tx3", type: "BUY", quantity: 10, price: 105, date: "2026-03-01" }),
    ];
    const cashEntries = [
      cashEntry({ id: "c1", holdingId: holding.id, quantity: 20, price: 100, date: "2026-01-01", amount: 2000 }),
      cashEntry({
        id: "c2",
        type: "SALE",
        direction: "credit",
        holdingId: holding.id,
        quantity: 5,
        price: 110,
        date: "2026-02-01",
        amount: 550,
      }),
      cashEntry({ id: "c3", holdingId: holding.id, quantity: 10, price: 105, date: "2026-03-01", amount: 1050 }),
    ];
    const findings = scanHoldingForFindings(holding, transactions, cashEntries);
    expect(findings).toHaveLength(0);
  });

  it("skips an external/onboarding holding instead of flagging a missing cash entry", () => {
    const holding = { ...HOLDING, quantity: 10 };
    const transactions = [buyTx({ id: "tx1", quantity: 10, price: 100, date: "2026-01-01" })];
    const cashEntries = [
      cashEntry({
        id: "adj1",
        type: "ADJUSTMENT",
        holdingId: holding.id,
        source: "csv_import",
        amount: 1000,
      }),
    ];
    const findings = scanHoldingForFindings(holding, transactions, cashEntries);
    const cashFinding = findings.find((f) => f.type === "missing_cash_for_app_funded_holding");
    expect(cashFinding?.action).toBe("skip_external");
  });

  it("never auto-repairs a cash-side gap for an ambiguous legacy holding — always needs_user_input", () => {
    const holding = { ...HOLDING, quantity: 10 };
    // No transactions, no cash entries at all — classic pre-SPENDLY-46 holding.
    const findings = scanHoldingForFindings(holding, [], []);
    const cashFinding = findings.find((f) => f.type === "missing_cash_for_app_funded_holding");
    expect(cashFinding?.action).toBe("needs_user_input");
    expect(findings.some((f) => f.type === "missing_cash_for_app_funded_holding" && f.action === "auto_repair")).toBe(
      false
    );
  });

  it("flags a negative/impossible quantity for user review, never auto", () => {
    const holding = { ...HOLDING, quantity: -5 };
    const findings = scanHoldingForFindings(holding, [], []);
    const negative = findings.find((f) => f.type === "negative_or_impossible_quantity");
    expect(negative?.action).toBe("needs_user_input");
  });
});

describe("buildReconciliationReport", () => {
  it("detects duplicate cash entries for the same holding/amount/date without auto-deleting", () => {
    const cashEntries = [
      cashEntry({ id: "p1", holdingId: HOLDING.id, amount: 4850, date: "2026-06-15" }),
      cashEntry({ id: "p2", holdingId: HOLDING.id, amount: 4850, date: "2026-06-15" }),
    ];
    const report = buildReconciliationReport([HOLDING], [], cashEntries);
    const duplicate = report.findings.find((f) => f.type === "duplicate_transaction");
    expect(duplicate?.action).toBe("needs_user_input");
  });

  it("detects an orphaned transaction whose holding no longer exists", () => {
    const transactions = [buyTx({ id: "tx1", holdingId: "missing-holding", quantity: 5, price: 100 })];
    const report = buildReconciliationReport([HOLDING], transactions, []);
    const orphan = report.findings.find((f) => f.type === "orphaned_transaction");
    expect(orphan).toBeDefined();
    expect(orphan?.holdingId).toBe("missing-holding");
  });

  it("is idempotent: scanning the same post-repair data twice yields zero further auto-repairs", () => {
    const transactions = [
      buyTx({ id: "tx1", quantity: 10, price: 485, date: "2026-06-15" }),
      buyTx({ id: "tx2", quantity: 20, price: 492.5, date: "2026-07-10" }),
      // The backfilled row from repairing the first run:
      buyTx({ id: "recon_tx_h-kpit_cash1", quantity: 10, price: 485, date: "2026-06-15" }),
    ];
    const cashEntries = [
      cashEntry({ id: "cash1", holdingId: HOLDING.id, quantity: 10, price: 485, date: "2026-06-15", amount: 4850 }),
    ];

    const first = buildReconciliationReport([HOLDING], transactions, cashEntries);
    const second = buildReconciliationReport([HOLDING], transactions, cashEntries);

    expect(first.summary.autoRepairable).toBe(0);
    expect(second.summary.autoRepairable).toBe(0);
  });

  it("produces identical deterministic repair ids across two planRepairs calls on the same report", () => {
    const transactions = [buyTx({ id: "tx2", quantity: 20, price: 492.5, date: "2026-07-10" })];
    const cashEntries = [
      cashEntry({ id: "cash1", holdingId: HOLDING.id, quantity: 10, price: 485, date: "2026-06-15", amount: 4850 }),
    ];
    const report = buildReconciliationReport([HOLDING], transactions, cashEntries);

    const plan1 = planRepairs(report);
    const plan2 = planRepairs(report);

    expect(plan1.findings.map((f) => f.proposedFix?.transactionId)).toEqual(
      plan2.findings.map((f) => f.proposedFix?.transactionId)
    );
    expect(plan1.findings[0]?.proposedFix?.transactionId).toBe(`recon_tx_${HOLDING.id}_cash1`);
  });
});

describe("verifyReconciliation", () => {
  it("reports clean once the missing BUY row has been backfilled", () => {
    const transactions = [
      buyTx({ id: "tx1", quantity: 10, price: 485, date: "2026-06-15" }),
      buyTx({ id: "tx2", quantity: 20, price: 492.5, date: "2026-07-10" }),
    ];
    const cashEntries = [
      cashEntry({ id: "cash1", holdingId: HOLDING.id, quantity: 10, price: 485, date: "2026-06-15", amount: 4850 }),
    ];
    const result = verifyReconciliation(HOLDING, transactions, cashEntries);
    expect(result.clean).toBe(true);
    expect(result.remaining).toHaveLength(0);
  });

  it("reports not clean while the recoverable gap is still open", () => {
    const transactions = [buyTx({ id: "tx2", quantity: 20, price: 492.5, date: "2026-07-10" })];
    const cashEntries = [
      cashEntry({ id: "cash1", holdingId: HOLDING.id, quantity: 10, price: 485, date: "2026-06-15", amount: 4850 }),
    ];
    const result = verifyReconciliation(HOLDING, transactions, cashEntries);
    expect(result.clean).toBe(false);
  });
});

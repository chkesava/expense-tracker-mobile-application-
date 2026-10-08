import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the KAN-77 write path.
 *
 * Adding a holding used to write the holding and nothing else, leaving money that
 * had already been spent sitting in the Investment Cash Balance. These tests drive
 * the real services against a fake Firestore and assert the three properties the
 * ticket turns on: the deduction happens in the *same* batch as the holding, a
 * retry with the same id cannot deduct twice, and recording an externally-bought
 * holding moves no cash at all.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown>; merge: boolean };

const fakeDoc = (_db: unknown, ...segments: string[]): FakeRef => ({
  path: segments.join("/"),
});

let settingsData: Record<string, unknown> | null = null;

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  collection: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  getDoc: vi.fn(async () => ({
    exists: () => settingsData !== null,
    data: () => settingsData ?? undefined,
  })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirestoreDb: () => ({ __db: true }),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => {
    await fn();
    return "acked";
  },
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({
  newId: () => `id-${++idCounter}`,
}));

import { getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";

import {
  applyReconciliationRepairs,
  createHoldingWithCash,
  deleteHoldingWithOptionalRefund,
  ensureCashBaseline,
  executeMockBuy,
  overwriteHoldingsPreservingIds,
  readAvailableInvestmentCash,
  recordInvestmentCashAdjustment,
  recordInvestmentCashEntry,
  reverseInvestmentCashEntry,
  transferInvestmentCashWithBank,
} from "./investmentCash";
import type { ReconciliationFinding, RepairBatchPlan } from "@/shared/features/portfolio/utils/portfolioReconciliation";

let writes: Write[] = [];
let deletes: string[] = [];
let commits = 0;

function installBatchRecorder() {
  vi.mocked(writeBatch).mockImplementation(
    () =>
      ({
        set: (ref: FakeRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          writes.push({ path: ref.path, data, merge: options?.merge === true });
        },
        update: (ref: FakeRef, data: Record<string, unknown>) => {
          writes.push({ path: ref.path, data, merge: true });
        },
        delete: (ref: FakeRef) => {
          deletes.push(ref.path);
        },
        commit: async () => {
          commits += 1;
        },
      }) as never
  );
}

const HOLDING = {
  symbol: "INFY",
  yahooSymbol: "INFY.NS",
  name: "Infosys",
  exchange: "NSE" as const,
  instrumentType: "stock" as const,
  quantity: 12,
  averageBuyPrice: 500,
};

function pathsUnder(collectionName: string) {
  return writes.filter((write) => write.path.includes(`/${collectionName}/`));
}

beforeEach(() => {
  writes = [];
  deletes = [];
  commits = 0;
  idCounter = 0;
  settingsData = null;
  vi.clearAllMocks();
  installBatchRecorder();
});

describe("createHoldingWithCash", () => {
  it("writes the holding, the purchase entry and the cache in one batch", async () => {
    const result = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });

    expect(commits).toBe(1);
    expect(result.entryId).not.toBeNull();

    const holdingWrite = writes.find((w) => w.path.includes("/holdings/"));
    expect(holdingWrite?.path).toBe(`users/u1/holdings/${result.holdingId}`);
    expect(holdingWrite?.data).toMatchObject({ symbol: "INFY", quantity: 12, profileId: result.profileId });

    const profileWrite = pathsUnder("stockProfiles")[0];
    expect(profileWrite.path).toBe(`users/u1/stockProfiles/${result.profileId}`);
    expect(profileWrite.data).toMatchObject({
      symbol: "INFY",
      yahooSymbol: "INFY.NS",
      name: "Infosys",
      exchange: "NSE",
      instrumentType: "stock",
      status: "active",
    });
    expect(profileWrite.merge).toBe(true);

    const entryWrite = pathsUnder("investmentCashTransactions")[0];
    expect(entryWrite.path).toBe(`users/u1/investmentCashTransactions/${result.entryId}`);
    expect(entryWrite.data).toMatchObject({
      type: "PURCHASE",
      direction: "debit",
      amount: 6000,
      date: "2026-09-11",
      holdingId: result.holdingId,
      symbol: "INFY",
      correlationId: result.entryId,
      source: "app",
    });
  });

  it("decrements the scalar cache by the purchase amount", async () => {
    await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });

    const settingsWrite = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settingsWrite?.data.cashBalance).toEqual({ __increment: -6000 });
    expect(settingsWrite?.merge).toBe(true);
  });

  it("moves no cash for a holding bought outside the app, but still writes its BUY row", async () => {
    const result = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "external",
      purchaseAmount: 6000,
      date: "2026-09-11",
      source: "csv_import",
    });

    expect(result.entryId).toBeNull();
    expect(pathsUnder("investmentCashTransactions")).toHaveLength(0);
    expect(writes.filter((w) => w.path.includes("/portfolioSettings/"))).toHaveLength(0);
    expect(writes).toHaveLength(3);

    const txWrite = pathsUnder("portfolioTransactions")[0];
    expect(txWrite.path).toBe(`users/u1/portfolioTransactions/${result.transactionId}`);
    expect(txWrite.data).toMatchObject({
      holdingId: result.holdingId,
      profileId: result.profileId,
      symbol: "INFY",
      type: "BUY",
      quantity: 12,
      price: 500,
      orderStatus: "executed",
    });
  });

  it("writes a BUY transaction row alongside the cash entry for a cash-funded holding (SPENDLY-419 root-cause fix)", async () => {
    const result = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });

    const txWrite = pathsUnder("portfolioTransactions")[0];
    expect(txWrite.path).toBe(`users/u1/portfolioTransactions/${result.transactionId}`);
    expect(txWrite.data).toMatchObject({
      holdingId: result.holdingId,
      symbol: "INFY",
      type: "BUY",
      quantity: 12,
      price: 500,
      date: "2026-09-11",
      orderStatus: "executed",
    });
  });

  it("moves no cash for a zero-cost purchase", async () => {
    const result = await createHoldingWithCash("u1", {
      holding: { ...HOLDING, averageBuyPrice: 0 },
      fundingSource: "investment_cash",
      purchaseAmount: 0,
      date: "2026-09-11",
    });

    expect(result.entryId).toBeNull();
    expect(pathsUnder("investmentCashTransactions")).toHaveLength(0);
  });

  // The offline/retry case: the same submit re-sent must not deduct twice or
  // duplicate the BUY row.
  it("targets the same doc paths when retried with the same ids", async () => {
    const ids = { holdingId: "holding-1", entryId: "entry-1", transactionId: "tx-1" };
    const first = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
      ...ids,
    });
    const firstPaths = writes.map((w) => w.path);

    writes = [];
    const second = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
      ...ids,
    });

    expect(second.holdingId).toBe(first.holdingId);
    expect(second.entryId).toBe(first.entryId);
    expect(second.transactionId).toBe(first.transactionId);
    expect(writes.map((w) => w.path)).toEqual(firstPaths);
  });

  it("mints fresh ids when none are supplied", async () => {
    const first = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });
    const second = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });

    expect(second.holdingId).not.toBe(first.holdingId);
    expect(second.entryId).not.toBe(first.entryId);
  });

  it("rejects an unauthenticated caller before writing", async () => {
    await expect(
      createHoldingWithCash("", {
        holding: HOLDING,
        fundingSource: "investment_cash",
        purchaseAmount: 6000,
        date: "2026-09-11",
      })
    ).rejects.toThrow("Not authenticated");
    expect(commits).toBe(0);
  });

  // SPENDLY-420 — the stock profile is reused, never duplicated.
  it("resolves the same profile id for the same instrument across two different holdings", async () => {
    const first = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });
    writes = [];
    const second = await createHoldingWithCash("u1", {
      holding: { ...HOLDING, quantity: 5 },
      fundingSource: "investment_cash",
      purchaseAmount: 2500,
      date: "2026-09-12",
    });

    expect(second.profileId).toBe(first.profileId);
    // Re-merges the same profile doc rather than minting a second one.
    expect(pathsUnder("stockProfiles")).toHaveLength(1);
    expect(pathsUnder("stockProfiles")[0].path).toBe(`users/u1/stockProfiles/${first.profileId}`);
  });

  it("gives two different instruments two different profile ids", async () => {
    const infy = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });
    const kpit = await createHoldingWithCash("u1", {
      holding: { ...HOLDING, symbol: "KPITTECH", yahooSymbol: "KPITTECH.NS", name: "KPIT Technologies" },
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });

    expect(infy.profileId).not.toBe(kpit.profileId);
  });
});

describe("applyReconciliationRepairs", () => {
  function finding(overrides: Partial<ReconciliationFinding> = {}): ReconciliationFinding {
    return {
      id: "missing_buy_recoverable_from_cash:h1:cash1",
      type: "missing_buy_recoverable_from_cash",
      holdingId: "h1",
      symbol: "KPITTECH",
      action: "auto_repair",
      detail: { holdingQty: 40, transactionDerivedQty: 30, currentAvgPrice: 492.37 },
      proposedFix: {
        kind: "create_portfolio_transaction",
        transactionId: "recon_tx_h1_cash1",
        quantity: 10,
        price: 485,
        date: "2026-06-15",
        sourceCashEntryId: "cash1",
      },
      ...overrides,
    };
  }

  it("writes the backfilled BUY row and an audit doc in one batch", async () => {
    const plan: RepairBatchPlan = { findings: [finding()] };
    const result = await applyReconciliationRepairs("u1", plan, "run-1", {
      triggeredBy: "self_service",
      source: "app",
    });

    expect(commits).toBe(1);
    expect(result.auditId).toBe("run-1");

    const txWrite = pathsUnder("portfolioTransactions")[0];
    expect(txWrite.path).toBe("users/u1/portfolioTransactions/recon_tx_h1_cash1");
    expect(txWrite.data).toMatchObject({
      holdingId: "h1",
      symbol: "KPITTECH",
      type: "BUY",
      quantity: 10,
      price: 485,
      date: "2026-06-15",
      orderStatus: "executed",
    });

    const audit = pathsUnder("portfolioReconciliationAudits")[0];
    expect(audit.path).toBe("users/u1/portfolioReconciliationAudits/run-1");
    expect(audit.data).toMatchObject({
      runId: "run-1",
      triggeredBy: "self_service",
      findingsCount: 1,
      repairedCount: 1,
      source: "app",
    });

    // Never touches the cash ledger or the holding itself — only Order History + audit.
    expect(pathsUnder("investmentCashTransactions")).toHaveLength(0);
    expect(pathsUnder("holdings")).toHaveLength(0);
  });

  it("never duplicates a repair when the same plan and runId are retried (offline-retry case)", async () => {
    const plan: RepairBatchPlan = { findings: [finding()] };
    await applyReconciliationRepairs("u1", plan, "run-1", {
      triggeredBy: "self_service",
      source: "app",
    });
    const firstPaths = writes.map((w) => w.path);

    writes = [];
    await applyReconciliationRepairs("u1", plan, "run-1", {
      triggeredBy: "self_service",
      source: "app",
    });

    expect(writes.map((w) => w.path)).toEqual(firstPaths);
  });

  it("skips a finding with no proposed fix without failing the batch", async () => {
    const plan: RepairBatchPlan = { findings: [finding({ proposedFix: undefined })] };
    const result = await applyReconciliationRepairs("u1", plan, "run-2", {
      triggeredBy: "admin_backfill",
      source: "script",
    });

    expect(pathsUnder("portfolioTransactions")).toHaveLength(0);
    const audit = pathsUnder("portfolioReconciliationAudits")[0];
    expect(audit.data).toMatchObject({ findingsCount: 1, repairedCount: 0, skippedCount: 1 });
    expect(result.outcome).toBeDefined();
  });
});

describe("executeMockBuy", () => {
  const EXISTING_HOLDING = {
    symbol: "INFY",
    yahooSymbol: "INFY.NS",
    profileId: "profile_existing",
    quantity: 10,
    averageBuyPrice: 400,
  };

  function mockGetDocByPath(holdingData: Record<string, unknown> | null) {
    return async (ref: FakeRef) => {
      if (ref.path.includes("/holdings/")) {
        return { exists: () => holdingData !== null, data: () => holdingData ?? undefined };
      }
      return { exists: () => settingsData !== null, data: () => settingsData ?? undefined };
    };
  }

  it("buys more into an existing holding using investment cash by default (unchanged behavior)", async () => {
    settingsData = { cashBalance: 10000 };
    vi.mocked(getDoc).mockImplementation(mockGetDocByPath(EXISTING_HOLDING) as never);

    const result = await executeMockBuy("u1", {
      holdingId: "h1",
      quantity: 5,
      price: 420,
      date: "2026-10-08",
    });

    expect(result.cashEntryId).not.toBeNull();
    expect(pathsUnder("investmentCashTransactions")).toHaveLength(1);
    const settingsWrite = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settingsWrite?.data.cashBalance).toEqual({ __increment: -2100 });
  });

  it("buys more into an existing holding with external funding — no cash entry, no balance change, still records the BUY", async () => {
    settingsData = { cashBalance: 0 };
    vi.mocked(getDoc).mockImplementation(mockGetDocByPath(EXISTING_HOLDING) as never);

    const result = await executeMockBuy("u1", {
      holdingId: "h1",
      quantity: 5,
      price: 420,
      date: "2026-10-08",
      fundingSource: "external",
    });

    expect(result.cashEntryId).toBeNull();
    expect(pathsUnder("investmentCashTransactions")).toHaveLength(0);
    expect(writes.some((w) => w.path.includes("/portfolioSettings/"))).toBe(false);

    const txWrite = pathsUnder("portfolioTransactions")[0];
    expect(txWrite.data).toMatchObject({
      holdingId: "h1",
      profileId: "profile_existing",
      type: "BUY",
      quantity: 5,
      price: 420,
    });
  });

  it("stamps the holding's profileId onto the BUY transaction row", async () => {
    settingsData = { cashBalance: 10000 };
    vi.mocked(getDoc).mockImplementation(mockGetDocByPath(EXISTING_HOLDING) as never);

    await executeMockBuy("u1", { holdingId: "h1", quantity: 1, price: 420, date: "2026-10-08" });

    const txWrite = pathsUnder("portfolioTransactions")[0];
    expect(txWrite.data.profileId).toBe("profile_existing");
  });
});

describe("recordInvestmentCashEntry", () => {
  it("credits the cache for money arriving", async () => {
    await recordInvestmentCashEntry(
      "u1",
      { type: "TOP_UP", amount: 10000, direction: "credit", date: "2026-09-09" },
      "entry-1"
    );

    const entry = pathsUnder("investmentCashTransactions")[0];
    expect(entry.path).toBe("users/u1/investmentCashTransactions/entry-1");
    expect(entry.data).toMatchObject({ type: "TOP_UP", amount: 10000, direction: "credit" });

    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.data.cashBalance).toEqual({ __increment: 10000 });
  });

  it("keeps the user's chosen date rather than today", async () => {
    await recordInvestmentCashEntry(
      "u1",
      { type: "TOP_UP", amount: 500, direction: "credit", date: "2026-01-02" },
      "entry-1"
    );
    expect(pathsUnder("investmentCashTransactions")[0].data.date).toBe("2026-01-02");
  });

  it("normalises a negative amount and trusts the direction", async () => {
    await recordInvestmentCashEntry(
      "u1",
      { type: "WITHDRAWAL", amount: -750, direction: "debit", date: "2026-09-09" },
      "entry-1"
    );

    expect(pathsUnder("investmentCashTransactions")[0].data.amount).toBe(750);
    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.data.cashBalance).toEqual({ __increment: -750 });
  });

  it("omits empty optional fields rather than writing undefined", async () => {
    await recordInvestmentCashEntry(
      "u1",
      { type: "TOP_UP", amount: 100, direction: "credit", date: "2026-09-09", note: "   " },
      "entry-1"
    );

    const data = pathsUnder("investmentCashTransactions")[0].data;
    expect("note" in data).toBe(false);
    expect("reason" in data).toBe(false);
    expect("holdingId" in data).toBe(false);
  });
});

describe("transferInvestmentCashWithBank", () => {
  it("writes cash, bank entry and cache in one batch for a bank → Demat transfer", async () => {
    const result = await transferInvestmentCashWithBank("u1", {
      type: "TOP_UP",
      amount: 2500,
      date: "2026-09-17",
      note: "From savings",
      accountId: "bank-1",
      entryId: "cash-1",
      accountEntryId: "bank-entry-1",
    });

    expect(commits).toBe(1);
    expect(result).toMatchObject({
      entryId: "cash-1",
      accountEntryId: "bank-entry-1",
      transferId: "cash-1",
    });

    const cash = pathsUnder("investmentCashTransactions")[0];
    expect(cash.path).toBe("users/u1/investmentCashTransactions/cash-1");
    expect(cash.data).toMatchObject({
      type: "TOP_UP",
      direction: "credit",
      amount: 2500,
      accountId: "bank-1",
      accountEntryId: "bank-entry-1",
      correlationId: "cash-1",
      transferId: "cash-1",
    });

    const bank = pathsUnder("accountEntries")[0];
    expect(bank.path).toBe("users/u1/accountEntries/bank-entry-1");
    expect(bank.data).toMatchObject({
      accountId: "bank-1",
      amount: 2500,
      direction: "debit",
      date: "2026-09-17",
      transferId: "cash-1",
      correlationId: "cash-1",
    });

    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.data.cashBalance).toEqual({ __increment: 2500 });
  });

  it("credits the bank and debits Demat for a Demat → bank withdrawal", async () => {
    await transferInvestmentCashWithBank("u1", {
      type: "WITHDRAWAL",
      amount: 800,
      date: "2026-09-17",
      accountId: "bank-1",
      entryId: "cash-2",
      accountEntryId: "bank-entry-2",
    });

    expect(pathsUnder("investmentCashTransactions")[0].data).toMatchObject({
      type: "WITHDRAWAL",
      direction: "debit",
      amount: 800,
    });
    expect(pathsUnder("accountEntries")[0].data.direction).toBe("credit");
    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.data.cashBalance).toEqual({ __increment: -800 });
  });

  it("targets the same doc paths when retried with the same ids", async () => {
    const ids = { entryId: "cash-1", accountEntryId: "bank-entry-1" };
    await transferInvestmentCashWithBank("u1", {
      type: "TOP_UP",
      amount: 100,
      date: "2026-09-17",
      accountId: "bank-1",
      ...ids,
    });
    const firstPaths = writes.map((w) => w.path);

    writes = [];
    await transferInvestmentCashWithBank("u1", {
      type: "TOP_UP",
      amount: 100,
      date: "2026-09-17",
      accountId: "bank-1",
      ...ids,
    });

    expect(writes.map((w) => w.path)).toEqual(firstPaths);
    expect(commits).toBe(2);
  });

  it("rejects without committing when the batch fails — neither ledger can land alone", async () => {
    vi.mocked(writeBatch).mockImplementation(
      () =>
        ({
          set: (ref: FakeRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
            writes.push({ path: ref.path, data, merge: options?.merge === true });
          },
          commit: async () => {
            throw new Error("leg 2");
          },
        }) as never
    );

    await expect(
      transferInvestmentCashWithBank("u1", {
        type: "TOP_UP",
        amount: 100,
        date: "2026-09-17",
        accountId: "bank-1",
        entryId: "cash-1",
        accountEntryId: "bank-entry-1",
      })
    ).rejects.toThrow("leg 2");
    expect(commits).toBe(0);
  });

  it("refuses a missing bank account or invalid date without writing", async () => {
    await expect(
      transferInvestmentCashWithBank("u1", {
        type: "TOP_UP",
        amount: 100,
        date: "2026-09-17",
        accountId: "  ",
      })
    ).rejects.toThrow("bank account");
    await expect(
      transferInvestmentCashWithBank("u1", {
        type: "TOP_UP",
        amount: 100,
        date: "17-09-2026",
        accountId: "bank-1",
      })
    ).rejects.toThrow("Invalid transfer date");
    expect(commits).toBe(0);
  });
});

describe("recordInvestmentCashAdjustment", () => {
  it("persists the reason and direction", async () => {
    await recordInvestmentCashAdjustment("u1", {
      amount: 6000,
      direction: "debit",
      reason: "  Correcting investment cash not deducted  ",
      date: "2026-09-11",
      entryId: "adj-1",
    });

    const entry = pathsUnder("investmentCashTransactions")[0];
    expect(entry.data).toMatchObject({
      type: "ADJUSTMENT",
      direction: "debit",
      amount: 6000,
      reason: "Correcting investment cash not deducted",
    });
  });

  it("never touches holdings or bank entries", async () => {
    await recordInvestmentCashAdjustment("u1", {
      amount: 6000,
      direction: "debit",
      reason: "Correcting drift",
      date: "2026-09-11",
      entryId: "adj-1",
    });

    expect(writes.some((w) => w.path.includes("/holdings/"))).toBe(false);
    expect(writes.some((w) => w.path.includes("/accountEntries/"))).toBe(false);
  });

  it("refuses an empty or whitespace reason without writing", async () => {
    await expect(
      recordInvestmentCashAdjustment("u1", {
        amount: 6000,
        direction: "debit",
        reason: "   ",
        date: "2026-09-11",
      })
    ).rejects.toThrow("reason");
    expect(commits).toBe(0);
  });

  it("refuses a non-positive amount without writing", async () => {
    await expect(
      recordInvestmentCashAdjustment("u1", {
        amount: 0,
        direction: "debit",
        reason: "Correcting drift",
        date: "2026-09-11",
      })
    ).rejects.toThrow("positive amount");
    expect(commits).toBe(0);
  });
});

describe("reverseInvestmentCashEntry", () => {
  it("credits back a debit and points at the original without editing it", async () => {
    await reverseInvestmentCashEntry(
      "u1",
      { id: "purchase-1", amount: 6000, direction: "debit", symbol: "INFY" },
      { date: "2026-09-12", entryId: "rev-1" }
    );

    const entry = pathsUnder("investmentCashTransactions")[0];
    expect(entry.path).toBe("users/u1/investmentCashTransactions/rev-1");
    expect(entry.data).toMatchObject({
      type: "REVERSAL",
      direction: "credit",
      amount: 6000,
      reversesId: "purchase-1",
    });
    expect(writes.some((w) => w.path.endsWith("/purchase-1"))).toBe(false);
  });
});

describe("deleteHoldingWithOptionalRefund", () => {
  const purchase = {
    id: "p1",
    type: "PURCHASE" as const,
    amount: 10000,
    direction: "debit" as const,
    date: "2026-09-01",
    holdingId: "h1",
    symbol: "INFY",
    correlationId: "p1",
    source: "app" as const,
    createdAtMs: 1,
  };
  const secondBuy = { ...purchase, id: "p2", correlationId: "p2", amount: 5000, createdAtMs: 2 };
  const sale = {
    ...purchase,
    id: "s1",
    correlationId: "s1",
    type: "SALE" as const,
    amount: 4000,
    direction: "credit" as const,
    createdAtMs: 3,
  };

  it("refunds and deletes in the same batch using net outstanding cash", async () => {
    const result = await deleteHoldingWithOptionalRefund("u1", {
      holdingId: "h1",
      refundCash: true,
      date: "2026-09-18",
      symbol: "INFY",
      cashEntries: [purchase, secondBuy, sale],
    });

    expect(commits).toBe(1);
    expect(result.refunded).toBe(11000);
    expect(result.entryId).toBe("rev_hold_h1");
    expect(deletes).toEqual(["users/u1/holdings/h1"]);

    const reversal = pathsUnder("investmentCashTransactions")[0];
    expect(reversal.data).toMatchObject({
      type: "REVERSAL",
      direction: "credit",
      amount: 11000,
      holdingId: "h1",
    });
    const settingsWrite = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settingsWrite?.data.cashBalance).toEqual({ __increment: 11000 });
  });

  it("deletes without touching cash when refund is off", async () => {
    const result = await deleteHoldingWithOptionalRefund("u1", {
      holdingId: "h1",
      refundCash: false,
      date: "2026-09-18",
      cashEntries: [purchase],
    });

    expect(result.refunded).toBe(0);
    expect(result.entryId).toBeNull();
    expect(pathsUnder("investmentCashTransactions")).toHaveLength(0);
    expect(deletes).toEqual(["users/u1/holdings/h1"]);
  });
});

describe("overwriteHoldingsPreservingIds", () => {
  const existing = {
    id: "h1",
    symbol: "INFY",
    yahooSymbol: "INFY.NS",
    name: "Infosys",
    exchange: "NSE" as const,
    instrumentType: "stock" as const,
    quantity: 12,
    averageBuyPrice: 500,
  };

  it("updates the existing id instead of deleting and recreating it", async () => {
    const { id: _id, ...fields } = existing;
    await overwriteHoldingsPreservingIds("u1", {
      existing: [existing],
      nextHoldings: [{ ...fields, quantity: 12 }],
      cashEntries: [],
      date: "2026-09-18",
    });

    expect(deletes).toEqual([]);
    const holdingWrite = writes.find((w) => w.path === "users/u1/holdings/h1");
    expect(holdingWrite?.merge).toBe(true);
    expect(holdingWrite?.data).toMatchObject({ quantity: 12, symbol: "INFY" });
    expect(pathsUnder("investmentCashTransactions")).toHaveLength(0);
  });

  it("writes one ADJUSTMENT when a funded holding's cost basis changes", async () => {
    const { id: _id, ...fields } = existing;
    await overwriteHoldingsPreservingIds("u1", {
      existing: [existing],
      nextHoldings: [{ ...fields, quantity: 14 }],
      cashEntries: [
        {
          id: "p1",
          type: "PURCHASE",
          amount: 6000,
          direction: "debit",
          date: "2026-09-01",
          holdingId: "h1",
          symbol: "INFY",
          correlationId: "p1",
          source: "app",
          createdAtMs: 1,
        },
      ],
      date: "2026-09-18",
    });

    const adj = pathsUnder("investmentCashTransactions")[0];
    expect(adj.path).toBe("users/u1/investmentCashTransactions/csv_adj_h1");
    expect(adj.data).toMatchObject({
      type: "ADJUSTMENT",
      amount: 1000,
      direction: "debit",
      holdingId: "h1",
      source: "csv_import",
    });
    const settingsWrite = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settingsWrite?.data.cashBalance).toEqual({ __increment: -1000 });
  });

  // SPENDLY-420 — CSV import also upserts a Stock Profile per unique instrument.
  it("writes one stock profile for a matched existing holding and attaches its profileId", async () => {
    const { id: _id, ...fields } = existing;
    await overwriteHoldingsPreservingIds("u1", {
      existing: [existing],
      nextHoldings: [{ ...fields, quantity: 14 }],
      cashEntries: [],
      date: "2026-09-18",
    });

    expect(pathsUnder("stockProfiles")).toHaveLength(1);
    const holdingWrite = writes.find((w) => w.path === "users/u1/holdings/h1");
    expect(holdingWrite?.data.profileId).toBe(pathsUnder("stockProfiles")[0].path.split("/").pop());
  });

  it("dedupes two new CSV rows of the same instrument into one profile, two holdings", async () => {
    const infy = {
      symbol: "INFY",
      yahooSymbol: "INFY.NS",
      name: "Infosys",
      exchange: "NSE" as const,
      instrumentType: "stock" as const,
      quantity: 5,
      averageBuyPrice: 1500,
      broker: "Zerodha" as const,
    };
    const infyOtherBroker = { ...infy, broker: "Groww" as const, quantity: 3 };

    await overwriteHoldingsPreservingIds("u1", {
      existing: [],
      nextHoldings: [infy, infyOtherBroker],
      cashEntries: [],
      date: "2026-09-18",
    });

    // planHoldingOverwrite still creates two holding docs (it matches 1:1 by
    // key, so the second row with the same key is itself unmatched against an
    // empty `existing` set) — the profile-level dedup only collapses the
    // *profile* write, not the holding count, which is exactly the point: one
    // reusable profile, independently many positions/lots referencing it.
    expect(pathsUnder("stockProfiles")).toHaveLength(1);
  });
});

describe("ensureCashBaseline", () => {
  it("captures the legacy scalar as the opening balance", async () => {
    settingsData = { cashBalance: 10000 };

    await ensureCashBaseline("u1", 0);

    expect(vi.mocked(setDoc)).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(setDoc).mock.calls[0] as unknown as [unknown, Record<string, any>];
    expect(payload.cashBaseline).toMatchObject({ amount: 10000 });
    expect(payload.cashBalance).toBe(10000);
  });

  it("is a no-op once a baseline exists, so it cannot re-freeze a stale figure", async () => {
    settingsData = {
      cashBalance: 4000,
      cashBaseline: { amount: 10000, capturedAt: "2026-09-01T00:00:00.000Z", capturedAtMs: 0, reason: "x" },
    };

    await ensureCashBaseline("u1", 0);

    expect(vi.mocked(setDoc)).not.toHaveBeenCalled();
  });

  it("falls back to the supplied balance when no settings doc exists yet", async () => {
    settingsData = null;

    await ensureCashBaseline("u1", 2500);

    const [, payload] = vi.mocked(setDoc).mock.calls[0] as unknown as [unknown, Record<string, any>];
    expect(payload.cashBaseline.amount).toBe(2500);
  });
});

describe("readAvailableInvestmentCash", () => {
  it("uses the legacy scalar when no baseline exists yet", async () => {
    settingsData = { cashBalance: 5000 };
    await expect(readAvailableInvestmentCash("u1")).resolves.toBe(5000);
  });

  it("folds the ledger onto the baseline and never goes below zero", async () => {
    settingsData = {
      cashBalance: 1000,
      cashBaseline: {
        amount: 4000,
        capturedAt: "2026-09-01T00:00:00.000Z",
        capturedAtMs: 0,
        reason: "x",
      },
    };
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        {
          id: "e1",
          data: () => ({ type: "PURCHASE", amount: 6000, direction: "debit" }),
        },
      ],
    } as never);

    await expect(readAvailableInvestmentCash("u1")).resolves.toBe(0);
  });
});

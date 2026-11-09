import { describe, expect, it } from "vitest";

import type { Account, Expense, Income } from "../shared/types/expense";
import type { FeeReview } from "../shared/types/fee";
import { classifyFeeRows, detectFees, resolveFeeRows } from "../shared/utils/feeDetection";
import { defaultFeeComponents } from "../shared/utils/feeModel";
import { runLedgerAudit } from "../shared/utils/ledgerAudit";
import {
  LEDGER_HEALTH_DOC,
  SERVER_RESULTS_VERSION,
  feeRowDocs,
  feeRowSetFromDocs,
  ledgerHealthFromDocs,
} from "../shared/utils/serverResults";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import { insightWrites, isCurrent, runInsightsDaily, type InsightInputs, type InsightsPorts } from "./lib/insightsDailyCore";

/** SPENDLY-747: fee rows and the ledger health report, computed on the server. */

const BANK: Account = { id: "hdfc", name: "HDFC Savings", typeId: "t1", accountTypeId: "bank", institutionName: "HDFC Bank" };
const CARD: Account = { id: "card", name: "Regalia", typeId: "t2", accountTypeId: "credit_card", institutionName: "HDFC Bank" };
const exp = (id: string, note: string, amount: number, date = "2026-09-10", accountId = "hdfc", category = "Other"): Expense =>
  ({ id, amount, note, category, subcategory: "Other", date, month: date.slice(0, 7), accountId, createdAt: 1 }) as Expense;
const inc = (id: string, note: string, amount: number, date = "2026-09-12", accountId = "hdfc"): Income =>
  ({ id, amount, note, source: "Other", date, month: date.slice(0, 7), accountId, createdAt: 1 }) as unknown as Income;
const review = (id: string, over: Partial<FeeReview> = {}): FeeReview => ({
  id: `expense__${id}`, sourceKind: "expense", sourceId: id, decision: "confirm", role: "fee", feeType: "atm_cash",
  components: defaultFeeComponents("fee", 20), sourceAmount: 20, revision: 1, createdAtMs: 1, updatedAtMs: 1, ...over,
});
const notFee = (id: string, amount: number) =>
  review(id, { decision: "not_fee", role: "not_fee", components: defaultFeeComponents("not_fee", amount), sourceAmount: amount });

// A ledger with every pairing kind: fee + GST, a reversal, a refund, plain
// spending, a reviewed non-candidate, and a "not a fee" decision.
const EXPENSES = [
  exp("atm", "ATM WDL CHG", 20, "2026-09-01"),
  exp("gst", "IGST ON ATM WDL CHG", 3.6, "2026-09-01"),
  exp("sms", "SMS ALERT CHGS", 15, "2026-09-02"),
  exp("late", "LATE PAYMENT FEE", 500, "2026-09-03", "card"),
  exp("food", "Swiggy dinner", 640, "2026-09-04", "hdfc", "Food"),
  exp("paid", "Paid bank", 20, "2026-09-05"),
  exp("odd", "ANNUAL FEE", 499, "2026-09-06", "card"),
];
const INCOMES = [inc("rev", "SMS CHGS REVERSAL", 15, "2026-09-03"), inc("ref", "LATE PAYMENT FEE REFUND", 500, "2026-09-07", "card")];
const REVIEWS = [review("paid"), notFee("odd", 499)];
const ACCOUNTS = [BANK, CARD];
const META = { runId: "2026-11-09T03:00:00.000Z", inputsSyncedAt: "2026-11-08T10:00:00.000Z", version: SERVER_RESULTS_VERSION };

/** What the app sees: the stored documents, round-tripped as Firestore would. */
function storedRows(reviews: FeeReview[]) {
  const docs = feeRowDocs(classifyFeeRows({ expenses: EXPENSES, incomes: INCOMES, accounts: ACCOUNTS, reviews }), META);
  return feeRowSetFromDocs(JSON.parse(JSON.stringify(docs)))!;
}
const detect = (reviews: FeeReview[]) => detectFees({ expenses: EXPENSES, incomes: INCOMES, accounts: ACCOUNTS, reviews });

describe("fee rows: stored on the server, resolved in the app (SPENDLY-747)", () => {
  it("golden: resolving the stored rows gives exactly what detectFees gives", () => {
    const app = detect(REVIEWS);
    const fromServer = resolveFeeRows(storedRows(REVIEWS), REVIEWS);
    expect(app.records.length).toBeGreaterThan(4);
    expect(fromServer.records).toEqual(app.records);
    expect([...fromServer.inferences.entries()]).toEqual([...app.inferences.entries()]);
    expect(fromServer.stats.detected).toBe(app.stats.detected);
    expect(fromServer.stats.candidates).toBe(app.stats.candidates);
  });

  it("a review made or cleared after the run shows at once, exactly as a fresh detection would", () => {
    const rows = storedRows(REVIEWS);
    const later = [...REVIEWS, notFee("atm", 20)];
    expect(resolveFeeRows(rows, later).records).toEqual(detect(later).records);
    expect(resolveFeeRows(rows, []).records).toEqual(detect([]).records);
  });

  it("keeps only candidates and reviewed rows, not the ledger", () => {
    const set = classifyFeeRows({ expenses: EXPENSES, incomes: INCOMES, accounts: ACCOUNTS, reviews: REVIEWS });
    expect(set.scanned).toBe(EXPENSES.length + INCOMES.length);
    expect(set.rows.map((r) => r.key)).not.toContain("expense__food");
    expect(set.rows.find((r) => r.key === "expense__paid")).toMatchObject({ detection: null });
  });

  it("splits a large result into parts, and only a complete set is used", () => {
    const many = Array.from({ length: 700 }, (_, i) => exp(`f${i}`, "ATM WDL CHG", 20 + i, "2026-09-01"));
    const docs = feeRowDocs(classifyFeeRows({ expenses: many, incomes: [], accounts: [BANK] }), META);
    expect(docs.length).toBeGreaterThan(2);
    expect(docs.every((d) => JSON.stringify(d.data).length < 600_000)).toBe(true);
    expect(feeRowSetFromDocs(docs)!.rows).toHaveLength(700);
    expect(feeRowSetFromDocs(docs.slice(1))).toBeNull();
    // An older complete run is ignored once a newer complete one is stored.
    const older = feeRowDocs({ rows: [], scanned: 0, reclassified: 0, engineVersion: 1 }, { ...META, runId: "2026-11-01T03:00:00.000Z" });
    expect(feeRowSetFromDocs([...older, ...docs])!.runId).toBe(META.runId);
  });
});

describe("insights-daily job (SPENDLY-747)", () => {
  const inputs: InsightInputs = {
    expenses: EXPENSES, incomes: INCOMES, entries: [], accounts: ACCOUNTS, accountTypes: [], reviews: REVIEWS,
    bills: [], subscriptions: [], spaces: [],
  };

  it("stores the app's own health report and the fee parts; deletes parts it no longer has", () => {
    const stored = new Map<string, Record<string, unknown>>([["feeRows-0", {}], ["feeRows-5", {}]]);
    const plan = insightWrites("u1", inputs, META, stored);
    const paths = plan.writes.map((w) => `${w.kind} ${w.path}`);
    expect(paths).toContain("set users/u1/serverResults/feeRows-0");
    expect(paths).toContain("delete users/u1/serverResults/feeRows-5");
    const health = plan.writes.find((w) => w.path.endsWith(`/${LEDGER_HEALTH_DOC}`))!;
    const docs = [{ id: LEDGER_HEALTH_DOC, data: JSON.parse(JSON.stringify(health.kind === "set" ? health.data : {})) }];
    const appReport = runLedgerAudit({
      expenses: EXPENSES, incomes: INCOMES, accounts: ACCOUNTS, accountTypes: [], bills: [], subscriptions: [], spaces: [],
      readiness: {
        expensesComplete: true, incomesComplete: true, accountsLoaded: true, billsLoaded: true, subscriptionsLoaded: true,
        spacesLoaded: true, tripsLoaded: false, splitsLoaded: false, fromCache: false,
      },
    });
    expect(ledgerHealthFromDocs(docs)!.report).toEqual(JSON.parse(JSON.stringify(appReport)));
  });

  it("recomputes only when the inputs changed or the version moved", () => {
    const stored = new Map([[LEDGER_HEALTH_DOC, { version: SERVER_RESULTS_VERSION, inputsSyncedAt: "t1" }]]);
    expect(isCurrent(stored, "t1")).toBe(true);
    expect(isCurrent(stored, "t2")).toBe(false);
    expect(isCurrent(new Map([[LEDGER_HEALTH_DOC, { version: 0, inputsSyncedAt: "t1" }]]), "t1")).toBe(false);
    expect(isCurrent(new Map(), "t1")).toBe(false);
  });

  it("reads Firestore only for changed users; dry run writes nothing; duress skipped", async () => {
    const written: string[] = [];
    const db: JobDb = {
      doc: (path) => ({ path }),
      batch: () => ({
        create: () => undefined,
        set: (r) => written.push(r.path),
        update: (r) => written.push(r.path),
        delete: (r) => written.push(r.path),
        commit: async () => undefined,
      }),
    };
    const read: string[] = [];
    const ports: InsightsPorts = {
      listOwners: async () => ["fresh", "changed", "empty", "x_duress"],
      inputsSyncedAt: async (uid) => (uid === "empty" ? null : "t2"),
      stored: async (uid) =>
        new Map<string, Record<string, unknown>>(uid === "fresh" ? [[LEDGER_HEALTH_DOC, { version: SERVER_RESULTS_VERSION, inputsSyncedAt: "t2" }]] : []),
      inputs: async (uid) => {
        read.push(uid);
        return inputs;
      },
      db,
      stamp: () => "<ts>",
    };
    const now = new Date("2026-11-09T03:00:00Z");
    const s = await runInsightsDaily({ ports, now, dryRun: false, budget: jobReadBudget(100_000), push: null, log: () => undefined });
    expect(read).toEqual(["changed"]);
    expect(written).toContain("users/changed/serverResults/ledgerHealth");
    expect(s.counts).toMatchObject({ unchanged: 1, usersComputed: 1 });
    expect(s.duressSkipped).toBe(1);
    written.length = 0;
    await runInsightsDaily({ ports, now, dryRun: true, budget: jobReadBudget(100_000), push: null, log: () => undefined });
    expect(written).toEqual([]);
  });
});

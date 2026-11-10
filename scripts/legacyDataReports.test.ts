import { describe, expect, it } from "vitest";

import type { CreditCardBill } from "../shared/types/creditCardBill";
import { AUTO_CREDIT_CARD_BILL_NOTE } from "../shared/utils/autoCreditCardBills";
import { duplicateBillsForUser, renderDuplicateBillsReport } from "./lib/duplicateBillsReport";
import { isAppTxId, legacyPositionId, renderSipDriftReport, sipDriftForUser } from "./lib/sipDriftReport";

describe("SIP drift report (SPENDLY-728)", () => {
  it("legacy position ids and app transaction ids are recognised", () => {
    expect(legacyPositionId("MF:120503")).toBe("MF_120503");
    expect(legacyPositionId("CRYPTO:bitcoin")).toBe("CRYPTO_bitcoin");
    expect(isAppTxId({ id: "p1_2026-11-11", sipId: "p1" })).toBe(true);
    expect(isAppTxId({ id: "Xr4nd0m", sipId: "p1" })).toBe(false);
  });

  it("flags app positions, legacy positions and plan totals that disagree with the executed rows, and double runs", () => {
    const drift = sipDriftForUser({
      userTag: "u#abc",
      plans: [
        // Legacy wrote the fund's totals (both plans) onto this plan.
        { id: "p1", assetName: "Index", totalUnits: 30, totalInvested: 3000, executionCount: 1 },
        { id: "p2", assetName: "Index", totalUnits: 10, totalInvested: 1000, executionCount: 1 },
      ],
      transactions: [
        { id: "legacy1", sipId: "p1", date: "2026-10-11", quoteKey: "MF:1", status: "executed", unitsPurchased: 20, investmentAmount: 2000 },
        { id: "p1_2026-10-11", sipId: "p1", date: "2026-10-11", quoteKey: "MF:1", status: "executed", unitsPurchased: 0.5, investmentAmount: 50 },
        { id: "p2_2026-10-11", sipId: "p2", date: "2026-10-11", quoteKey: "MF:1", status: "executed", unitsPurchased: 10, investmentAmount: 1000 },
        { id: "p2_2026-09-11", sipId: "p2", date: "2026-09-11", quoteKey: "MF:1", status: "failed" },
      ],
      positions: [{ id: "MF:1", quoteKey: "MF:1", totalUnits: 10.5, totalInvested: 1050 }],
      legacyPositions: [{ id: "MF_1", quoteKey: "MF:1", totalUnits: 30, totalInvested: 3000 }],
    });
    const fund = drift.funds.find((f) => f.quoteKey === "MF:1")!;
    expect(fund).toMatchObject({ executedUnits: 30.5, executedInvested: 3050, appUnits: 10.5, legacyUnits: 30, appMatches: false, legacyMatches: false });
    expect(drift.plans.find((p) => p.planId === "p1")).toMatchObject({ executedUnits: 20.5, executedCount: 2, matches: false });
    expect(drift.plans.find((p) => p.planId === "p2")).toMatchObject({ matches: true });
    expect(drift.doubleRuns).toEqual([{ planId: "p1", date: "2026-10-11", txIds: ["legacy1", "p1_2026-10-11"] }]);
    expect(drift.txCounts).toEqual({ executed: 3, appIds: 2, legacyIds: 1, failed: 1, skipped: 0 });

    const md = renderSipDriftReport([drift], "2026-11-09T00:00:00Z");
    expect(md).toContain("## u#abc");
    expect(md).toContain("Double executions");
    expect(md).toContain("with drift: 1");
  });

  it("a clean user reports no drift", () => {
    const drift = sipDriftForUser({
      userTag: "u#ok",
      plans: [{ id: "p1", assetName: "A", totalUnits: 2, totalInvested: 100, executionCount: 1 }],
      transactions: [{ id: "p1_2026-11-01", sipId: "p1", date: "2026-11-01", quoteKey: "X", status: "executed", unitsPurchased: 2, investmentAmount: 100 }],
      positions: [{ id: "X", quoteKey: "X", totalUnits: 2, totalInvested: 100 }],
      legacyPositions: [],
    });
    expect(drift.funds.every((f) => f.appMatches && f.legacyMatches)).toBe(true);
    expect(drift.plans.every((p) => p.matches)).toBe(true);
    expect(renderSipDriftReport([drift], "t")).toContain("with drift: 0");
  });
});

describe("duplicate bills report (SPENDLY-728)", () => {
  const bill = (id: string, over: Partial<CreditCardBill> = {}): CreditCardBill =>
    ({
      id,
      accountId: "roar",
      statementDate: "2026-10-01",
      billingPeriodStart: "2026-09-02",
      billingPeriodEnd: "2026-10-01",
      dueDate: "2026-10-06",
      statementAmount: 929,
      amountPaid: 929,
      remainingAmount: 0,
      status: "PAID",
      note: AUTO_CREDIT_CARD_BILL_NOTE,
      paymentIds: ["af08"],
      ...over,
    }) as CreditCardBill;

  it("classifies the app id vs legacy random ids per cycle, with the app rule's verdict", () => {
    const r = duplicateBillsForUser(
      "u#abc",
      [
        bill("roar_2026-10-01"),
        bill("G0AHyiC4znyCoWJkM9dE", { status: "CANCELLED" }),
        bill("roar_2026-11-01", { statementDate: "2026-11-01", status: "PARTIALLY_PAID", amountPaid: 268.71 }),
        bill("xOpenTwin", { statementDate: "2026-11-01", status: "OVERDUE", amountPaid: 0, paymentIds: [] }),
        bill("legacyOnly", { statementDate: "2026-08-01", status: "OVERDUE", amountPaid: 0, paymentIds: [] }),
      ],
      "2026-11-09"
    );
    expect(r.totals).toMatchObject({ bills: 5, legacyIds: 3, groups: 2 });
    const oct = r.groups.find((g) => g.statementDate === "2026-10-01")!;
    expect(oct.bills.find((b) => b.id === "roar_2026-10-01")).toMatchObject({ kind: "app id", verdict: "keep" });
    expect(oct.bills.find((b) => b.id === "G0AHyiC4znyCoWJkM9dE")).toMatchObject({ kind: "legacy random id", verdict: "already cancelled" });
    const nov = r.groups.find((g) => g.statementDate === "2026-11-01")!;
    expect(nov.bills.filter((b) => b.verdict === "cancel")).toHaveLength(1);
    expect(r.openLegacyOnly).toEqual([{ id: "legacyOnly", accountId: "roar", statementDate: "2026-08-01", status: "OVERDUE", statementAmount: 929 }]);

    const md = renderDuplicateBillsReport([r], "2026-11-09T00:00:00Z");
    expect(md).toContain("legacy random ids: 3");
    expect(md).toContain("Open legacy-only bills");
    expect(md).toContain("## u#abc");
  });
});

describe("reports never print a uid (SPENDLY-728)", () => {
  it("hashUid gives a short tag that doesn't contain the uid", async () => {
    const { hashUid } = await import("./lib/readmodelSyncCore");
    const tag = hashUid("G9NxBehpGFSascp95Pbwr6Fk9nn2");
    expect(tag).toMatch(/^u#[0-9a-f]{10}$/);
    expect(tag).not.toContain("G9Nx");
  });

  it("both CLIs pass only hashUid(uid) to the report, never the uid", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const cli of ["report-sip-drift.ts", "report-duplicate-bills.ts"]) {
      const src = readFileSync(join(__dirname, cli), "utf8");
      expect(src, cli).toMatch(/hashUid\(u\)/);
      expect(src, cli).not.toMatch(/userTag:\s*u\b/);
      expect(src, cli).not.toMatch(/ForUser\(u,/);
    }
  });
});

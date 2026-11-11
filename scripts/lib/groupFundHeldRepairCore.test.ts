import { describe, expect, it } from "vitest";

import type { GroupFund, GroupFundEvent } from "../../shared/types/groupFund";
import { rebuildGroupFundTotals } from "../../shared/utils/groupFundMath";
import { accountImpact, planHeldRepair, renderHeldRepairReport, replayOrder } from "./groupFundHeldRepairCore";

let seq = 0;
const ev = (over: Partial<GroupFundEvent>): GroupFundEvent => ({
  id: `e${++seq}`,
  fundId: "f1",
  kind: "contribution",
  amount: 500,
  purposeId: "appu",
  date: "2026-11-05",
  actorUid: "u1",
  createdAtMs: seq,
  ...over,
});

/** The ticket, saved before 752: 500 cash + 500 SBI, then 1,000 paid from SBI. */
function ticketFund() {
  const cash = ev({ accountId: "cash" });
  const sbi = ev({ accountId: "sbi" });
  const payout = ev({ kind: "payout", amount: 1000, accountId: "sbi" });
  const events = [cash, sbi, payout];
  const rebuilt = rebuildGroupFundTotals(events);
  const fund = {
    id: "f1",
    name: "Dokra",
    version: 4,
    totals: rebuilt.totals,
    byPurpose: rebuilt.byPurpose,
    heldByAccount: { cash: 500, sbi: -500 },
  } as Pick<GroupFund, "id" | "name" | "version" | "totals" | "byPurpose" | "heldByAccount">;
  return { fund, events, payout };
}

describe("SPENDLY-752 held-by-account repair", () => {
  it("repairs the ticket's fund: only heldByAccount changes, to zero held in both accounts", () => {
    const { fund, events } = ticketFund();
    const plan = planHeldRepair("k1", fund, [...events].reverse());
    expect(plan.status).toBe("repair");
    expect(plan.proposed).toEqual({ cash: 0, sbi: 0 });
    expect(accountImpact([plan])).toEqual([
      { accountId: "cash", before: 500, after: 0 },
      { accountId: "sbi", before: -500, after: 0 },
    ]);
  });

  it("is safe to rerun: a repaired fund reads as already correct", () => {
    const { fund, events } = ticketFund();
    const plan = planHeldRepair("k1", fund, events);
    expect(planHeldRepair("k1", { ...fund, heldByAccount: plan.proposed! }, events).status).toBe("ok");
  });

  it("leaves a fund whose totals the history doesn't explain for manual review", () => {
    const { fund, events } = ticketFund();
    const plan = planHeldRepair("k1", { ...fund, totals: { ...fund.totals, held: 200 } }, events);
    expect(plan.status).toBe("manual");
    expect(plan.proposed).toBeUndefined();
    expect(plan.otherDifferences).toEqual([{ field: "totals.held", stored: 200, expected: 0 }]);
  });

  it("an old reversal of the payout gives the draw back, so nothing needs repair after it", () => {
    const { fund, events, payout } = ticketFund();
    const undo = ev({ kind: "reversal", reversalOf: payout.id, reversedKind: "payout", amount: 1000, accountId: "sbi" });
    const all = [...events, undo];
    const rebuilt = rebuildGroupFundTotals(all);
    // Pre-752 the undo credited SBI back, which already matched: cash 500, sbi 500.
    const plan = planHeldRepair("k1", { ...fund, totals: rebuilt.totals, byPurpose: rebuilt.byPurpose, heldByAccount: { cash: 500, sbi: 500 } }, all);
    expect(plan.status).toBe("ok");
  });

  it("does not touch funds that are already right, including new payouts with a stored draw", () => {
    const events = [ev({ accountId: "cash" }), ev({ accountId: "sbi" }), ev({ kind: "payout", amount: 1000, accountId: "sbi", heldDraw: { sbi: 500, cash: 500 } })];
    const rebuilt = rebuildGroupFundTotals(events);
    const plan = planHeldRepair("k1", { id: "f1", name: "D", version: 1, ...rebuilt }, events);
    expect(plan.status).toBe("ok");
  });

  it("flags a fund below zero that its stored draws explain (concurrent payouts) for manual review", () => {
    const events = [ev({ accountId: "cash" }), ev({ kind: "payout", amount: 500, accountId: "sbi", heldDraw: { cash: 500 } }), ev({ accountId: "cash" }), ev({ kind: "payout", amount: 500, accountId: "sbi", heldDraw: { cash: 1000 } })];
    const rebuilt = rebuildGroupFundTotals(events);
    expect(rebuilt.heldByAccount.cash).toBe(-500);
    expect(planHeldRepair("k1", { id: "f1", name: "D", version: 1, ...rebuilt }, events).status).toBe("manual");
  });

  it("replays in creation order, whatever order the events were read in", () => {
    expect(replayOrder([ev({ createdAtMs: 5, id: "b" }), ev({ createdAtMs: 5, id: "a" }), ev({ createdAtMs: 1, id: "z" })]).map((e) => e.id)).toEqual([
      "z",
      "a",
      "b",
    ]);
  });

  it("reports names, stored → proposed and what the card shows, never a uid", () => {
    const { fund, events } = ticketFund();
    const text = renderHeldRepairReport([planHeldRepair("k1", fund, events)], (_k, id) => (id === "cash" ? "Hand cash" : "SBI"), {
      mode: "dry-run",
    });
    expect(text).toContain("to repair: 1");
    expect(text).toContain("| Hand cash | 500.00 | 0.00 | 500.00 → 0.00 |");
    expect(text).toContain("| SBI | -500.00 | 0.00 | 0.00 → 0.00 |");
    expect(text).not.toContain("u1");
  });
});

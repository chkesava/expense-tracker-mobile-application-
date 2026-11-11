import { describe, expect, it } from "vitest";

import type { GroupFund, GroupFundEvent } from "../types/groupFund";
import {
  allocatePayoutDraw,
  groupFundEventEffect,
  memberContributionStatus,
  rebuildGroupFundTotals,
  reconcileGroupFund,
  reversedGroupFundEventIds,
  totalGroupFundsHeld,
} from "./groupFundMath";
import { emptyGroupFundTotals } from "./groupFundModel";

let seq = 0;
const ev = (over: Partial<GroupFundEvent>): GroupFundEvent => ({
  id: `e${++seq}`,
  fundId: "f1",
  kind: "contribution",
  amount: 100,
  purposeId: "appu",
  date: "2026-11-05",
  actorUid: "u1",
  createdAtMs: seq,
  ...over,
});

describe("groupFundEventEffect", () => {
  it("contribution adds to held and to the receiving account", () => {
    expect(groupFundEventEffect(ev({ kind: "contribution", amount: 6000, accountId: "hdfc" }))).toEqual({
      buckets: { contributions: 6000 },
      heldDelta: 6000,
      accountDeltas: { hdfc: 6000 },
    });
  });

  it("payout takes from held and from the paying account", () => {
    expect(groupFundEventEffect(ev({ kind: "payout", amount: 500, accountId: "cash" }))).toEqual({
      buckets: { payouts: 500 },
      heldDelta: -500,
      accountDeltas: { cash: -500 },
    });
  });

  it("account move changes no total, only where the money sits", () => {
    expect(
      groupFundEventEffect(ev({ kind: "account_move", amount: 300, accountId: "cash", toAccountId: "hdfc" }))
    ).toEqual({ buckets: {}, heldDelta: 0, accountDeltas: { cash: -300, hdfc: 300 } });
  });

  it("a reversal is the exact negation of what it undoes", () => {
    const original = groupFundEventEffect(ev({ kind: "contribution", amount: 6000, accountId: "hdfc" }));
    const reversal = groupFundEventEffect(
      ev({ kind: "reversal", reversedKind: "contribution", amount: 6000, accountId: "hdfc" })
    );
    expect(reversal).toEqual({
      buckets: { contributions: -6000 },
      heldDelta: -6000,
      accountDeltas: { hdfc: -6000 },
    });
    expect(original.heldDelta + reversal.heldDelta).toBe(0);
  });

  it("a reversal without reversedKind changes nothing", () => {
    expect(groupFundEventEffect(ev({ kind: "reversal", amount: 10 }))).toEqual({
      buckets: {},
      heldDelta: 0,
      accountDeltas: {},
    });
  });
});

describe("rebuildGroupFundTotals (AC7)", () => {
  it("held = opening + contributions + transfers in − payouts − transfers out", () => {
    const events = [
      ev({ kind: "opening", amount: 1000, purposeId: "appu" }),
      ev({ kind: "contribution", amount: 6000, purposeId: "appu", accountId: "hdfc" }),
      ev({ kind: "contribution", amount: 100, purposeId: "podupu", accountId: "cash" }),
      ev({ kind: "transfer_out", amount: 50, purposeId: "podupu", transferPairId: "t" }),
      ev({ kind: "transfer_in", amount: 50, purposeId: "appu", transferPairId: "t" }),
      ev({ kind: "payout", amount: 7000, purposeId: "appu", accountId: "hdfc" }),
    ];
    const r = rebuildGroupFundTotals(events);
    expect(r.totals).toEqual({
      opening: 1000,
      contributions: 6100,
      payouts: 7000,
      transfersIn: 50,
      transfersOut: 50,
      held: 100,
    });
    expect(r.byPurpose.appu.held).toBe(50);
    expect(r.byPurpose.podupu.held).toBe(50);
    // SPENDLY-752: hdfc paid 1,000 more than it held; that came out of cash's
    // 100 and then the 900 opening money that sits in no account.
    expect(r.heldByAccount).toEqual({ hdfc: 0, cash: 0 });
  });

  it("a reversed contribution nets out of every total", () => {
    const c = ev({ kind: "contribution", amount: 6000, accountId: "hdfc" });
    const r = rebuildGroupFundTotals([
      c,
      ev({ kind: "reversal", reversalOf: c.id, reversedKind: "contribution", amount: 6000, accountId: "hdfc" }),
    ]);
    expect(r.totals).toEqual(emptyGroupFundTotals());
    expect(r.heldByAccount).toEqual({ hdfc: 0 });
  });

  it("avoids float drift", () => {
    const r = rebuildGroupFundTotals([ev({ amount: 0.1 }), ev({ amount: 0.2 })]);
    expect(r.totals.held).toBe(0.3);
  });
});

describe("reconcileGroupFund", () => {
  const events = [
    ev({ kind: "contribution", amount: 6000, accountId: "hdfc" }),
    ev({ kind: "payout", amount: 1000, accountId: "hdfc" }),
  ];
  const good = rebuildGroupFundTotals(events);

  it("is empty when the stored totals match the history", () => {
    expect(reconcileGroupFund(good, events)).toEqual([]);
  });

  it("names every field that drifted", () => {
    const drifted = {
      ...good,
      totals: { ...good.totals, held: 6000 },
      heldByAccount: { hdfc: 5000, cash: 10 },
    };
    expect(reconcileGroupFund(drifted, events)).toEqual([
      { field: "totals.held", stored: 6000, expected: 5000 },
      { field: "heldByAccount.cash", stored: 10, expected: 0 },
    ]);
  });
});

describe("helpers", () => {
  it("lists reversed event ids", () => {
    expect(
      reversedGroupFundEventIds([
        { kind: "contribution" },
        { kind: "reversal", reversalOf: "x" },
      ])
    ).toEqual(new Set(["x"]));
  });

  it("sums held across funds", () => {
    const t = (held: number) => ({ totals: { ...emptyGroupFundTotals(), held } });
    expect(totalGroupFundsHeld([t(61000), t(0.1), t(0.2)])).toBe(61000.3);
    expect(totalGroupFundsHeld([])).toBe(0);
  });
});

describe("memberContributionStatus (AC9)", () => {
  const fund: Pick<GroupFund, "purposes" | "members"> = {
    purposes: [
      { id: "appu", name: "Appu", cadence: "monthly", expectedPerMember: 6000 },
      { id: "podupu", name: "Podupu", cadence: "adhoc", expectedPerMember: 100 },
      { id: "misc", name: "Misc", cadence: "adhoc" },
    ],
    members: [
      { id: "m1", name: "Ravi" },
      { id: "m2", name: "Sita" },
      { id: "m3", name: "Left", archived: true },
    ],
  };

  it("shows pending only for purposes with an expected amount", () => {
    const status = memberContributionStatus(fund, [], "2026-11");
    expect(status.map((s) => s.purposeId)).not.toContain("misc");
    expect(status).toHaveLength(4); // 2 purposes × 2 active members
  });

  it("monthly counts only the period; partial collection leaves the rest pending", () => {
    const events = [
      ev({ kind: "contribution", purposeId: "appu", memberId: "m1", amount: 4000, period: "2026-11" }),
      ev({ kind: "contribution", purposeId: "appu", memberId: "m1", amount: 6000, period: "2026-10" }),
    ];
    const ravi = memberContributionStatus(fund, events, "2026-11").find(
      (s) => s.memberId === "m1" && s.purposeId === "appu"
    );
    expect(ravi).toEqual({ memberId: "m1", purposeId: "appu", expected: 6000, received: 4000, pending: 2000 });
  });

  it("falls back to the date's month when period is missing", () => {
    const events = [ev({ kind: "contribution", purposeId: "appu", memberId: "m2", amount: 6000, date: "2026-11-02" })];
    const sita = memberContributionStatus(fund, events, "2026-11").find(
      (s) => s.memberId === "m2" && s.purposeId === "appu"
    );
    expect(sita?.pending).toBe(0);
  });

  it("ad-hoc counts every contribution and reversals are not received", () => {
    const c = ev({ kind: "contribution", purposeId: "podupu", memberId: "m1", amount: 100, period: "2026-01" });
    const events = [
      c,
      ev({ kind: "reversal", reversalOf: c.id, reversedKind: "contribution", purposeId: "podupu", memberId: "m1", amount: 100 }),
    ];
    const ravi = memberContributionStatus(fund, events, "2026-11").find(
      (s) => s.memberId === "m1" && s.purposeId === "podupu"
    );
    expect(ravi).toEqual({ memberId: "m1", purposeId: "podupu", expected: 100, received: 0, pending: 100 });
  });

  it("overpaying never shows negative pending", () => {
    const events = [ev({ kind: "contribution", purposeId: "podupu", memberId: "m2", amount: 150 })];
    const sita = memberContributionStatus(fund, events, "2026-11").find(
      (s) => s.memberId === "m2" && s.purposeId === "podupu"
    );
    expect(sita?.pending).toBe(0);
    expect(sita?.received).toBe(150);
  });
});

describe("SPENDLY-752: a payout draws held money across the fund's accounts", () => {
  it("same account: takes only from the paying account", () => {
    expect(allocatePayoutDraw({ cash: 500, sbi: 500 }, "sbi", 300)).toEqual({ sbi: 300 });
  });

  it("cross account: the ticket's 500 cash + 500 SBI, then 1,000 paid from SBI", () => {
    expect(allocatePayoutDraw({ cash: 500, sbi: 500 }, "sbi", 1000)).toEqual({ sbi: 500, cash: 500 });
  });

  it("partial: takes the excess only, largest holding first, ties by id", () => {
    expect(allocatePayoutDraw({ a: 100, b: 300, c: 300, x: 50 }, "x", 400)).toEqual({ x: 50, b: 300, c: 50 });
  });

  it("from an account that holds nothing, or less than nothing", () => {
    expect(allocatePayoutDraw({ cash: 500, sbi: 0 }, "sbi", 200)).toEqual({ cash: 200 });
    expect(allocatePayoutDraw({ cash: 500, sbi: -300 }, "sbi", 200)).toEqual({ cash: 200 });
  });

  it("more than the accounts hold: the rest is drawn from no account, nothing goes below zero", () => {
    expect(allocatePayoutDraw({ cash: 100 }, "sbi", 1000)).toEqual({ cash: 100 });
    expect(allocatePayoutDraw(undefined, "sbi", 1000)).toEqual({});
  });

  it("a stored draw sets the account deltas, and its reversal gives it back", () => {
    const heldDraw = { sbi: 500, cash: 500 };
    expect(groupFundEventEffect(ev({ kind: "payout", amount: 1000, accountId: "sbi", heldDraw })).accountDeltas).toEqual({
      sbi: -500,
      cash: -500,
    });
    expect(
      groupFundEventEffect(ev({ kind: "reversal", reversedKind: "payout", amount: 1000, accountId: "sbi", heldDraw }))
        .accountDeltas
    ).toEqual({ sbi: 500, cash: 500 });
    expect(groupFundEventEffect(ev({ kind: "payout", amount: 1000, accountId: "sbi", heldDraw: {} })).accountDeltas).toEqual({});
  });

  it("rebuild replays a pre-752 payout with the draw, and an old reversal gives that draw back", () => {
    const p = ev({ kind: "payout", amount: 1000, accountId: "sbi" });
    const history = [
      ev({ kind: "contribution", amount: 500, accountId: "cash" }),
      ev({ kind: "contribution", amount: 500, accountId: "sbi" }),
      p,
    ];
    expect(rebuildGroupFundTotals(history).heldByAccount).toEqual({ cash: 0, sbi: 0 });
    const undone = rebuildGroupFundTotals([
      ...history,
      ev({ kind: "reversal", reversalOf: p.id, reversedKind: "payout", amount: 1000, accountId: "sbi" }),
    ]);
    expect(undone.heldByAccount).toEqual({ cash: 500, sbi: 500 });
    expect(undone.totals.held).toBe(1000);
  });

  it("flags a fund stored with the pre-752 split, and only on heldByAccount", () => {
    const history = [
      ev({ kind: "contribution", amount: 500, accountId: "cash" }),
      ev({ kind: "contribution", amount: 500, accountId: "sbi" }),
      ev({ kind: "payout", amount: 1000, accountId: "sbi" }),
    ];
    const rebuilt = rebuildGroupFundTotals(history);
    const stored = { ...rebuilt, heldByAccount: { cash: 500, sbi: -500 } };
    expect(reconcileGroupFund(stored, history)).toEqual([
      { field: "heldByAccount.cash", stored: 500, expected: 0 },
      { field: "heldByAccount.sbi", stored: -500, expected: 0 },
    ]);
  });
});

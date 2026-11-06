import { describe, expect, it } from "vitest";

import type { GroupFund, GroupFundEvent } from "../types/groupFund";
import { groupFundMonthSummary, memberContributionStatus, reconcileHeldByAccount } from "./groupFundMath";
import { emptyGroupFundTotals, fundStartPeriod, memberOwesIn, validateMembers } from "./groupFundModel";
import { buildCreateGroupFund, buildEditGroupFund } from "./groupFundWrites";

/**
 * SPENDLY-688 (AC9): the month view is derived from that month's events —
 * nothing is created per month, so no month can be missed — and nothing is
 * owed before the fund started, before a member joined, or after they left.
 */

const fund: GroupFund = {
  id: "f1",
  name: "Dokra",
  status: "active",
  startPeriod: "2026-09",
  purposes: [
    { id: "society", name: "Society", cadence: "monthly", expectedPerMember: 6100 },
    { id: "podupu", name: "Podupu", cadence: "monthly", expectedPerMember: 100 },
    { id: "festival", name: "Festival", cadence: "adhoc", expectedPerMember: 500 },
    { id: "misc", name: "Misc", cadence: "monthly" },
  ],
  members: [
    { id: "amma", name: "amma" },
    { id: "ravi", name: "Ravi", joinedPeriod: "2026-11" },
    { id: "sita", name: "Sita", archived: true, leftPeriod: "2026-11" },
    { id: "old", name: "Old", archived: true },
  ],
  totals: emptyGroupFundTotals(),
  byPurpose: {},
  heldByAccount: {},
};

let n = 0;
const ev = (over: Partial<GroupFundEvent>): GroupFundEvent => ({
  id: `e${++n}`,
  fundId: "f1",
  kind: "contribution",
  amount: 6100,
  purposeId: "society",
  memberId: "amma",
  date: "2026-11-06",
  period: "2026-11",
  actorUid: "u",
  createdAtMs: n,
  ...over,
});

describe("who owes in a month", () => {
  it("starts at the fund's start month, or its creation month for older funds", () => {
    expect(fundStartPeriod(fund)).toBe("2026-09");
    expect(fundStartPeriod({ createdAtMs: new Date(2026, 6, 15).getTime() })).toBe("2026-07");
    expect(fundStartPeriod({})).toBeNull();
  });

  it("counts a member from their join month until their leave month", () => {
    const [amma, ravi, sita, old] = fund.members;
    expect(memberOwesIn(amma, "2026-09")).toBe(true);
    expect(memberOwesIn(ravi, "2026-10")).toBe(false);
    expect(memberOwesIn(ravi, "2026-11")).toBe(true);
    expect(memberOwesIn(sita, "2026-10")).toBe(true);
    expect(memberOwesIn(sita, "2026-11")).toBe(false);
    expect(memberOwesIn(old, "2026-10")).toBe(false);
  });

  it("owes nothing before the fund started", () => {
    expect(memberContributionStatus(fund, [], "2026-08")).toEqual([]);
  });

  it("rejects a leave month that isn't after the join month", () => {
    expect(validateMembers([{ id: "m", name: "M", joinedPeriod: "2026-11", leftPeriod: "2026-11" }])).toEqual([
      "member_months_invalid",
    ]);
    expect(validateMembers([{ id: "m", name: "M", joinedPeriod: "2026-13" }])).toEqual(["period_invalid"]);
  });
});

describe("groupFundMonthSummary", () => {
  it("lists paid, partial and unpaid members for each monthly purpose with an expected amount", () => {
    const reversed = ev({ amount: 100, purposeId: "podupu", memberId: "ravi" });
    const events = [
      ev({}),
      ev({ amount: 3000, memberId: "ravi" }),
      reversed,
      ev({ kind: "reversal", reversalOf: reversed.id, reversedKind: "contribution", amount: 100, purposeId: "podupu", memberId: "ravi" }),
      ev({ amount: 100, purposeId: "podupu", memberId: "amma" }),
    ];
    const summary = groupFundMonthSummary(fund, events, "2026-11");
    // Ad-hoc and no-expected purposes are not part of a month view.
    expect(summary.map((p) => p.purposeId)).toEqual(["society", "podupu"]);
    const society = summary[0];
    expect(society.rows.map((r) => [r.memberId, r.state, r.received, r.pending])).toEqual([
      ["amma", "paid", 6100, 0],
      ["ravi", "partial", 3000, 3100],
    ]);
    expect(society).toMatchObject({ expected: 12200, collected: 9100, pending: 3100, paidCount: 1 });
    const podupu = summary[1];
    expect(podupu.rows.map((r) => [r.memberId, r.state])).toEqual([
      ["amma", "paid"],
      ["ravi", "unpaid"],
    ]);
  });

  it("shows a past month with the members who were in the group then", () => {
    const summary = groupFundMonthSummary(fund, [], "2026-10");
    expect(summary[0].rows.map((r) => r.memberId)).toEqual(["amma", "sita"]);
    expect(summary[0]).toMatchObject({ expected: 12200, collected: 0, pending: 12200, paidCount: 0 });
  });

  it("doesn't let an overpayment hide someone else's due", () => {
    const summary = groupFundMonthSummary(fund, [ev({ amount: 12200 })], "2026-11");
    expect(summary[0]).toMatchObject({ collected: 6100, pending: 6100 });
  });
});

describe("reconcileHeldByAccount (feature 7)", () => {
  it("adds held money across funds per account and flags a shortfall", () => {
    const rows = reconcileHeldByAccount(
      [{ heldByAccount: { hdfc: 6100, cash: 500 } }, { heldByAccount: { hdfc: 1000, gone: 200, zero: 0 } }],
      new Map([
        ["hdfc", 470910],
        ["cash", 300],
      ])
    );
    expect(rows).toEqual([
      { accountId: "hdfc", held: 7100, balance: 470910, shortfall: 0 },
      { accountId: "cash", held: 500, balance: 300, shortfall: 200 },
      { accountId: "gone", held: 200, balance: null, shortfall: 200 },
    ]);
  });
});

describe("builders keep the new months", () => {
  const ctx = { uid: "u", nowMs: 1, eventId: "e" };
  it("creates with a start month and stores join/leave months", () => {
    const r = buildCreateGroupFund(ctx, "f2", {
      name: "Dokra",
      startPeriod: "2026-06",
      purposes: [{ id: "society", name: "Society", cadence: "monthly" }],
      members: [{ id: "m1", name: "Ravi", joinedPeriod: "2026-07" }],
    });
    expect(r.ok && r.plan.fields).toMatchObject({ startPeriod: "2026-06", members: [{ id: "m1", joinedPeriod: "2026-07" }] });
  });

  it("edits the start month and refuses a bad one", () => {
    const r = buildEditGroupFund(ctx, { ...fund, version: 2 }, { startPeriod: "2026-05" });
    expect(r.ok && r.plan.fields).toEqual({ startPeriod: "2026-05" });
    expect(buildEditGroupFund(ctx, fund, { startPeriod: "May" })).toMatchObject({ ok: false, issues: ["period_invalid"] });
  });
});

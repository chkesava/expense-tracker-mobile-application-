import { describe, expect, it } from "vitest";

import type { GroupFund, GroupFundEvent } from "../types/groupFund";
import { groupFundMonthSummary, reconcileGroupFund } from "./groupFundMath";
import { emptyGroupFundTotals } from "./groupFundModel";
import {
  buildBackfillContribution,
  buildPastPayout,
  groupFundBackfillId,
  groupFundWritePlanToOps,
  type GroupFundWritePlan,
  type GroupFundWriteResult,
} from "./groupFundWrites";

/**
 * SPENDLY-700: backfilling past months by hand. The money is usually already
 * in the bank, so the default writes no account entry and moves no balance —
 * otherwise the balance would rise twice. Each member's month has a fixed id,
 * so it can't be recorded twice.
 */

const fund = (): GroupFund => ({
  id: "f1",
  name: "Dokra",
  status: "active",
  startPeriod: "2026-06",
  purposes: [{ id: "society", name: "Society", cadence: "monthly", expectedPerMember: 6100 }],
  members: [
    { id: "amma", name: "amma" },
    { id: "ravi", name: "Ravi", archived: true, leftPeriod: "2026-09" },
  ],
  totals: emptyGroupFundTotals(),
  byPurpose: {},
  heldByAccount: {},
  version: 3,
});
const ctx = { uid: "u", nowMs: 5, eventId: "ignored" };
const S = { serverTimestamp: () => "ts", increment: (n: number) => ({ inc: n }) };
const ok = (r: GroupFundWriteResult): GroupFundWritePlan => {
  if (!r.ok) throw new Error(r.issues.join(","));
  return r.plan;
};

describe("buildBackfillContribution", () => {
  it("already in the balance (default): counts for the member and month, writes no account entry", () => {
    const p = ok(
      buildBackfillContribution(ctx, fund(), {
        purposeId: "society",
        memberId: "amma",
        period: "2026-07",
        amount: 6100,
        alreadyInBalance: true,
        accountId: "hdfc",
      })
    );
    const id = groupFundBackfillId("f1", "2026-07", "society", "amma");
    expect(id).toBe("bf~f1~2026-07~society~amma");
    expect(p.events).toEqual([
      expect.objectContaining({ id, kind: "contribution", period: "2026-07", date: "2026-07-01", attributionOnly: true, accountId: "hdfc" }),
    ]);
    expect(p.events[0]).not.toHaveProperty("accountEntryIds");
    expect(p.accountEntries).toEqual([]);
    expect(p.balanceLegs).toEqual([]);
    // Held for others still goes up, and is attributed to where it sits.
    expect(p.increments).toMatchObject({ "totals.contributions": 6100, "totals.held": 6100, "heldByAccount.hdfc": 6100 });
    expect(groupFundWritePlanToOps("u", p, S).map((o) => o.ref.path)).toEqual([
      "users/u/groupFunds/f1",
      `users/u/groupFundEvents/${id}`,
    ]);
    expect(groupFundMonthSummary(fund(), p.events, "2026-07")[0].rows.find((r) => r.memberId === "amma")).toMatchObject({ state: "paid" });
  });

  it("not in the balance yet: credits the chosen account exactly once", () => {
    const p = ok(
      buildBackfillContribution(ctx, fund(), {
        purposeId: "society",
        memberId: "amma",
        period: "2026-07",
        amount: 6100,
        alreadyInBalance: false,
        accountId: "cash",
        date: "2026-11-06",
      })
    );
    expect(p.accountEntries).toEqual([
      expect.objectContaining({ id: "gf_bf~f1~2026-07~society~amma", accountId: "cash", direction: "credit", amount: 6100 }),
    ]);
    expect(p.balanceLegs).toEqual([{ accountId: "cash", amountDelta: 6100, date: "2026-11-06" }]);
    expect(p.events[0]).not.toHaveProperty("attributionOnly");
  });

  it("allows a member who has since left; refuses bad input", () => {
    expect(
      buildBackfillContribution(ctx, fund(), { purposeId: "society", memberId: "ravi", period: "2026-07", amount: 6100, alreadyInBalance: true }).ok
    ).toBe(true);
    const bad = (over: object) =>
      buildBackfillContribution(ctx, fund(), {
        purposeId: "society",
        memberId: "amma",
        period: "2026-07",
        amount: 6100,
        alreadyInBalance: true,
        ...over,
      });
    expect(bad({ period: "July" })).toMatchObject({ ok: false });
    expect(bad({ amount: 0 })).toMatchObject({ issues: ["amount_not_positive"] });
    expect(bad({ alreadyInBalance: false, accountId: undefined })).toMatchObject({ issues: ["account_required"] });
    expect(bad({ memberId: "nobody" })).toMatchObject({ issues: ["member_unknown"] });
  });

  it("never gives two different members' months the same id (CodeRabbit #263)", () => {
    expect(groupFundBackfillId("f1", "2026-07", "x_y", "z")).not.toBe(groupFundBackfillId("f1", "2026-07", "x", "y_z"));
  });

  it("is the same document every time, so a month can't be backfilled twice", () => {
    const input = { purposeId: "society", memberId: "amma", period: "2026-08", amount: 6100, alreadyInBalance: true };
    const a = groupFundWritePlanToOps("u", ok(buildBackfillContribution({ ...ctx, eventId: "one" }, fund(), input)), S);
    const b = groupFundWritePlanToOps("u", ok(buildBackfillContribution({ ...ctx, eventId: "two" }, fund(), input)), S);
    expect(b).toEqual(a);
  });
});

describe("buildPastPayout", () => {
  it("lowers what the fund holds without debiting any account again", () => {
    const held = { ...fund(), totals: { ...emptyGroupFundTotals(), contributions: 12200, held: 12200 }, byPurpose: { society: { ...emptyGroupFundTotals(), contributions: 12200, held: 12200 } }, heldByAccount: { hdfc: 12200 } };
    const p = ok(buildPastPayout({ ...ctx, eventId: "pp1" }, held, { purposeId: "society", amount: 12000, date: "2026-08-30", accountId: "hdfc", recipient: "Dokra centre" }));
    expect(p.accountEntries).toEqual([]);
    expect(p.balanceLegs).toEqual([]);
    expect(p.events[0]).toMatchObject({ kind: "payout", attributionOnly: true, recipient: "Dokra centre" });
    expect(p.increments).toMatchObject({ "totals.payouts": 12000, "totals.held": -12000, "heldByAccount.hdfc": -12000 });
    expect(buildPastPayout({ ...ctx, eventId: "pp2" }, held, { purposeId: "society", amount: 20000, date: "2026-08-30" })).toMatchObject({
      ok: false,
      issues: ["exceeds_held"],
    });
  });

  it("keeps stored totals equal to the history", () => {
    let f = fund();
    const events: GroupFundEvent[] = [];
    const apply = (p: GroupFundWritePlan) => {
      const next = structuredClone(f) as unknown as Record<string, any>;
      for (const [path, delta] of Object.entries(p.increments)) {
        const parts = path.split(".");
        let c = next;
        for (const part of parts.slice(0, -1)) c = c[part] ??= {};
        c[parts.at(-1)!] = Math.round(((c[parts.at(-1)!] ?? 0) + delta) * 100) / 100;
      }
      f = next as unknown as GroupFund;
      events.push(...p.events);
    };
    for (const period of ["2026-06", "2026-07", "2026-08"]) {
      apply(ok(buildBackfillContribution(ctx, f, { purposeId: "society", memberId: "amma", period, amount: 6100, alreadyInBalance: true, accountId: "hdfc" })));
    }
    apply(ok(buildPastPayout({ ...ctx, eventId: "pp" }, f, { purposeId: "society", amount: 18000, date: "2026-08-31", accountId: "hdfc" })));
    expect(f.totals.held).toBe(300);
    expect(reconcileGroupFund(f, events)).toEqual([]);
  });
});

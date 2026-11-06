import { describe, expect, it } from "vitest";

import type { GroupFund, GroupFundEvent } from "../types/groupFund";
import { memberMonthStatus, splitAccountBalance } from "./groupFundMath";
import { contributionDuplicateWarning } from "./groupFundMessages";

/** SPENDLY-687 review: the same member's month must not be recorded twice without asking. */

const fund: Pick<GroupFund, "purposes"> = {
  purposes: [
    { id: "society", name: "Society", cadence: "monthly", expectedPerMember: 6100 },
    { id: "misc", name: "Misc", cadence: "adhoc" },
  ],
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
const money = (v: number) => `₹${v}`;

describe("memberMonthStatus", () => {
  it("counts only this member, purpose and month, net of reversals", () => {
    const paid = ev({});
    const events = [
      paid,
      ev({ kind: "reversal", reversalOf: paid.id, reversedKind: "contribution" }),
      ev({ amount: 3000 }),
      ev({ memberId: "ravi" }),
      ev({ period: "2026-10" }),
      ev({ purposeId: "misc" }),
    ];
    expect(memberMonthStatus(fund, events, "amma", "society", "2026-11")).toEqual({ expected: 6100, received: 3000 });
    expect(memberMonthStatus(fund, events, "amma", "misc", "2026-11")).toEqual({ expected: null, received: 6100 });
  });

  it("uses the date's month when an older event has no period", () => {
    expect(memberMonthStatus(fund, [ev({ period: undefined })], "amma", "society", "2026-11").received).toBe(6100);
  });
});

describe("contributionDuplicateWarning", () => {
  const base = { memberName: "amma", purposeName: "Society", monthLabel: "Nov 2026", money };

  it("asks when the member already paid the month in full", () => {
    expect(contributionDuplicateWarning({ ...base, expected: 6100, received: 6100, amount: 6100 })).toBe(
      "amma has already paid ₹6100 of ₹6100 for Society in Nov 2026. Record ₹6100 more anyway?"
    );
  });

  it("asks when the amount is more than what's still due, and not for the remainder", () => {
    expect(contributionDuplicateWarning({ ...base, expected: 6100, received: 3000, amount: 6100 })).toBe(
      "amma only owes ₹3100 more for Society in Nov 2026. Record ₹6100 anyway?"
    );
    expect(contributionDuplicateWarning({ ...base, expected: 6100, received: 3000, amount: 3100 })).toBeNull();
    expect(contributionDuplicateWarning({ ...base, expected: 6100, received: 0, amount: 6100 })).toBeNull();
  });

  it("without an expected amount, asks only if something was already paid this month", () => {
    expect(contributionDuplicateWarning({ ...base, expected: null, received: 0, amount: 100 })).toBeNull();
    expect(contributionDuplicateWarning({ ...base, expected: null, received: 100, amount: 100 })).toBe(
      "amma already paid ₹100 for Society in Nov 2026. Record another ₹100?"
    );
  });
});

describe("splitAccountBalance", () => {
  it("separates money held for others from the user's own", () => {
    expect(splitAccountBalance(470910, 6100)).toEqual({ held: 6100, yours: 464810 });
    expect(splitAccountBalance(1000, -50)).toEqual({ held: 0, yours: 1000 });
  });
});

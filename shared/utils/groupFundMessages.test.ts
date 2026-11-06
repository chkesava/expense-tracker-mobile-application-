import { describe, expect, it } from "vitest";

import type { GroupFund, GroupFundEvent } from "../types/groupFund";
import { canReverseGroupFundEvent, describeGroupFundEvent, groupFundIssueMessage } from "./groupFundMessages";

const fund: Pick<GroupFund, "purposes" | "members"> = {
  purposes: [
    { id: "appu", name: "Appu loan", cadence: "monthly" },
    { id: "podupu", name: "Podupu", cadence: "monthly" },
  ],
  members: [{ id: "m1", name: "Ravi" }],
};
const names: Record<string, string> = { hdfc: "HDFC", cash: "Cash" };
const accountName = (id: string) => names[id] ?? "Account";
const ev = (over: Partial<GroupFundEvent>): GroupFundEvent => ({
  id: "e1",
  fundId: "f1",
  kind: "contribution",
  amount: 6000,
  purposeId: "appu",
  date: "2026-11-05",
  actorUid: "u",
  createdAtMs: 1,
  ...over,
});

describe("groupFundIssueMessage", () => {
  it("explains the first issue", () => {
    expect(groupFundIssueMessage(["exceeds_held", "date_invalid"])).toBe("That's more than this purpose holds.");
    expect(groupFundIssueMessage([])).toBe("Something went wrong. Please try again.");
  });
});

describe("describeGroupFundEvent", () => {
  it("reads a contribution, a payout and a correction", () => {
    expect(describeGroupFundEvent(ev({ memberId: "m1", accountId: "hdfc", period: "2026-11" }), fund, accountName)).toEqual({
      title: "Ravi",
      detail: "Appu loan · into HDFC · 2026-11",
      heldDelta: 6000,
    });
    expect(
      describeGroupFundEvent(ev({ kind: "payout", accountId: "hdfc", recipient: "Dokra centre", reference: "UTR1" }), fund, accountName)
    ).toEqual({ title: "Paid to Dokra centre", detail: "Appu loan · from HDFC · UTR1", heldDelta: -6000 });
    expect(
      describeGroupFundEvent(ev({ kind: "reversal", reversedKind: "contribution", memberId: "m1", accountId: "hdfc" }), fund, accountName)
    ).toEqual({ title: "Correction: contribution undone", detail: "Ravi · Appu loan", heldDelta: -6000 });
  });

  it("SPENDLY-700: marks a backfilled entry as recorded later, balance unchanged", () => {
    expect(
      describeGroupFundEvent(ev({ memberId: "m1", accountId: "hdfc", period: "2026-08", attributionOnly: true }), fund, accountName).detail
    ).toBe("Appu loan · in HDFC · 2026-08 · recorded later, balance unchanged");
    expect(
      describeGroupFundEvent(ev({ kind: "payout", accountId: "hdfc", attributionOnly: true }), fund, accountName).detail
    ).toBe("Appu loan · from HDFC · recorded later, balance unchanged");
  });

  it("shows a move between accounts as no change to what's held", () => {
    expect(
      describeGroupFundEvent(ev({ kind: "account_move", accountId: "cash", toAccountId: "hdfc" }), fund, accountName)
    ).toEqual({ title: "Moved between accounts", detail: "Cash → HDFC", heldDelta: 0 });
  });

  it("survives a purpose or member that no longer exists", () => {
    const row = describeGroupFundEvent(ev({ purposeId: "gone", memberId: "gone" }), fund, accountName);
    expect(row.title).toBe("Member");
    expect(row.detail).toBe("Purpose");
  });
});

describe("canReverseGroupFundEvent", () => {
  it("never undoes a correction or an entry already undone", () => {
    expect(canReverseGroupFundEvent(ev({}), new Set())).toBe(true);
    expect(canReverseGroupFundEvent(ev({}), new Set(["e1"]))).toBe(false);
    expect(canReverseGroupFundEvent(ev({ kind: "reversal" }), new Set())).toBe(false);
  });
});

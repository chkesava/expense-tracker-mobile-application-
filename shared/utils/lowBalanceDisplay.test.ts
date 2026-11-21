import { describe, expect, it } from "vitest";

import type { ShortfallItem } from "./autoDebitShortfall";
import {
  lowBalanceDueLabel,
  lowBalanceForCard,
  lowBalanceForPayingAccount,
  lowBalanceForSubscription,
  lowBalanceItemLabel,
  lowBalanceView,
} from "./lowBalanceDisplay";
import type { StoredAutoDebitShortfall } from "./serverResults";

const TODAY = "2026-11-20";

const item = (over: Partial<ShortfallItem> = {}): ShortfallItem => ({
  kind: "subscription",
  refId: "emi1",
  name: "Home loan EMI",
  accountId: "bank1",
  dueDate: "2026-11-22",
  amount: 12000,
  leadDays: 3,
  cumulative: 12000,
  shortBy: 2000,
  alerting: true,
  ...over,
});

const stored = (over: Partial<StoredAutoDebitShortfall> = {}): StoredAutoDebitShortfall => ({
  runId: "r1",
  today: TODAY,
  engineVersion: 1,
  hasShortfall: true,
  accounts: [
    {
      accountId: "bank1",
      accountName: "HDFC Savings",
      available: 10000,
      heldForOthers: 0,
      trusted: true,
      shortBy: 5000,
      items: [
        item(),
        item({ refId: "gym", name: "Gym", dueDate: "2026-11-21", amount: 500, cumulative: 500, shortBy: 0 }),
        item({ kind: "card", refId: "card1", billId: "b1", name: "HDFC Card", dueDate: "2026-11-23", amount: 3000, cumulative: 15000, shortBy: 5000 }),
      ],
    },
  ],
  ...over,
});

describe("lowBalanceView", () => {
  it("lists short debits inside their window, largest first, never covered ones", () => {
    const v = lowBalanceView(stored(), TODAY);
    expect(v.short.map((i) => [i.refId, i.shortBy, i.accountName])).toEqual([
      ["card1", 5000, "HDFC Savings"],
      ["emi1", 2000, "HDFC Savings"],
    ]);
    expect(v.unverified).toEqual([]);
  });

  it("uses the viewer's day: yesterday's result still applies; out-of-window and past items drop", () => {
    const yesterday = stored({ today: "2026-11-19" });
    expect(lowBalanceView(yesterday, TODAY).short).toHaveLength(2);
    // On the 23rd the EMI (22nd) has passed; the card (23rd) is due today.
    expect(lowBalanceView(stored({ today: "2026-11-22" }), "2026-11-23").short.map((i) => i.refId)).toEqual(["card1"]);
    // Due the 30th with 3 lead days: not shown yet on the 20th.
    expect(lowBalanceView(stored({ accounts: [{ ...stored().accounts[0]!, items: [item({ dueDate: "2026-11-30" })] }] }), TODAY).short).toEqual([]);
  });

  it("treats a result older than a day as missing", () => {
    expect(lowBalanceView(stored({ today: "2026-11-18" }), TODAY).short).toEqual([]);
    expect(lowBalanceView(null, TODAY).short).toEqual([]);
  });

  it("shows an untrusted account's debits as unverified, without a figure", () => {
    const untrusted = stored({ hasShortfall: false, accounts: [{ ...stored().accounts[0]!, trusted: false, available: null, shortBy: 0, items: [item({ shortBy: null })] }] });
    const v = lowBalanceView(untrusted, TODAY);
    expect(v.short).toEqual([]);
    expect(v.unverified.map((i) => [i.refId, i.accountName])).toEqual([["emi1", "HDFC Savings"]]);
  });

  it("picks one item, one card or one paying account", () => {
    const v = lowBalanceView(stored(), TODAY);
    expect(lowBalanceForSubscription(v, "emi1").short).toHaveLength(1);
    expect(lowBalanceForSubscription(v, "gym").short).toHaveLength(0);
    expect(lowBalanceForCard(v, "card1").short[0]).toMatchObject({ billId: "b1" });
    expect(lowBalanceForCard(v, "emi1").short).toHaveLength(0);
    expect(lowBalanceForPayingAccount(v, "bank1").short).toHaveLength(2);
    expect(lowBalanceForPayingAccount(v, "bank2").short).toHaveLength(0);
  });
});

describe("labels", () => {
  it("says today, tomorrow or the date", () => {
    expect(lowBalanceDueLabel(TODAY, TODAY)).toBe("today");
    expect(lowBalanceDueLabel("2026-11-21", TODAY)).toBe("tomorrow");
    expect(lowBalanceDueLabel("2026-11-22", TODAY)).toBe("22 Nov");
  });

  it("names a card's debit as its autopay", () => {
    expect(lowBalanceItemLabel({ kind: "card", name: "HDFC Card" })).toBe("HDFC Card autopay");
    expect(lowBalanceItemLabel({ kind: "subscription", name: "Netflix" })).toBe("Netflix");
  });
});

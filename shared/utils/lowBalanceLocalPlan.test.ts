import { describe, expect, it } from "vitest";

import type { ShortfallItem } from "./autoDebitShortfall";
import { planLowBalanceNotifications } from "./lowBalanceLocalPlan";
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

const stored = (items: ShortfallItem[], over: Partial<StoredAutoDebitShortfall> & { trusted?: boolean } = {}): StoredAutoDebitShortfall => ({
  runId: "r1",
  today: TODAY,
  engineVersion: 1,
  hasShortfall: true,
  accounts: [
    { accountId: "bank1", accountName: "HDFC Savings", available: 10000, heldForOthers: 0, trusted: over.trusted ?? true, shortBy: 2000, items },
  ],
  ...over,
});

const plan = (s: StoredAutoDebitShortfall | null, over: Partial<Parameters<typeof planLowBalanceNotifications>[0]> = {}) =>
  planLowBalanceNotifications({ stored: s, today: TODAY, enabled: true, showAmounts: false, currency: "INR", ...over });

describe("planLowBalanceNotifications", () => {
  it("one notice a day from today through the due day, with stable dated ids and the push's words", () => {
    expect(plan(stored([item()]))).toEqual([
      {
        id: "lowbal:subscription:emi1::2026-11-22@2026-11-20",
        fireDate: "2026-11-20",
        title: "Low balance before an auto-debit",
        body: "HDFC Savings may not cover Home loan EMI due on 22 Nov. Add money before it's debited.",
        url: "/recurring/emi1",
      },
      expect.objectContaining({ id: "lowbal:subscription:emi1::2026-11-22@2026-11-21", fireDate: "2026-11-21", body: expect.stringContaining("due tomorrow") }),
      expect.objectContaining({ fireDate: "2026-11-22", title: "Low balance for today's auto-debit", body: expect.stringContaining("due today") }),
    ]);
  });

  it("starts at the lead window when it opens later", () => {
    const days = plan(stored([item({ dueDate: "2026-11-30", leadDays: 2 })])).map((n) => n.fireDate);
    expect(days).toEqual(["2026-11-28", "2026-11-29", "2026-11-30"]);
  });

  it("card autopay opens its bill", () => {
    const [first] = plan(stored([item({ kind: "card", refId: "card1", billId: "b1", name: "HDFC Card", dueDate: TODAY })]));
    expect(first).toMatchObject({ url: "/credit-card-bills/b1", id: "lowbal:card:card1:b1:2026-11-20@2026-11-20" });
    expect(first!.body).toContain("HDFC Card autopay");
  });

  it("shows amounts only when the user allows them", () => {
    const [first] = plan(stored([item()]), { showAmounts: true });
    expect(first!.body).toContain("short by ₹2,000");
  });

  it("plans nothing: switched off, covered, untrusted, past due, stale or no result", () => {
    expect(plan(stored([item()]), { enabled: false })).toEqual([]);
    expect(plan(stored([item({ shortBy: 0 })]))).toEqual([]);
    expect(plan(stored([item({ shortBy: null })], { trusted: false }))).toEqual([]);
    expect(plan(stored([item({ dueDate: "2026-11-19" })]))).toEqual([]);
    expect(plan(stored([item()], { today: "2026-11-18" }))).toEqual([]);
    expect(plan(null)).toEqual([]);
  });
});

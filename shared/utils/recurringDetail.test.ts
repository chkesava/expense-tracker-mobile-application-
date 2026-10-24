import { describe, expect, it } from "vitest";

import type { AccountTransfer, Expense } from "@/shared/types/expense";
import type { Subscription } from "@/shared/types/subscription";
import { evaluateSubscriptionDue } from "./subscriptionProcessor";
import { autoPostState, recurringHistory, recurringHref, safeDecodeParam, upcomingPaymentDates } from "./recurringDetail";

const sub = (p: Partial<Subscription> = {}): Subscription => ({
  id: "s1",
  name: "Netflix",
  amount: 649,
  category: "Entertainment",
  dayOfMonth: 12,
  frequency: "monthly",
  isActive: true,
  lastProcessed: "2026-10",
  type: "subscription",
  accountId: "hdfc",
  ...p,
});

const at = (iso: string) => new Date(`${iso}T10:00:00`);

describe("upcomingPaymentDates", () => {
  it("starts from the app's own next-renewal rule and steps monthly", () => {
    expect(upcomingPaymentDates(sub(), at("2026-10-23"), 5)).toEqual([
      "2026-11-12",
      "2026-12-12",
      "2027-01-12",
      "2027-02-12",
      "2027-03-12",
    ]);
  });

  it("clamps a late billing day to short months", () => {
    expect(upcomingPaymentDates(sub({ dayOfMonth: 31, lastProcessed: "2026-12" }), at("2027-01-05"), 3)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });

  it("agrees with the auto-poster: the first projected date is when it becomes due", () => {
    const s = sub({ lastProcessed: "2026-10" });
    const [first] = upcomingPaymentDates(s, at("2026-10-23"), 1);
    expect(evaluateSubscriptionDue(s, at("2026-11-11")).isDue).toBe(false);
    expect(evaluateSubscriptionDue(s, at(first)).isDue).toBe(true);
  });

  it("does not start before startMonth and stops at an EMI's last month", () => {
    expect(upcomingPaymentDates(sub({ lastProcessed: "", startMonth: "2027-02" }), at("2026-10-23"), 2)).toEqual([
      "2027-02-12",
      "2027-03-12",
    ]);
    expect(upcomingPaymentDates(sub({ type: "emi", endMonth: 12, endYear: 2026 }), at("2026-10-23"), 5)).toEqual(["2026-11-12", "2026-12-12"]);
  });

  it("steps every-N-days items from their last posting", () => {
    const s = sub({ frequency: "every_n_days", intervalDays: 2, lastProcessedDate: "2026-10-22" });
    expect(upcomingPaymentDates(s, at("2026-10-23"), 3)).toEqual(["2026-10-24", "2026-10-26", "2026-10-28"]);
  });

  it("projects nothing for paused or completed items", () => {
    expect(upcomingPaymentDates(sub({ isActive: false }), at("2026-10-23"), 5)).toEqual([]);
    expect(upcomingPaymentDates(sub({ isCompleted: true }), at("2026-10-23"), 5)).toEqual([]);
  });
});

describe("recurringHistory", () => {
  const exp = (p: Partial<Expense>): Expense => ({
    id: "x",
    amount: 649,
    category: "Entertainment",
    note: "Netflix",
    date: "2026-10-12",
    month: "2026-10",
    createdAt: null,
    ...p,
  });

  it("lists only rows that carry the link, newest first, deleted ones excluded", () => {
    const expenses = [
      exp({ id: "s1_2026-09", subscriptionId: "s1", date: "2026-09-12", accountId: "hdfc" }),
      exp({ id: "s1_2026-10", subscriptionId: "s1", date: "2026-10-12", accountId: "hdfc" }),
      exp({ id: "manual", date: "2026-10-12" }), // looks the same, no link: not history
      exp({ id: "other", subscriptionId: "s2" }),
      exp({ id: "s1_2026-08", subscriptionId: "s1", date: "2026-08-12", deletedAt: "2026-08-13T00:00:00Z" }),
    ];
    expect(recurringHistory(sub(), expenses, []).map((p) => p.id)).toEqual(["s1_2026-10", "s1_2026-09"]);
  });

  it("uses transfers for a recurring transfer", () => {
    const transfers: AccountTransfer[] = [
      { id: "t1", fromAccountId: "hdfc", toAccountId: "sav", amount: 5000, date: "2026-10-01", subscriptionId: "s1" },
      { id: "t2", fromAccountId: "hdfc", toAccountId: "sav", amount: 5000, date: "2026-10-02" },
    ];
    expect(recurringHistory(sub({ type: "transfer" }), [], transfers)).toEqual([
      { id: "t1", kind: "transfer", date: "2026-10-01", amount: 5000, accountId: "hdfc" },
    ]);
  });

  it("is empty for an unsaved item", () => {
    expect(recurringHistory(sub({ id: undefined }), [], [])).toEqual([]);
  });
});

describe("autoPostState", () => {
  it("derives what the auto-poster will do", () => {
    expect(autoPostState(sub())).toBe("posts");
    expect(autoPostState(sub({ accountId: undefined }))).toBe("needsAccount");
    expect(autoPostState(sub({ source: "sms" }))).toBe("trackedOnly");
    expect(autoPostState(sub({ isActive: false }))).toBe("paused");
    expect(autoPostState(sub({ isCompleted: true }))).toBe("completed");
    expect(autoPostState(sub({ type: "transfer", toAccountId: undefined }))).toBe("needsAccount");
  });
});

describe("recurringHref", () => {
  it("encodes the id", () => {
    expect(recurringHref("abc/1")).toBe("/recurring/abc%2F1");
  });
});

describe("safeDecodeParam (PR #239 review)", () => {
  it("decodes an encoded id", () => {
    expect(safeDecodeParam("sub%201")).toBe("sub 1");
    expect(safeDecodeParam("abc123")).toBe("abc123");
  });

  it("returns a malformed sequence unchanged instead of throwing", () => {
    expect(() => safeDecodeParam("%E0%A4")).not.toThrow();
    expect(safeDecodeParam("%E0%A4")).toBe("%E0%A4");
    expect(safeDecodeParam("%")).toBe("%");
  });
});

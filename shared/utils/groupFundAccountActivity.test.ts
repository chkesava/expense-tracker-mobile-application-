import { describe, expect, it } from "vitest";

import type { Account, AccountEntry } from "../types/expense";
import { enrichAccountActivities } from "./accountActivityFilters";
import { buildAccountActivities, computeBankBalance } from "./accountBalance";
import { summarizeAccountMonth } from "./accountMonthSummary";
import { activitySubtypeLabel } from "./activityDisplay";
import { isGroupFundEntrySource } from "./groupFundModel";

/**
 * SPENDLY-684 (AC3, AC6, AC11): a Group Funds entry moves the real balance
 * exactly once, and every account screen shows it as pass-through money —
 * never income, an expense or a manual adjustment the user can delete.
 */

const account: Account = {
  id: "hdfc",
  name: "HDFC",
  typeId: "bank-type",
  openingBalance: 1000,
  balanceInitialized: true,
  balanceAsOfDate: "2026-11-01",
};

const entries: AccountEntry[] = [
  {
    id: "gf_c1",
    accountId: "hdfc",
    amount: 6000,
    direction: "credit",
    date: "2026-11-05",
    note: "Ravi — Dokra · Appu loan",
    source: "group_fund_contribution",
    linkedGroupFundId: "f1",
    linkedGroupFundEventId: "c1",
  },
  {
    id: "gf_p1",
    accountId: "hdfc",
    amount: 2000,
    direction: "debit",
    date: "2026-11-06",
    source: "group_fund_payout",
    linkedGroupFundId: "f1",
    linkedGroupFundEventId: "p1",
  },
  {
    id: "manual",
    accountId: "hdfc",
    amount: 50,
    direction: "credit",
    date: "2026-11-07",
  },
];

describe("Group Funds entries on account screens", () => {
  it("recognises only the group fund sources", () => {
    expect(isGroupFundEntrySource("group_fund_contribution")).toBe(true);
    expect(isGroupFundEntrySource("group_fund_reversal")).toBe(true);
    expect(isGroupFundEntrySource("split_collection")).toBe(false);
    expect(isGroupFundEntrySource(undefined)).toBe(false);
  });

  it("moves the computed balance exactly once per entry", () => {
    expect(computeBankBalance(account, [], [], [], entries)).toBe(1000 + 6000 - 2000 + 50);
  });

  it("is flagged as group fund, not a manual adjustment", () => {
    const activities = buildAccountActivities(account, "Bank", [], [], [], entries);
    const byId = new Map(activities.map((a) => [a.id, a]));
    expect(byId.get("entry-gf_c1")).toMatchObject({ isGroupFund: true, isManualEntry: false });
    expect(byId.get("entry-gf_p1")).toMatchObject({ isGroupFund: true, isManualEntry: false });
    expect(byId.get("entry-manual")).toMatchObject({ isManualEntry: true });
    expect(byId.get("entry-manual")?.isGroupFund).toBeUndefined();
    expect(activitySubtypeLabel(byId.get("entry-gf_c1")!)).toBe("Group fund");
    expect(activitySubtypeLabel(byId.get("entry-manual")!)).toBe("Adjustment");
  });

  it("is classified as a transfer, so month income and expenses ignore it", () => {
    const activities = buildAccountActivities(account, "Bank", [], [], [], entries);
    const records = enrichAccountActivities(activities, [], [], entries);
    const kinds = Object.fromEntries(records.map((r) => [r.activity.id, r.kind]));
    expect(kinds["entry-gf_c1"]).toBe("transfers");
    expect(kinds["entry-gf_p1"]).toBe("transfers");
    expect(kinds["entry-manual"]).toBe("other");
    const month = summarizeAccountMonth(records, "2026-11");
    expect(month.income).toBe(0);
    expect(month.expenses).toBe(0);
  });
});

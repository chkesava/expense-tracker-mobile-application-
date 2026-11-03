import { describe, expect, it } from "vitest";

import { MAX_PUSH_REFS, parsePushRequest, PUSHABLE_COLLECTIONS, pushRefFromPath } from "./pushRefs";

describe("push refs (SPENDLY-583)", () => {
  it("pushable collections are exactly the synced ones (Wave 1 + SPENDLY-609 goals + Waves 2 and 3 + SPENDLY-591)", () => {
    expect([...PUSHABLE_COLLECTIONS].sort()).toEqual([
      "accountEntries", "accountPayments", "accountTransfers", "accountTypes", "accounts",
      "borrowingRepayments", "borrowings", "calendarReminders", "categories",
      "categorizationRules", "categoryBudgets", "creditCardBills", "decisions",
      "epfContributionEvents", "epfContributions", "epfEstablishments", "epfInterestEntries",
      "epfProfile", "epfReconciliations", "epfTransferEvents", "epfTransfers", "epfWageHistory",
      "expenses", "feeReviews", "feeSignalDismissals", "financialGoals", "goalEvents",
      "goalFundingPlans", "holdings", "incomes", "investmentCashTransactions", "investments",
      "ledgerEvents", "merchantOverrides", "netWorthHistory", "portfolioSettings",
      "portfolioTransactions", "receivableRepayments", "receivables", "recurringDismissals",
      "runwayOverrides", "runwaySettings", "sipPlans", "sipTransactions", "spaces",
      "subscriptions", "trips", "userSettings", "virtualPositions", "watchlists", "watchlists/items", "whatIfScenarios",
    ]);
    // The name lock is not data and is never pushed.
    expect(pushRefFromPath("users/u1/goalNames/n_car", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1/goalEvents/ev1", "u1")).toEqual({ collection: "goalEvents", docId: "ev1" });
  });

  it("turns the signed-in user's synced document paths into refs, and nothing else", () => {
    expect(pushRefFromPath("users/u1/expenses/e1", "u1")).toEqual({ collection: "expenses", docId: "e1" });
    expect(pushRefFromPath("users/u2/expenses/e1", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1_duress/expenses/e1", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1/expenses/e1", "u1_duress")).toBeNull();
    expect(pushRefFromPath("users/u1/notifications/n1", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1/meta/outbox/acks/x", "u1")).toBeNull();
    // SPENDLY-591 part C: the users/{uid} document itself, under its fixed id.
    expect(pushRefFromPath("users/u1", "u1")).toEqual({ collection: "userSettings", docId: "settings" });
    expect(pushRefFromPath("users/u1_duress", "u1_duress")).toBeNull();
    // The root spec's key is a label, never a sub-collection.
    expect(pushRefFromPath("users/u1/userSettings/settings", "u1")).toBeNull();
    expect(parsePushRequest({ refs: [{ collection: "userSettings", docId: "settings" }] }).ok).toBe(true);
    expect(parsePushRequest({ refs: [{ collection: "userSettings", docId: "other" }] }).ok).toBe(false);
  });

  it("SPENDLY-591: nested paths become a '{parentId}/{id}' ref, and only for a nested synced collection", () => {
    expect(pushRefFromPath("users/u1/watchlists/default/items/INFY.NS", "u1")).toEqual({ collection: "watchlists/items", docId: "default/INFY.NS" });
    expect(pushRefFromPath("users/u1/watchlists/default", "u1")).toEqual({ collection: "watchlists", docId: "default" });
    expect(pushRefFromPath("users/u2/watchlists/default/items/INFY.NS", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1/watchlists/default/other/x", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1/watchlists/default/items/x/deeper/y", "u1")).toBeNull();
    expect(parsePushRequest({ refs: [{ collection: "watchlists/items", docId: "default/INFY.NS" }] }).ok).toBe(true);
    // A nested ref needs exactly "{parent}/{id}"; a flat one never takes a "/".
    for (const docId of ["INFY.NS", "a/b/c", "/x", "x/", "../x"]) {
      expect(parsePushRequest({ refs: [{ collection: "watchlists/items", docId }] }).ok).toBe(false);
    }
    expect(parsePushRequest({ refs: [{ collection: "watchlists", docId: "a/b" }] }).ok).toBe(false);
  });

  it("parses refs, de-duplicates them, and caps the count", () => {
    const parsed = parsePushRequest({ refs: [{ collection: "expenses", docId: "e1" }, { collection: "expenses", docId: "e1" }] });
    expect(parsed).toEqual({ ok: true, mode: "refs", refs: [{ collection: "expenses", docId: "e1" }] });
    expect(parsePushRequest({ refs: Array.from({ length: MAX_PUSH_REFS + 1 }, (_, i) => ({ collection: "expenses", docId: `e${i}` })) }).ok).toBe(false);
    expect(parsePushRequest({ mode: "user", refs: "ignored" })).toEqual({ ok: true, mode: "user" });
  });
});

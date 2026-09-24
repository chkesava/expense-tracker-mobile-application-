import { describe, expect, it } from "vitest";

import {
  ADD_ACTIONS,
  ADD_ACTION_IDS,
  flatAddActions,
  orderAddActions,
  resolveAddActionContext,
  type AddActionContext,
} from "@/shared/config/addActions";

const CONTEXTS: AddActionContext[] = [
  "journal",
  "accounts",
  "cards",
  "ccBills",
  "borrowings",
  "receivables",
  "subscriptions",
  "general",
];

describe("the add catalogue", () => {
  it("offers every kind the FAB is the only entry point for", () => {
    expect(ADD_ACTIONS.map((a) => a.id)).toEqual([
      "expense",
      "income",
      "transfer",
      "receivable",
      "borrowing",
      "recurring",
      "investment",
      "cardBill",
    ]);
  });

  it("gates investments and nothing else", () => {
    expect(
      ADD_ACTIONS.filter((a) => a.requiresInvestments).map((a) => a.id)
    ).toEqual(["investment"]);
  });
});

describe("orderAddActions", () => {
  it.each(CONTEXTS)("shows each action exactly once on %s", (context) => {
    const ids = flatAddActions(context, { investmentsEnabled: true }).map(
      (a) => a.id
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ADD_ACTION_IDS].sort());
  });

  it("hides investments when the feature is off", () => {
    const ids = flatAddActions("journal").map((a) => a.id);
    expect(ids).not.toContain("investment");
    expect(ids).toContain("expense");
  });

  it("leads with the section you are looking at", () => {
    expect(orderAddActions("borrowings").suggested.map((a) => a.id)).toEqual([
      "borrowing",
      "expense",
    ]);
    expect(orderAddActions("receivables").suggested.map((a) => a.id)).toEqual([
      "receivable",
      "expense",
    ]);
    expect(orderAddActions("subscriptions").suggested.map((a) => a.id)).toEqual([
      "recurring",
      "expense",
    ]);
    expect(orderAddActions("ccBills").suggested.map((a) => a.id)).toEqual([
      "cardBill",
      "expense",
    ]);
    expect(orderAddActions("accounts").suggested[0]?.id).toBe("transfer");
  });

  it("suggests nothing outside a section that has a preference", () => {
    const { suggested, rest } = orderAddActions("general");
    expect(suggested).toEqual([]);
    expect(rest.map((a) => a.id)).toEqual(
      ADD_ACTIONS.filter((a) => !a.requiresInvestments).map((a) => a.id)
    );
  });

  it("keeps the canonical order under the suggestions", () => {
    const { rest } = orderAddActions("subscriptions", {
      investmentsEnabled: true,
    });
    expect(rest.map((a) => a.id)).toEqual([
      "income",
      "transfer",
      "receivable",
      "borrowing",
      "investment",
      "cardBill",
    ]);
  });

  it("never promotes an action the user cannot see", () => {
    // `cards` suggests a card bill payment; investments stay gated regardless.
    const { suggested } = orderAddActions("cards");
    expect(suggested.map((a) => a.id)).not.toContain("investment");
  });
});

describe("resolveAddActionContext", () => {
  it("reads the Money hub's active section", () => {
    expect(resolveAddActionContext("/ledger", "borrowings")).toBe("borrowings");
    expect(resolveAddActionContext("/(app)/ledger", "subscriptions")).toBe(
      "subscriptions"
    );
    expect(resolveAddActionContext("/ledger?tab=cards", "cards")).toBe("cards");
  });

  it("falls back to the Journal for an unknown hub section", () => {
    expect(resolveAddActionContext("/ledger", undefined)).toBe("journal");
    expect(resolveAddActionContext("/ledger", "mystery")).toBe("journal");
  });

  it("resolves stack detail screens from their own path", () => {
    expect(resolveAddActionContext("/credit-card-bills/abc", "expenses")).toBe(
      "ccBills"
    );
    expect(resolveAddActionContext("/accounts/abc", "expenses")).toBe("accounts");
    expect(resolveAddActionContext("/transactions/abc", "accounts")).toBe(
      "journal"
    );
  });

  it("suggests nothing away from the money surfaces", () => {
    expect(resolveAddActionContext("/dashboard", "borrowings")).toBe("general");
    expect(resolveAddActionContext("/insights")).toBe("general");
    expect(resolveAddActionContext("")).toBe("general");
  });
});

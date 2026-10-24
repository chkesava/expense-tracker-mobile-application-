import { describe, expect, it } from "vitest";

import {
  isPersistableRoute,
  isRestorableRoute,
  lastRouteStorageKey,
  normalizeStoredRoute,
  routeWithViewParams,
  shouldRestoreRoute,
} from "./routeRestoration";

describe("lastRouteStorageKey", () => {
  it("scopes the saved route to a user so it cannot leak between accounts", () => {
    expect(lastRouteStorageKey("userA")).not.toBe(lastRouteStorageKey("userB"));
    expect(lastRouteStorageKey("userA")).toContain("userA");
  });
});

describe("normalizeStoredRoute", () => {
  it("strips the router group segment", () => {
    expect(normalizeStoredRoute("/(app)/ledger")).toBe("/ledger");
    expect(normalizeStoredRoute("/(nutrition)/log")).toBe("/log");
  });

  it("maps a bare group to root", () => {
    expect(normalizeStoredRoute("/(app)")).toBe("/");
  });

  it("handles missing pathnames", () => {
    expect(normalizeStoredRoute(null)).toBe("");
    expect(normalizeStoredRoute(undefined)).toBe("");
  });
});

describe("isPersistableRoute", () => {
  it("never remembers auth or onboarding screens", () => {
    expect(isPersistableRoute("/(auth)/login")).toBe(false);
    expect(isPersistableRoute("/login")).toBe(false);
    expect(isPersistableRoute("/onboarding")).toBe(false);
    expect(isPersistableRoute("/google-auth")).toBe(false);
  });

  it("never remembers the bare root", () => {
    expect(isPersistableRoute("/")).toBe(false);
    expect(isPersistableRoute("")).toBe(false);
  });

  it("remembers real screens", () => {
    expect(isPersistableRoute("/ledger")).toBe(true);
    expect(isPersistableRoute("/accounts/abc123")).toBe(true);
  });
});

describe("isRestorableRoute", () => {
  it("accepts top-level sections and detail routes", () => {
    expect(isRestorableRoute("/decisions")).toBe(true);
    expect(isRestorableRoute("/inbox")).toBe(true);
    expect(isRestorableRoute("/decisions/abc")).toBe(true);
    expect(isRestorableRoute("/fees")).toBe(true);
    expect(isRestorableRoute("/fees/expense__abc")).toBe(true);
    expect(isRestorableRoute("/ledger")).toBe(true);
    expect(isRestorableRoute("/investments")).toBe(true);
    expect(isRestorableRoute("/investments?tab=sip")).toBe(true);
    expect(isRestorableRoute("/settings")).toBe(true);
    expect(isRestorableRoute("/settings/privacy")).toBe(true);
    expect(isRestorableRoute("/accounts/abc123")).toBe(true);
    expect(isRestorableRoute("/credit-card-bills/bill-1")).toBe(true);
    expect(isRestorableRoute("/transactions/exp-1?kind=expense&accountId=a1")).toBe(true);
    expect(isRestorableRoute("/runway/sources")).toBe(true);
    expect(isRestorableRoute("/runway")).toBe(true);
    expect(isRestorableRoute("/calendar")).toBe(true);
    expect(isRestorableRoute("/what-if")).toBe(true);
    expect(isRestorableRoute("/what-if/abc")).toBe(true);
    expect(isRestorableRoute("/goals/optimizer")).toBe(true);
    expect(isRestorableRoute("/spending?month=2026-10&tab=trends")).toBe(true);
    expect(isRestorableRoute("/spending/Food?month=2026-10")).toBe(true);
    expect(isRestorableRoute("/budgets?month=2026-10&tab=trends")).toBe(true);
    expect(isRestorableRoute("/budgets/Food?month=2026-10")).toBe(true);
    expect(isRestorableRoute("/transactions?month=2026-10")).toBe(true);
    expect(isRestorableRoute("/trends?month=2026-10&tab=insights")).toBe(true);
    expect(isRestorableRoute("/spending/Food/__none__?month=2026-10")).toBe(true);
    expect(isRestorableRoute("/top-categories?month=2026-10&period=last_3_months")).toBe(true);
    expect(isRestorableRoute("/recurring")).toBe(true);
    expect(isRestorableRoute("/recurring/sub-1")).toBe(true);
  });

  it("rejects routes the shell cannot resume into", () => {
    expect(isRestorableRoute("/dashboard")).toBe(false);
    expect(isRestorableRoute("/login")).toBe(false);
    expect(isRestorableRoute("/nonsense")).toBe(false);
  });
});

describe("shouldRestoreRoute", () => {
  it("resumes the saved screen on a plain cold start", () => {
    expect(
      shouldRestoreRoute({
        savedRoute: "/ledger",
        currentRoute: "/dashboard",
        openedFromLink: false,
      })
    ).toBe(true);
  });

  it("never overrides a deep link or notification destination", () => {
    expect(
      shouldRestoreRoute({
        savedRoute: "/ledger",
        currentRoute: "/dashboard",
        openedFromLink: true,
      })
    ).toBe(false);
  });

  it("never overrides a home-screen Quick Action destination", () => {
    expect(
      shouldRestoreRoute({
        savedRoute: "/ledger",
        currentRoute: "/dashboard",
        openedFromLink: false,
        openedFromShortcut: true,
      })
    ).toBe(false);
  });

  it("stands down once the user is already somewhere specific", () => {
    // The launch redirect only lands on a landing route; anything else means
    // navigation already happened and that intent wins.
    expect(
      shouldRestoreRoute({
        savedRoute: "/ledger",
        currentRoute: "/credit-card-bills/bill-1",
        openedFromLink: false,
      })
    ).toBe(false);
  });

  it("does not re-navigate to the screen already showing", () => {
    expect(
      shouldRestoreRoute({
        savedRoute: "/ledger",
        currentRoute: "/ledger",
        openedFromLink: false,
      })
    ).toBe(false);
  });

  it("ignores an empty or unrestorable saved route", () => {
    expect(
      shouldRestoreRoute({
        savedRoute: null,
        currentRoute: "/dashboard",
        openedFromLink: false,
      })
    ).toBe(false);
    expect(
      shouldRestoreRoute({
        savedRoute: "/login",
        currentRoute: "/dashboard",
        openedFromLink: false,
      })
    ).toBe(false);
  });

  it("resumes from a configured default view, not just the dashboard", () => {
    expect(
      shouldRestoreRoute({
        savedRoute: "/settings",
        currentRoute: "/insights",
        openedFromLink: false,
      })
    ).toBe(true);
  });
});

describe("routeWithViewParams (PR #239 review)", () => {
  it("keeps a drill-down's month and tab, in a stable order, so a cold start reopens the same view", () => {
    expect(routeWithViewParams("/spending", { tab: "trends", month: "2026-10" })).toBe("/spending?month=2026-10&tab=trends");
    expect(routeWithViewParams("/trends", { gran: "yearly", month: "2026-09" })).toBe("/trends?month=2026-09&gran=yearly");
  });

  it("drops path params, empty values and unknown keys, and encodes values", () => {
    expect(routeWithViewParams("/spending/Food%20%26%20Groceries", { category: "Food & Groceries", month: "2026-10", foo: "x", tab: "" }))
      .toBe("/spending/Food%20%26%20Groceries?month=2026-10");
    expect(routeWithViewParams("/spending/Food/Groceries", { merchant: "D-Mart & Co" })).toBe("/spending/Food/Groceries?merchant=D-Mart%20%26%20Co");
    expect(routeWithViewParams("/ledger", {})).toBe("/ledger");
  });

  it("the saved route is still restorable", () => {
    expect(isRestorableRoute(routeWithViewParams("/trends", { month: "2026-10", gran: "weekly" }))).toBe(true);
    expect(isRestorableRoute(routeWithViewParams("/spending/Food", { month: "2026-10", tab: "budget" }))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  isPersistableRoute,
  isRestorableRoute,
  lastRouteStorageKey,
  normalizeStoredRoute,
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
    expect(isRestorableRoute("/ledger")).toBe(true);
    expect(isRestorableRoute("/investments")).toBe(true);
    expect(isRestorableRoute("/investments?tab=sip")).toBe(true);
    expect(isRestorableRoute("/settings")).toBe(true);
    expect(isRestorableRoute("/settings/privacy")).toBe(true);
    expect(isRestorableRoute("/accounts/abc123")).toBe(true);
    expect(isRestorableRoute("/credit-card-bills/bill-1")).toBe(true);
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

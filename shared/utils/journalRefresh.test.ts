import { describe, expect, it } from "vitest";

import {
  journalRefreshAction,
  journalScopeLabel,
} from "./journalRefresh";

describe("journalRefreshAction (SPENDLY-585)", () => {
  it("leaves healthy live listeners alone, so a pull costs no reads", () => {
    expect(journalRefreshAction({ hasError: false })).toBe("none");
  });

  it("re-subscribes only after a listener failed", () => {
    expect(journalRefreshAction({ hasError: true })).toBe("resubscribe");
  });
});

describe("journalScopeLabel (SPENDLY-585)", () => {
  it("names the month once the month is complete", () => {
    expect(journalScopeLabel({ monthKey: "2026-10", monthOverridden: false, periodComplete: true })).toBe("2026-10");
  });

  it("flags a month that may still have older rows", () => {
    expect(journalScopeLabel({ monthKey: "2025-03", monthOverridden: false, periodComplete: false })).toBe(
      "2025-03 · loaded so far"
    );
  });

  it("names a custom range instead of the month it overrides", () => {
    expect(journalScopeLabel({ monthKey: "2026-10", monthOverridden: true, periodComplete: true })).toBe("custom range");
    expect(journalScopeLabel({ monthKey: "2026-10", monthOverridden: true, periodComplete: false })).toBe(
      "custom range · loaded so far"
    );
  });
});


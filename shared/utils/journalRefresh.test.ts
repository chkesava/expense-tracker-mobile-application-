import { describe, expect, it } from "vitest";

import {
  journalHistoryNotice,
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

describe("journalHistoryNotice (SPENDLY-585)", () => {
  it("never quotes the size of the live window", () => {
    for (const periodComplete of [true, false]) {
      const { title, body } = journalHistoryNotice({ periodComplete });
      expect(`${title} ${body}`).not.toMatch(/\d/);
    }
  });

  it("says the period is complete when it is", () => {
    expect(journalHistoryNotice({ periodComplete: true }).body).toContain("Everything in this period is shown");
    expect(journalHistoryNotice({ periodComplete: false }).body).not.toContain("Everything in this period is shown");
  });
});

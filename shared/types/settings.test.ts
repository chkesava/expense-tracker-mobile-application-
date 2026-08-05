import { describe, expect, it } from "vitest";

import {
  SETTINGS_DEFAULTS,
  mergeSettingsFromDoc,
} from "./settings";

describe("mergeSettingsFromDoc", () => {
  it("returns defaults for empty data", () => {
    const merged = mergeSettingsFromDoc(null);
    expect(merged.defaultView).toBe(SETTINGS_DEFAULTS.defaultView);
    expect(merged.navigationStyle).toBe("bottom");
    expect(merged.enableInvestments).toBe(true);
    expect(merged.dashboardWidgets.subscriptions).toBe(true);
  });

  it("deep-merges dashboardWidgets and preserves overrides", () => {
    const merged = mergeSettingsFromDoc({
      monthlyBudget: 25000,
      upiId: "me@upi",
      navigationStyle: "dock",
      defaultView: "expenses",
      dashboardWidgets: { focus: false },
    });
    expect(merged.monthlyBudget).toBe(25000);
    expect(merged.upiId).toBe("me@upi");
    expect(merged.navigationStyle).toBe("dock");
    expect(merged.defaultView).toBe("expenses");
    expect(merged.dashboardWidgets.focus).toBe(false);
    expect(merged.dashboardWidgets.subscriptions).toBe(true);
  });
});

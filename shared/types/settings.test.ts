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

  it("falls back timezone/currency/language when blank or missing", () => {
    const merged = mergeSettingsFromDoc({
      timezone: "",
      currency: "",
      language: "",
    });
    expect(merged.timezone).toBe(SETTINGS_DEFAULTS.timezone);
    expect(merged.currency).toBe("INR");
    expect(merged.language).toBe("en");
  });

  it("preserves explicit timezone/currency when provided", () => {
    const merged = mergeSettingsFromDoc({
      timezone: "Asia/Kolkata",
      currency: "USD",
      language: "hi",
    });
    expect(merged.timezone).toBe("Asia/Kolkata");
    expect(merged.currency).toBe("USD");
    expect(merged.language).toBe("hi");
  });

  it("deep-merges onboarding and restores missing step arrays", () => {
    const merged = mergeSettingsFromDoc({
      onboarding: {
        welcomeCompleted: true,
        completedSteps: ["budget"],
      },
    });
    expect(merged.onboarding.welcomeCompleted).toBe(true);
    expect(merged.onboarding.completedSteps).toEqual(["budget"]);
    expect(merged.onboarding.visitedScreens).toEqual([]);
    expect(merged.onboarding.onboardingDismissed).toBe(false);
  });

  it("keeps privacy pin fields from the doc when present", () => {
    const merged = mergeSettingsFromDoc({
      privacyPin: "1234",
      fakePin: "9999",
      lockOnInactivity: false,
      inactivityTimeout: 120,
    });
    expect(merged.privacyPin).toBe("1234");
    expect(merged.fakePin).toBe("9999");
    expect(merged.lockOnInactivity).toBe(false);
    expect(merged.inactivityTimeout).toBe(120);
  });

  it("uses default dashboardOrder when doc omits it", () => {
    const merged = mergeSettingsFromDoc({ monthlyBudget: 1 });
    expect(merged.dashboardOrder).toEqual(SETTINGS_DEFAULTS.dashboardOrder);
  });
});

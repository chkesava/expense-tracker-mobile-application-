import { describe, expect, it } from "vitest";

import { SETTINGS_DEFAULTS, type OnboardingState } from "../types/settings";
import { applyOnboardingPatches, onboardingPatchesAreNoop } from "./onboardingPatch";

const stored: OnboardingState = {
  welcomeCompleted: true,
  onboardingDismissed: false,
  completedSteps: ["milestone_25"],
  setupStartedAt: "2026-10-22T09:00:00.000Z",
  visitedScreens: ["insights"],
  currencyChosen: true,
};

describe("applyOnboardingPatches (SPENDLY-565)", () => {
  it("adds a visited screen without touching the stored progress", () => {
    const next = applyOnboardingPatches(stored, [{ addVisitedScreens: ["dashboard"] }]);
    expect(next).toEqual({ ...stored, visitedScreens: ["insights", "dashboard"] });
  });

  it("reproduces the bug it fixes: spreading defaults would have wiped progress", () => {
    const buggyWrite = { ...SETTINGS_DEFAULTS.onboarding, visitedScreens: ["dashboard"] };
    expect(buggyWrite.welcomeCompleted).toBe(false);
    expect(buggyWrite.completedSteps).toEqual([]);
    // The patch, applied once settings are hydrated, keeps every flag.
    const fixed = applyOnboardingPatches(stored, [{ addVisitedScreens: ["dashboard"] }]);
    expect(fixed.welcomeCompleted).toBe(true);
    expect(fixed.currencyChosen).toBe(true);
    expect(fixed.completedSteps).toEqual(["milestone_25"]);
    expect(fixed.setupStartedAt).toBe(stored.setupStartedAt);
  });

  it("applies queued patches in order, with additive lists and explicit flags", () => {
    const next = applyOnboardingPatches(stored, [
      { addVisitedScreens: ["dashboard"] },
      { addCompletedSteps: ["milestone_50", "milestone_25"] },
      { onboardingDismissed: true },
      { addVisitedScreens: ["dashboard"] },
    ]);
    expect(next.visitedScreens).toEqual(["insights", "dashboard"]);
    expect(next.completedSteps).toEqual(["milestone_25", "milestone_50"]);
    expect(next.onboardingDismissed).toBe(true);
    expect(next.welcomeCompleted).toBe(true);
  });

  it("detects a no-op so a revisit doesn't write", () => {
    expect(onboardingPatchesAreNoop(stored, [{ addVisitedScreens: ["insights"] }])).toBe(true);
    expect(onboardingPatchesAreNoop(stored, [{ addVisitedScreens: ["dashboard"] }])).toBe(false);
    expect(onboardingPatchesAreNoop(stored, [{ welcomeCompleted: true }])).toBe(true);
  });
});

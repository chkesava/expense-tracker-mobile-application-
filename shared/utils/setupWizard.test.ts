import { describe, expect, it } from "vitest";

import {
  SETUP_WIZARD_STEP_COUNT,
  clampWizardStep,
  nextWizardStep,
  openingWizardStep,
  previousWizardStep,
  shouldSeedWizard,
} from "./setupWizard";

/**
 * Replays the modal's state machine: the step state, the "was open" ref, and
 * the seed effect that runs on every render-relevant change (open flag,
 * settings, user doc). Mirrors components/onboarding/SetupWizardModal.tsx.
 */
function simulate(initialStep: number) {
  let open = false;
  let wasOpen = false;
  let step = 0;
  let done = false;
  const effect = () => {
    if (shouldSeedWizard(wasOpen, open)) step = openingWizardStep(initialStep);
    wasOpen = open;
  };
  return {
    open() {
      open = true;
      done = false;
      effect();
    },
    close() {
      open = false;
      effect();
    },
    /** A save writes settings / the user doc, which re-runs the effect. */
    saveAndContinue() {
      effect();
      const next = nextWizardStep(step);
      step = next.step;
      done = next.done;
      if (done) open = false;
      effect();
    },
    get step() {
      return step;
    },
    get done() {
      return done;
    },
  };
}

describe("setup wizard progression (SPENDLY-564)", () => {
  it("a fresh user goes through all five steps; saves never reset the step", () => {
    const w = simulate(0);
    w.open();
    const visited = [w.step];
    for (let i = 0; i < SETUP_WIZARD_STEP_COUNT - 1; i++) {
      w.saveAndContinue();
      visited.push(w.step);
    }
    expect(visited).toEqual([0, 1, 2, 3, 4]);
    expect(w.done).toBe(false);
    w.saveAndContinue();
    expect(w.done).toBe(true);
  });

  it("reopening starts at the initial step again", () => {
    const w = simulate(2);
    w.open();
    expect(w.step).toBe(2);
    w.saveAndContinue();
    expect(w.step).toBe(3);
    w.close();
    w.open();
    expect(w.step).toBe(2);
  });

  it("seeds only on the closed → open transition", () => {
    expect(shouldSeedWizard(false, true)).toBe(true);
    expect(shouldSeedWizard(true, true)).toBe(false);
    expect(shouldSeedWizard(true, false)).toBe(false);
    expect(shouldSeedWizard(false, false)).toBe(false);
  });
});

describe("step helpers", () => {
  it("clamps out-of-range and missing steps", () => {
    expect(clampWizardStep(-3)).toBe(0);
    expect(clampWizardStep(99)).toBe(SETUP_WIZARD_STEP_COUNT - 1);
    expect(clampWizardStep(Number.NaN)).toBe(0);
    expect(openingWizardStep(undefined)).toBe(0);
    expect(openingWizardStep(3)).toBe(3);
  });

  it("moves forward and back within bounds", () => {
    expect(nextWizardStep(1)).toEqual({ step: 2, done: false });
    expect(nextWizardStep(4)).toEqual({ step: 4, done: true });
    expect(previousWizardStep(0)).toBe(0);
    expect(previousWizardStep(3)).toBe(2);
  });
});

/**
 * SPENDLY-564 — setup wizard step logic, kept pure so the progression is
 * testable. The modal used to re-seed (and so reset the step) whenever
 * `settings` or the user doc changed — which every step's save does — so
 * "Save & Continue" on Currency always landed back on Currency.
 */

export const SETUP_WIZARD_STEP_COUNT = 5;

export function clampWizardStep(step: number | null | undefined): number {
  const n = Number.isFinite(step) ? Math.trunc(step as number) : 0;
  return Math.min(Math.max(0, n), SETUP_WIZARD_STEP_COUNT - 1);
}

/** Where the wizard starts when it opens (`setupWizardInitialStep`, clamped). */
export function openingWizardStep(initialStep: number | null | undefined): number {
  return clampWizardStep(initialStep ?? 0);
}

/** After a save or a skip: the next step, or done on the last one. */
export function nextWizardStep(step: number): { step: number; done: boolean } {
  const current = clampWizardStep(step);
  return current >= SETUP_WIZARD_STEP_COUNT - 1 ? { step: current, done: true } : { step: current + 1, done: false };
}

export function previousWizardStep(step: number): number {
  return Math.max(0, clampWizardStep(step) - 1);
}

/**
 * Seed the step and form only on the closed → open transition. Data changes
 * while it is open (including the wizard's own saves) must not re-seed.
 */
export function shouldSeedWizard(wasOpen: boolean, isOpen: boolean): boolean {
  return isOpen && !wasOpen;
}

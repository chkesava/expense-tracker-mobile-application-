/**
 * SPENDLY-565 — onboarding progress writes that can't clobber stored state.
 *
 * Before the user doc has loaded, `settings.onboarding` is
 * `SETTINGS_DEFAULTS.onboarding`. Spreading that into a write (as the
 * dashboard's "screen visited" did on every reload) sent `welcomeCompleted:
 * false`, `currencyChosen: false` and `completedSteps: []` over the user's
 * real progress, because a Firestore merge overwrites the fields it is given.
 *
 * Writers now describe a *patch*; patches wait until settings are hydrated
 * and are then applied on top of the stored state. List fields are additive.
 */

import type { OnboardingState } from "../types/settings";

export type OnboardingPatch = Partial<Omit<OnboardingState, "visitedScreens" | "completedSteps">> & {
  /** Screens to add to `visitedScreens` (never removes). */
  addVisitedScreens?: readonly string[];
  /** Steps to add to `completedSteps` (never removes). */
  addCompletedSteps?: readonly string[];
};

function union(base: readonly string[] | undefined, extra: readonly string[] | undefined): string[] {
  return [...new Set([...(base ?? []), ...(extra ?? [])])];
}

/** Applies patches in order on top of `current`; list additions are unions. */
export function applyOnboardingPatches(current: OnboardingState, patches: readonly OnboardingPatch[]): OnboardingState {
  let next: OnboardingState = { ...current };
  for (const patch of patches) {
    const { addVisitedScreens, addCompletedSteps, ...flags } = patch;
    next = {
      ...next,
      ...flags,
      visitedScreens: union(next.visitedScreens, addVisitedScreens),
      completedSteps: union(next.completedSteps, addCompletedSteps),
    };
  }
  return next;
}

/** True when applying the patches would change nothing (skip the write). */
export function onboardingPatchesAreNoop(current: OnboardingState, patches: readonly OnboardingPatch[]): boolean {
  const base = applyOnboardingPatches(current, []);
  return JSON.stringify(applyOnboardingPatches(current, patches)) === JSON.stringify(base);
}

# SPENDLY-565: Onboarding progress reset after a full page reload

- **Type:** bug, with no epic.
- **Branch:** `feature/SPENDLY-565-onboarding-flags-reload`, cut from `main` at `6e671bbf`.
- **Found in:** SPENDLY-556 QA (`docs/SPENDLY-556-onboarding-sign-in.md`, "Found, not fixed" #2).

## Cause (confirmed)
- Until the user doc arrives, `SettingsProvider` holds `SETTINGS_DEFAULTS`, so `settings.onboarding` is all defaults: `welcomeCompleted: false`, `currencyChosen: false`, `setupStartedAt: ""`, `completedSteps: []`.
- On every full load the dashboard calls `markScreenVisited("dashboard")`. That wrote `{ ...settings.onboarding, visitedScreens: [...] }`.
- A Firestore merge overwrites the fields it is given, so the stored flags were replaced by those defaults.
- The stored `visitedScreens` being exactly `["dashboard"]` in the ticket's dump is the fingerprint of this write.

There was a second, subtler problem:
- `SettingsProvider.loading` turns false one render *before* the stored settings are applied.
- Child effects run before parent effects.
- So the automatic onboarding effects in `SetupProgressProvider` (auto-migration, legacy completion, milestone celebrations), which were gated only on loading flags, had the same window.

## Fix
- **`SettingsProvider`** exposes **`hydrated`**. It is set in the same update that applies the stored settings (or the confirmed-missing-doc defaults), and reset on sign-out.
- **`shared/utils/onboardingPatch.ts`** (new, pure, tested): `applyOnboardingPatches` applies flag patches, with list fields (`addVisitedScreens`, `addCompletedSteps`) as unions. `onboardingPatchesAreNoop` skips writes that change nothing.
- **`SetupProgressProvider`:**
  - `dataLoading` now includes `!hydrated`. That one gate covers the auto-migration, legacy completion, milestone effects and the first-launch flag.
  - `markScreenVisited` queues visits until hydrated. It then adds them to the *stored* list, and skips the write when the screen is already recorded.
- **Data:** no migration, and no other writer changed. Stored onboarding state is never rewritten from defaults again. Users whose progress was already reset keep their current state; nothing is guessed back.

## Tests and checks
- `npx vitest run shared/utils/onboardingPatch.test.ts`: 4 passed. Covers additive visits, a reproduction of the buggy defaults spread versus the patch, ordered queued patches and no-op detection.
- `npm test`: 5,846 passed.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- **A/B on web against the Firebase emulator** (`reload565.js`, scratch only). The run: a new user signs up, completes the welcome card and the wizard's Profile and Currency steps, then does a full page load of `/delete-account` and `/dashboard` by URL.

| Code | `onboarding` after the reloads |
|---|---|
| `main` (before) | `welcomeCompleted:false, currencyChosen:false, setupStartedAt:"", completedSteps:[]`: **reset**, matching the ticket |
| This branch | `welcomeCompleted:true, currencyChosen:true, setupStartedAt` kept, `completedSteps:["milestone_25"]`: **survived** |

## Rollout
No rules or data changes. Ships with the next web deploy and Android release.

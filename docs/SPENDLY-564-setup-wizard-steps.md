# SPENDLY-564: Setup wizard stuck on step 2 (Currency)

- **Type:** bug, with no epic.
- **Branch:** `feature/SPENDLY-564-setup-wizard-steps`, cut from `main` at `f24109dc`.
- **Found in:** SPENDLY-556 QA (`docs/SPENDLY-556-onboarding-sign-in.md`, "Found, not fixed" #1).

## Cause
In `components/onboarding/SetupWizardModal.tsx`, the effect that seeds the wizard ran `setCurrentStep(setupWizardInitialStep || 0)` whenever `settings` or the user doc changed.

Every step's save changes one of them:
- Profile writes `users/{uid}`;
- Currency and Budget call `updateSettings`.

So the step snapped back to the initial step mid-save, and `setCurrentStep(prev => prev + 1)` then always landed on step 2. Steps 3–5 could only be reached with Skip, which saves nothing.

## Fix
- **New pure helpers** in `shared/utils/setupWizard.ts`, with tests:
  - `shouldSeedWizard(wasOpen, isOpen)`: true only on the closed → open transition;
  - `openingWizardStep`;
  - `nextWizardStep` (step, or done on the last step);
  - `previousWizardStep`;
  - `clampWizardStep`.
- **The modal** now keeps a `wasOpenRef` and seeds the step and form fields only when the wizard opens. While it is open, data changes, including its own saves, no longer touch the step.
  - **Side effect:** a later settings change can't overwrite what the user is typing.
- Next, Back and Skip use the helpers.
- **Every write is unchanged:** the profile, currency, budget, first account and first expense are written exactly as before.

## Tests and checks
- `npx vitest run shared/utils/setupWizard.test.ts`: 5 passed. These include a simulation of the modal's state machine:
  - every save re-runs the seed effect, yet the steps go 0 → 1 → 2 → 3 → 4 → done;
  - reopening starts at `setupWizardInitialStep`;
  - seeding happens only on the open transition.
- `npm test`: 5,835 passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: clean.
- **End to end on web, against the Firebase emulator, with a brand-new user:**
  - Started from "Start Setup Wizard". Save & Continue went STEP 1 → 2 → 3 → 4 → 5, then Finish Setup closed the wizard.
  - The script dismissed the existing milestone popup and picked "Cash Wallet", because a bank account needs an institution picked.
  - The emulator then held exactly what the wizard writes:
    - `currency: "INR"` and `onboarding.currencyChosen: true`;
    - `monthlyBudget: 30000`;
    - one account ("Cash", 10,000);
    - one expense ("Coffee & snacks", 250).
  - No username was saved because the run left the empty name field blank. The wizard skips an empty name, as it did before this fix.

## Rollout
No rules or data changes.

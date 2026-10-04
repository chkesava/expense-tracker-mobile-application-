# SPENDLY-198: Income, expense and purchase What-If scenarios

**Story:** [SPENDLY-198](https://kesavach.atlassian.net/browse/SPENDLY-198)
**Branch:** `feature/SPENDLY-198-income-expense-scenarios`

## What changed

- Added `shared/utils/whatIfCashflow.ts`, a pure adapter from user-facing cash-flow actions to the SPENDLY-196 `WhatIfAdjustment` contract.
- Supports recurring or one-time income additions, increases and decreases.
- Supports recurring expense additions, increases and decreases.
- Supports source-referenced removal and replacement of existing income or expense events.
- Models delayed income as an explicit source removal plus a new scheduled hypothetical inflow.
- Added a one-time purchase builder with an exact date.
- Added validation for action kind, amount, schedule, source references and delay requirements.
- Reuses the existing Runway schedule contract and SPENDLY-197 engine; canonical records remain untouched.

## Isolation

All outputs are hypothetical `WhatIfAdjustment` values. The module performs no Firestore reads or writes and cannot edit transactions, recurring records or income records.

## Validation

- `shared/utils/whatIfCashflow.test.ts`: six tests for increases/decreases, purchases, removal/replacement, delayed income and invalid inputs.
- Combined focused What-If suite: 17 tests passed.
- `npm test`
- `npm run typecheck:shared`
- `npx tsc -p tsconfig.json --noEmit`

## Manual testing guide

This story has no UI or device-facing behavior. Verify from the repository root:

1. Run `npm test` and confirm the full suite and What-If tests pass.
2. Run `npm run typecheck:shared` and confirm the shared scenario adapters compile.
3. Run `npx tsc -p tsconfig.json --noEmit` and confirm the application typecheck compiles.
4. Confirm tests cover recurring salary changes, expense changes, one-time purchases, source removal/replacement, delayed income and invalid values.
5. Confirm no Firebase emulator, rules deployment, Android build or release command is required for this pure-logic story.

## Commands for the user

No device command is needed. `npx expo start` is not required because this story adds no route or UI.

## Status

Implemented on the story branch; waiting for Jira comment and approval to merge into the SPENDLY-195 epic branch.

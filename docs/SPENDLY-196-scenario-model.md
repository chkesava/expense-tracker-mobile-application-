# SPENDLY-196: What-If scenario model and baseline snapshot

**Story:** [SPENDLY-196](https://kesavach.atlassian.net/browse/SPENDLY-196)
**Branch:** `feature/SPENDLY-196-scenario-model`

## What changed

- Added the framework-free What-If contract in `shared/types/whatIf.ts`.
- Defined scenario identity, name, version, engine version, duration and baseline reference metadata.
- Defined explicit adjustment kinds for income, expenses, debt, savings, goals, investments and commitments.
- Reused the existing `RunwaySchedule`, `RunwayBaseline` and `RunwayEvent` contracts for dates, cadence and derived projections.
- Added provenance for canonical, user-authored and derived values.
- Kept `WhatIfBaselineSnapshot` runtime-only; saved scenario definitions contain no calculated output or copied financial records.
- Added deterministic validation for dates, schedules, amounts, bounds, provenance, assumptions and engine versions.

## Isolation and persistence contract

This story performs no Firebase reads or writes. Later persistence will store only the validated `WhatIfScenarioDefinition` under the owner's `whatIfScenarios` collection. Transactions, accounts, goals, investments and Calendar records remain read-only source data.

## Validation

- `shared/types/whatIf.test.ts`: six tests covering empty, complex, malformed, version and baseline cases.
- `npm test`
- `npm run typecheck:shared`
- `npx tsc -p tsconfig.json --noEmit`

## Manual testing guide

This story has no UI or device-facing behavior. Verify the contract from the repository root:

1. Run `npm test` and confirm the What-If contract tests pass with the existing suite.
2. Run `npm run typecheck:shared` and confirm the shared contract compiles.
3. Run `npx tsc -p tsconfig.json --noEmit` and confirm the application typecheck compiles.
4. Inspect the test cases for empty, minimal, complex, malformed-date, negative-value and invalid-engine-version scenarios.
5. Confirm no Firebase emulator, rules deployment, Android build or release command is required for this pure-logic story.

## Commands for the user

No device command is needed. The validation commands above are sufficient; `npx expo start` is not required because this story adds no route or UI.

## Status

Implemented on the story branch; waiting for Jira comment and approval to merge into the SPENDLY-195 epic branch.

# SPENDLY-197: What-If core financial projection engine

**Story:** [SPENDLY-197](https://kesavach.atlassian.net/browse/SPENDLY-197)
**Branch:** `feature/SPENDLY-197-projection-engine`

## What changed

- Added `shared/utils/whatIfEngine.ts` as a pure adapter around the existing `runRunwayEngine`.
- Runs the same derived baseline twice: once unchanged and once with hypothetical events applied.
- Reuses Runway's explicit dates, monthly and one-time schedules, rounding, thresholds, periods and drivers.
- Supports additive, source-referenced removal, and source-referenced replacement adjustments without mutating baseline events.
- Returns baseline/scenario outputs, per-period deltas, applied adjustment counts and validation issues.
- Unknown liquid balances and invalid scenario/baseline inputs produce `insufficient_data` rather than silently becoming zero.

## Isolation

The engine imports no Firebase or React Native code and performs no writes. Canonical records are represented by the runtime-only baseline snapshot; hypothetical changes are translated into `source: "what_if"` events for the calculation only.

## Validation

- `shared/utils/whatIfEngine.test.ts`: five tests covering baseline reproduction, one-time events, recurring cadence, source-referenced remove/replace, immutability and unknown data.
- `shared/types/whatIf.test.ts`: six contract tests.
- `npm test`
- `npm run typecheck:shared`
- `npx tsc -p tsconfig.json --noEmit`

## Manual testing guide

This story has no UI or device-facing behavior. Verify from the repository root:

1. Run `npm test` and confirm the full suite and What-If tests pass.
2. Run `npm run typecheck:shared` and confirm the shared engine compiles.
3. Run `npx tsc -p tsconfig.json --noEmit` and confirm the application typecheck compiles.
4. Confirm tests cover one-time events, recurring events, baseline reproduction, source-referenced removal/replacement, unknown liquid data and input immutability.
5. Confirm no Firebase emulator, rules deployment, Android build or release command is required for this pure-logic story.

## Commands for the user

No device command is needed. `npx expo start` is not required because this story adds no route or UI.

## Status

Implemented on the story branch; waiting for Jira comment and approval to merge into the SPENDLY-195 epic branch.

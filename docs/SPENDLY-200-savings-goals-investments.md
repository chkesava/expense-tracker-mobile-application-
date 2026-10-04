# SPENDLY-200 — Savings, Goals and Investment What-If Scenarios

## Delivered

`shared/utils/whatIfGoals.ts` is a pure adapter for savings, goal and investment scenarios. It:

- delegates goal target-date and allocation calculations to the existing Goal Funding contracts;
- supports target amount/date overrides without changing canonical goal records;
- uses the shared runway occurrence engine for one-time, weekly and monthly contributions;
- supports one-time and recurring hypothetical investments with explicit effective annual return assumptions;
- labels return assumptions and excludes taxes, fees and market uncertainty unless a later story models them;
- never creates investment, SIP, goal or transaction records.

Investment output is derived at recalculation time. Canonical investment valuation is read-only and hypothetical contributions are kept separate from it.

## Manual Testing Guide

1. Open the What-If flow with at least one active goal and one investment account.
2. Change a goal target date and confirm the projected required monthly contribution and completion date change.
3. Increase or reduce a goal contribution and confirm the canonical goal amount and target date remain unchanged.
4. Add a one-time investment and a monthly investment; confirm each appears on its documented dates only.
5. Change the return assumption and confirm the result is labelled hypothetical/assumed, with taxes, fees and market uncertainty disclosed.
6. Enter zero contribution and verify the goal is reported as not reached when no growth or one-time funding can complete it.
7. Reopen the screen and verify the canonical investment and goal records are unchanged.

## Commands

```text
npx vitest run shared/utils/whatIfGoals.test.ts
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
```

No Firebase rules changed in this story, so `npm run test:rules` is not required.

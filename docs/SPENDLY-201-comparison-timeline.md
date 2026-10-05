# SPENDLY-201 — Baseline vs Scenario Comparison and Projection Timeline

## Delivered

`shared/utils/whatIfComparison.ts` converts the existing What-If runway output into presentation-neutral comparison data:

- baseline, scenario, delta and meaningful percentage delta for closing balance, minimum balance, inflow, outflow, runway and burn;
- stable-id material driver deltas, including drivers added or removed by a scenario;
- period-by-period timeline rows using the same comparison horizon;
- optional historical rows explicitly labelled `historical`, with runway projections labelled `projected`;
- dated one-time and recurring scenario events attached to projected periods;
- null percentages for zero/unknown baselines and an explicit insufficient-data flag.

The adapter is pure and does not calculate a second financial model, mutate engine output, or depend on React Native/Firebase. It is suitable for accessible tables, cards, charts, and screen-reader summaries.

## Manual Testing Guide

1. Open a What-If result with a baseline and at least one scenario adjustment.
2. Confirm each comparison row shows current value, scenario value, difference, and percentage only when meaningful.
3. Confirm the period timeline uses the same months for baseline and scenario and that closing deltas reconcile with the engine output.
4. Confirm a one-time event appears once and recurring events appear on their scheduled dates.
5. Confirm historical rows are labelled separately from projected rows and do not rely on color alone.
6. Test a missing baseline, zero baseline, empty timeline, and negative closing balance; verify unknown values stay blank/unknown and the insufficient-data message is explicit.
7. Test a large dataset on Android and verify the comparison remains readable and responsive.

## Commands

```text
npx vitest run shared/utils/whatIfComparison.test.ts
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
```

No Firebase rules changed in this story, so `npm run test:rules` is not required.

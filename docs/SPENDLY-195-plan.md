# SPENDLY-195: Financial What-If Simulator plan

## Objective

Build a deterministic planning layer that lets users explore hypothetical financial changes without mutating canonical Spendly records.

## Delivery order

1. **SPENDLY-196 — Scenario model and baseline snapshot**
   Define the scenario contract, explicit assumptions, provenance, reference date and versioning.
2. **SPENDLY-197 — Core projection engine**
   Project baseline plus hypothetical adjustments using the existing runway schedule, date and rounding semantics.
3. **SPENDLY-198 — Income, expense and purchase scenarios**
4. **SPENDLY-199 — Debt, EMI and borrowing simulation**
5. **SPENDLY-200 — Savings, goals and investment scenarios**
6. **SPENDLY-201 — Baseline/scenario comparison and projection timeline**
7. **SPENDLY-202 — Saved scenario lifecycle**
8. **SPENDLY-203 — QA, performance, safety and rollout**

Stories 198–200 all depend on 197 and are independently implementable; repository workflow still delivers them one at a time. Story 201 depends on all three. Story 202 depends on 196 and 201. Story 203 is last.

## Architecture decisions

- Calculated projections are derived and are not persisted.
- Saved scenarios contain user-authored assumptions and reproducibility metadata only.
- Saved scenarios live at `users/{uid}/whatIfScenarios` and are written through `commitMutations`.
- The collection will have strict owner, field, type, bounds and immutable-creation-time rules, with emulator and TypeScript↔rules contract tests.
- Canonical transactions, accounts, goals, investments, recurring records and Calendar events remain read-only inputs.
- Runway, Calendar and Goal Funding integrations reuse their existing pure contracts and hooks; no parallel ledger, calendar or notification system is introduced.
- Reopening a scenario recalculates from current canonical data while retaining the original as-of/reference metadata.
- The default projection horizon is 12 months, bounded by the existing engine limits.
- Investment returns are explicit user assumptions and are labeled estimates; taxes, fees and market uncertainty are disclosed when not modeled.

## Validation

Every story runs `npm test`, `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`. Rules changes additionally run `npm run test:rules`. Each phase records a manual device/simulator guide and required commands in its story document.

Rules are not deployed and Android releases are not triggered by this epic implementation.

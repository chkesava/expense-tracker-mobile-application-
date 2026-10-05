# SPENDLY-199: Debt, EMI and borrowing What-If simulation

**Story:** [SPENDLY-199](https://kesavach.atlassian.net/browse/SPENDLY-199)
**Branch:** `feature/SPENDLY-199-debt-emi-simulation`

## What changed

- Added `shared/utils/whatIfLoan.ts`, a pure fixed-rate reducing-balance amortization engine.
- Supports principal, optional down payment, annual interest rate, monthly or weekly payment frequency, tenure, start date and optional upfront fees.
- Returns deterministic payment dates, EMI/payment amount, principal and interest components, closing balances, total repayment, total interest, fees, end date and explicit assumptions.
- Adjusts the final payment to close the balance exactly after currency rounding.
- Produces hypothetical funding, repayment, down-payment and fee adjustments for SPENDLY-197 without creating a Borrowing record.
- Rejects invalid rates, dates, tenure, principal, fees and down payments without producing adjustments.

## Financial assumptions

- Amortization uses fixed-rate reducing balance.
- Monthly frequency uses 12 periods per year; weekly frequency uses 52 periods per year.
- Down payment reduces the financed principal and is represented as a separate upfront outflow.
- Supplied fees are modeled as a separate upfront outflow; omitted fees are explicitly reported as not modeled.
- Results are estimates, not guaranteed borrowing offers.

## Isolation

The module imports no Firebase or React Native code. Existing borrowing data is not written or changed; it can only be used later as read-only baseline context.

## Validation

- `shared/utils/whatIfLoan.test.ts`: five tests covering EMI reconciliation, zero interest, fees/down payment, weekly schedules and invalid inputs.
- `npm test`
- `npm run typecheck:shared`
- `npx tsc -p tsconfig.json --noEmit`

## Manual testing guide

This story has no UI or device-facing behavior. Verify from the repository root:

1. Run `npm test` and confirm the full suite and loan tests pass.
2. Run `npm run typecheck:shared` and confirm the shared loan engine compiles.
3. Run `npx tsc -p tsconfig.json --noEmit` and confirm the application typecheck compiles.
4. Confirm tests cover non-zero and zero interest, final-payment reconciliation, fees, down payment, monthly/weekly frequency and invalid inputs.
5. Confirm no Firebase emulator, rules deployment, Android build or release command is required for this pure-logic story.

## Commands for the user

No device command is needed. `npx expo start` is not required because this story adds no route or UI.

## Status

Implemented on the story branch; waiting for Jira comment and approval to merge into the SPENDLY-195 epic branch.

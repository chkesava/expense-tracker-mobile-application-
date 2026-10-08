# SPENDLY-432: Credit Card Overview shows incorrect unbilled/outstanding amount after cashback

## Context
The credit card overview was displaying an incorrect (higher) `unbilledSpend` and `totalOutstanding` when cashback occurred.
This was due to two distinct logic flaws in the `buildCreditCardLedger()` calculation in `shared/utils/creditCardLedger.ts`:
1. **Aggressive settlement**: The `settles()` helper used a logical OR (`||`), meaning cashback in the current cycle correctly passed the cashback check but ALSO evaluated to `true` against the normal payment rule for older, unpaid statements (since today's date is `>=` the past statement date). Open-cycle cashback was therefore swallowed by old statements instead of acting as cycle credit.
2. **Dropped carried cashback**: When cashback generated a negative balance (such as on the close date or prior cycles) exceeding the statement due, the excess went into `carriedCredit`. Because the ledger normally prevents users from paying more than what's owed (to avoid "pre-paying" future spend), `carriedCredit` not consumed by cancelled statements was deliberately dropped. This dropped legitimate carried cashback.

## Implementation
1. Refactored `settles()` to use a conditional (ternary) operator based on `isCashback`, strictly isolating cashback to its own period so it doesn't match old unpaid statements.
2. Initialized `carriedCashback` separately from `carriedCredit` during the ledger loop.
3. Carried `carriedCashback` forward (up to the amount of `carriedCredit` that wasn't consumed by voided spend).
4. Applied `forwardCashback` to `cycleCreditForOpen` to accurately reduce the open cycle spend.

## Verification
- Wrote four unit tests in `shared/utils/creditCardLedger.test.ts` under the `describe("cashback in current cycle (SPENDLY-432)")` block.
- Confirmed tests cover:
  - Cashback exactly once reducing open cycle unbilled spend.
  - Cashback from a previous closed cycle correctly satisfying that past statement.
  - Excess cashback from a prior cycle correctly carrying forward to reduce the current open cycle.
  - Excess normal payments correctly *not* carrying forward (preserving the rule against user pre-payment).
- Passed all unit tests and `typecheck:shared`.

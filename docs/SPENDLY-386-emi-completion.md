# SPENDLY-386: EMI is marked Completed before the final-term billing day is reached

## Problem
EMI items with a final term in the current month were being marked as Completed before their scheduled billing day. This happened because `evaluateSubscriptionDue` returned `isCompleted: true` whenever the current month matched the final term, unconditionally, even if the current date was before the billing date.

This faulty boolean leaked into `ExpenseReferenceDataProvider.tsx`, which eagerly writes `isCompleted: true` and `isActive: false` into Firestore upon app startup without checking if the charge was actually due.

## Solution
1. In `shared/utils/subscriptionProcessor.ts`, updated `evaluateSubscriptionDue` to gate `isCompleted` on `isDue`:
   `isCompleted: willCompleteAfterThis && isDue`
2. Added regression tests in `shared/utils/subscriptionProcessor.test.ts` to cover final month evaluations (before, on, and after the billing day).

## Tests
Verified with 8 new Vitest tests specifically designed for the edge cases outlined in SPENDLY-386.

## Related Files
- `shared/utils/subscriptionProcessor.ts`
- `shared/utils/subscriptionProcessor.test.ts`

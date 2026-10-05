# SPENDLY-211: What-If Integration

## Requirements

Integrate What If scenarios with Financial Runway. Allow hypothetical assumptions from the What If Simulator to show their impact on runway without mutating real financial data.
- Baseline runway and scenario runway can be compared.
- Scenario changes remain isolated.
- Scenario calculations use the same runway methodology.
- Drivers explain why runway changes.
- No real transactions/accounts are modified.
- Scenario deletion has no financial-data side effects.
- Recalculation is deterministic.

## Implementation Details

The What-If Simulator (SPENDLY-195) already built the isolated scenario engine, the comparison UI, the deterministic projections, and the non-mutating behavior. 
This ticket simply hooks that simulator up to the final SPENDLY-209 Runway engine:

- Replaced legacy `subscriptions` and `bills` inputs in `WhatIfBaselineInput` with the new `calendarEvents`.
- Swapped `subscriptionsToRunwayEvents` and `creditCardBillsToRunwayEvents` with `calendarToRunwayEvents` in the What-If Baseline calculation.
- Updated the What-If `sourceVersions` fingerprinting to hash `calendarEvents` instead of legacy inputs.
- Cleaned up the old runway event generation functions and tests that were only kept around for What-If backwards compatibility during SPENDLY-209.
- Updated the "source labels" in the What-If Scenario UI to reflect that `calendar` is now the source of scheduled commitments.

## Tests

- All `whatIf` unit tests pass.
- Verified that deterministic output, isolation from baseline, and `whatIf.qa.test.ts` constraints all hold with the new `CalendarEvent`-driven projection engine.

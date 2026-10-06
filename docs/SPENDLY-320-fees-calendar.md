# SPENDLY-320: Integrate known fees and fee-related dates with Financial Calendar

**Ticket:** [SPENDLY-320](https://kesavach.atlassian.net/browse/SPENDLY-320) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312). See the [epic record](SPENDLY-312-fee-charges-intelligence.md).
**Branch:** `feature/SPENDLY-320-fees-calendar`, cut from `feature/SPENDLY-312-fees`.

**Status:** Completed.

---

## 1. Calendar Integration
The fee pattern intelligence (`useFeeIntelligence` & `detectFeePatterns`) predicts recurring annual/monthly fees based on past ledger readings. This story integrates those predictions into the Financial Calendar natively.
- **New Source**: Added `fee` to `CALENDAR_SOURCES`.
- **`feeEvents`**: Added a `feeEvents` adapter in `calendarSources.ts`. It reads `FeePattern`s and generates `CalendarEvent` records for them using the shared `occurrencesBetween` runway schedule engine.
- **Strict Dates**: Calendar events are ONLY generated when `pattern.regular === true` and `pattern.mayHaveStopped === false`. Irregular or stopped fees are hidden.
- **Past Filtering**: Calendar events for expected fees strictly drop dates that are on or before the `lastSeen` date for that pattern (since they are already recorded).
- **State**: Expected fees are presented as `state: "expected"`, aligning with the acceptance criterion that uncertain dates aren't presented as guaranteed.
- **Links**: Fee calendar events deep-link to `/fees` (the fee dashboard).

## 2. Hook and Aggregation Changes
- **`useFinancialCalendar`**: Now calls `useFeeIntelligence()` to load fee records, derives patterns, and passes `feePatterns` to the `queryCalendar` engine.
- **`queryCalendar`**: Passes the `feePatterns` down to `feeEvents` along with the context.
- **UI Adjustments**: Added `"Fee"` to `CALENDAR_SOURCE_LABELS`.

## 3. Acceptance criteria
| Criterion | Status |
|---|---|
| Fee events appear only when a reliable date exists | Done: filters by `pattern.regular` and `!mayHaveStopped` |
| Event creation is idempotent | Done: derived entirely at runtime without separate persistence |
| Updating or archiving the source removes/updates the calendar event | Done: derived reactively from `useFeeIntelligence` |
| Uncertain dates are not presented as guaranteed | Done: uses `state: "expected"` |
| Existing Financial Calendar behavior is not duplicated | Done: fully integrated into `calendarSources.ts` and `useFinancialCalendar` |

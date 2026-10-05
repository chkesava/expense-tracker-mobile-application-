# SPENDLY-209: Commitment-aware runway using Financial Calendar

**Epic:** [SPENDLY-204](https://kesavach.atlassian.net/browse/SPENDLY-204)
**Story:** [SPENDLY-209](https://kesavach.atlassian.net/browse/SPENDLY-209)

## Purpose
Replaces custom runway recurrence logic for subscriptions and card bills with canonical discrete events from the Financial Calendar (`useFinancialCalendar`). This seamlessly integrates all future expected cash flow obligations (including EMIs, active borrowings, and SIPs) as well as expected receivables into the runway projection.

## Design Decisions
- `runwayModel.ts` now accepts `calendarEvents` directly and passes them to `calendarToRunwayEvents` which generates `once` kind schedules, delegating all recurrence parsing (daily, monthly, N-days) safely to the calendar.
- `CALENDAR_MAX_RANGE_DAYS` was increased to `750` to support projecting out 24 months mathematically, aligning with the `maxMonths` rule of `RunwayEngine`.
- Missing amounts or incomplete expected calendar events flag the `uncertain_commitments` assumption, ensuring that runway confidence drops appropriately when data is unknown.
- We added `burnClass` tracking straight onto `CalendarEvent` (assigned during unrolling in `calendarSources.ts`) so that runway grouping remains consistent with legacy parsing.

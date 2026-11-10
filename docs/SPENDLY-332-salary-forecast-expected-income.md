# SPENDLY-332: Build Salary Forecast and Expected-Income Planning

**Epic:** [SPENDLY-324: Salary Intelligence](https://kesavach.atlassian.net/browse/SPENDLY-324)  
**Story:** [SPENDLY-332](https://kesavach.atlassian.net/browse/SPENDLY-332)  
**Branch:** `feature/SPENDLY-332-salary-forecast-expected-income` (branched from `feature/SPENDLY-324-salary-intelligence`)

---

## 1. Goal & Architectural Overview

SPENDLY-332 builds deterministic salary forecasting and expected-income planning view models using learned payday profiles and recent regular net salary baselines.

### Acceptance Invariants & Design Principles:
1. **Explicit Estimate Disclaimer**:
   - Projections are explicitly flagged as estimates (`isEstimate: true`) and presented with calm, clear disclaimers that future income is not guaranteed.
2. **Conservative Base Net Projections**:
   - Forecast base projected net pay assumes ₹0 variable pay, preventing inflated forward budgets or false security.
   - Historical bonus and variable pay are computed separately as a reference average (`historicalBonusContext.monthlyAverageBonus`), providing informational context without inflating regular cashflow projections.
3. **Multi-Month Projection Horizon (3–6 Months)**:
   - `buildSalaryForecast`: Generates a rolling 3- to 6-month projected schedule starting from the next expected payday.
   - Accurately clamps dates to the number of days in each projected month (`daysInMonth`).
4. **Timing Awareness (`same_month` vs `next_month`)**:
   - Accounts for companies that pay in arrears (e.g. 1st–5th of following month) vs calendar-month paydays (25th–31st).
   - If regular paycheck for the current wage month has already been received, automatically advances the forecast horizon to the next unreceived wage month.
5. **Multi-Employer Support**:
   - Aggregates projections across active employers into total upcoming expected net income.
6. **Financial Calendar Handoff**:
   - Emits structured calendar event payloads (`calendarHandoff`) ready for direct integration into Spendly's Financial Calendar (Story 9: SPENDLY-333).
7. **Pure Shared Architecture**:
   - Pure, deterministic logic in `shared/features/salary/utils/forecast.ts` (zero React/Firebase dependencies), compiling cleanly under `tsconfig.shared.json`.

---

## 2. Changes Implemented

### Salary Forecast Engine (`shared/features/salary/utils/forecast.ts`)
- `buildSalaryForecast`:
  - Derives next expected payday date, expected amount range, and multi-month schedule (up to 6 months forward).
  - Handles already-received vs upcoming paycheck logic for the current month.
  - Generates calendar-ready payloads (`calendarHandoff`).
- Re-exported via `shared/features/salary/utils/index.ts`.

### Component Forecast Card (`components/salary/SalaryForecastCard.tsx`)
- Displays:
  - Next expected payday countdown (e.g., "In 12 days", "Tomorrow", "Today", or "Overdue by 3 days").
  - Projected net salary with explicit estimate badge.
  - Multi-employer breakdowns (if user has multiple active salary streams).
  - Historical variable pay context note (if bonuses have occurred historically).
  - Multi-month projection horizon chips with formatted dates and expected amounts.
  - Non-guarantee disclaimer adhering to financial app standards.
- Re-exported via `components/salary/index.ts`.

### Unit Test Suite (`shared/features/salary/utils/forecast.test.ts`)
- 7 comprehensive unit test scenarios:
  - Empty state / no records handling.
  - Next expected payday calculation for end-of-month pay schedule.
  - Advancing to next month when current month salary is already received.
  - Handling next-month payday timing (e.g. 1st of month).
  - Multi-month projection schedules (clamp to month lengths).
  - Conservative variable pay exclusion.
  - Calendar event handoff payload structure.

---

## 3. Verification & Guard Tests

1. `npm run typecheck:shared` -> Passed (0 errors).
2. `npm run typecheck` -> Passed (0 errors).
3. `npx vitest run shared/features/salary` -> 10 passed test files, 104 passed tests.
4. `npm test -- --run shared/utils/readModel` -> 8 passed test files, 174 passed tests.

---

## 4. Manual Testing Guide

1. **Next Expected Payday Calculation**:
   - With regular salary records on the 28th of each month, verify the card displays "Expected: 28 Nov 2026".
   - If today is before the 28th, verify countdown reads "In X days".
   - If salary was already credited on the 28th, verify it automatically projects the next month (e.g. 28 Dec 2026).
2. **Variable Pay Isolation**:
   - Create a bonus paycheck alongside regular pay.
   - Verify next expected regular pay does NOT jump up by the bonus amount.
   - Verify historical bonus context banner is shown ("Avg ~₹X/mo bonus historically").
3. **Multi-Month Projection Horizon**:
   - Verify the 3-month or 6-month projection schedule lists upcoming paydays properly clamped (e.g., Feb 28th, not Feb 31st).

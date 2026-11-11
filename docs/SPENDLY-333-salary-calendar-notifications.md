# SPENDLY-333: Integrate Salary Events with Financial Calendar and Notifications

**Epic:** [SPENDLY-324: Salary Intelligence](https://kesavach.atlassian.net/browse/SPENDLY-324)  
**Story:** [SPENDLY-333](https://kesavach.atlassian.net/browse/SPENDLY-333)  
**Branch:** `feature/SPENDLY-333-salary-calendar-notifications` (branched from `feature/SPENDLY-324-salary-intelligence`)

---

## 1. Goal & Architectural Overview

SPENDLY-333 connects salary payday expectations, confirmed paycheck credits, and irregularity alerts to Spendly's Financial Calendar (`shared/utils/calendarSources.ts`, `shared/utils/calendarQuery.ts`) and notification infrastructure (`shared/utils/calendarNotifications.ts`, `components/settings/CalendarNotificationSettings.tsx`).

### Acceptance Invariants & Design Principles:
1. **Reuses SPENDLY-176 and SPENDLY-222 Architecture**:
   - Adds `"salary"` as a first-class source in `CALENDAR_SOURCES` in `shared/types/calendar.ts`.
   - Plugs directly into `queryCalendar` and `collect`, with pure adapters returning read-only views of canonical records without creating duplicate ledgers.
2. **Event Kinds and Directions**:
   - **Confirmed Paycheck Credits**: Emitted with `source: "salary"`, `direction: "in"`, `state: "actual"`. Deep-links directly to `/salary?recordId={id}`.
   - **Expected Upcoming Paydays**: Emitted with `source: "salary"`, `direction: "in"`, `state: "expected"` (or `"overdue"` if past reference date). Subtitle explicitly flags projection as estimate (`Estimated ~₹X · Month YYYY-MM`).
   - **Irregularity / Missing Paychecks**: Active missing or late paycheck signals emitted with `source: "salary"`, `direction: "in"`, `state: "overdue"`, `priority: 2` (or 3), and `actionable: true`. Preempts default forecast projection for that employer and wage month to ensure a single, clear alert.
3. **Idempotency & Deduplication**:
   - Deterministic stable event IDs (`salary:{refId}:{date}`).
   - Income transaction deduplication: When an Income transaction in `incomes` is matched to a confirmed `SalaryRecord` via `transactionId`, `incomeEvents` suppresses the generic income row, ensuring cash inflows are not double-counted.
4. **Notification Planning & User Preferences**:
   - `CalendarNotificationSettings` and `CalendarNotificationPrefs` extended with `salaryEnabled` (default `true`) and `salaryDaysBefore` (default `1`).
   - `planCalendarNotifications`: Plans `before` (1 or 3 days prior), `due` (on the expected payday), and `overdue` (the day after if credit has not arrived).
   - Inactive or completed events automatically drop from notification plans.
   - User-configurable toggle and timing options added to `CalendarNotificationSettings.tsx`.
   - Android channel `salary-payday` registered in `PUSH_CHANNELS`.

---

## 2. Changes Implemented

### Domain Models & Types
- `shared/types/calendar.ts`: Added `"salary"` to `CALENDAR_SOURCES`.
- `shared/types/settings.ts`: Added `salaryEnabled` and `salaryDaysBefore` to `CalendarNotificationSettings` and `DEFAULT_CALENDAR_NOTIFICATIONS`.
- `shared/utils/pushPreferences.ts`: Added `"salary"` to `PushCategory`, configured `PUSH_CHANNELS.salary`, and updated category checks.

### Calendar Adapters & Query Engine
- `shared/utils/calendarSources.ts`:
  - Implemented `salaryEvents`: Maps canonical salary records, expected paydays via `buildSalaryForecast`, and irregularity signals.
  - Updated `incomeEvents`: Added optional `salaryIncomeIds` parameter to suppress generic income events for confirmed salary paychecks.
- `shared/utils/calendarMonth.ts`: Added `salary: "Salary"` to `CALENDAR_SOURCE_LABELS`.
- `shared/utils/calendarActions.ts`: Added `case "salary":` routing to `/salary`.
- `shared/utils/calendarQuery.ts`:
  - Updated `SOURCE_ORDER` to include `salary`.
  - Added `salaryRecords`, `salaryProfiles`, and `salarySignals` to `CalendarData`.
  - Updated `collect` to derive `salaryIncomeIds` and invoke `salaryEvents`.

### Notifications & Push Planning
- `shared/utils/calendarNotifications.ts`:
  - Added `"salary"` to `NOTIFICATION_ROUTE_SOURCES`.
  - Extended `CalendarNotificationPrefs` with `salaryEnabled` and `salaryDaysBefore`.
  - Implemented copy and planning for salary payday reminder events.
- `shared/utils/push/sources/calendarPush.ts`: Passed salary notification settings to push slot generator.

### UI & Custom Hooks
- `hooks/useSalaryRecords.ts`: Real-time subscription to `users/{uid}/salaryRecords` with read-model local copy support.
- `hooks/useSalaryProfiles.ts`: Real-time subscription to `users/{uid}/salaryProfiles` with read-model local copy support.
- `hooks/useSalaryIntelligenceData.ts`: Coordinates records, profiles, irregularity signals, and forecast.
- `hooks/useFinancialCalendar.ts`: Wires salary data into the financial calendar query hook.
- `components/settings/CalendarNotificationSettings.tsx`: Added UI toggle and lead-day selector for salary and payday reminders.

---

## 3. Verification & Guard Tests

1. `npm run typecheck:shared` -> Passed (0 errors).
2. `npm run typecheck` -> Passed (0 errors).
3. `npx vitest run shared/features/salary` -> 10 passed test suites, **104 passed tests**.
4. Calendar & Notification Vitest Suite -> 6 passed test files, **64 passed tests**:
   - `shared/utils/calendarSources.test.ts` (19 tests)
   - `shared/utils/calendarNotifications.test.ts` (8 tests)
   - `shared/utils/calendarActions.test.ts` (4 tests)
   - `shared/utils/calendarQuery.test.ts` (11 tests)
   - `shared/utils/calendar.qa.test.ts` (12 tests)
   - `shared/utils/pushPreferences.test.ts` (10 tests)
5. `npm test -- --run shared/utils/readModel` -> 8 passed test suites, **174 passed tests**.

---

## 4. Manual Testing Guide

1. **Financial Calendar Payday Display**:
   - Open Financial Calendar (`/calendar`).
   - With an active salary history, navigate to the upcoming expected payday (e.g. 28th of the month).
   - Verify an event appears: `Expected salary · {EmployerName}` with badge `Expected` and direction indicator `+`.
   - Tap the event to verify it opens the event detail sheet with action "View salary details" routing to `/salary`.
2. **Confirmed Salary Credits**:
   - On days where a salary paycheck was confirmed, verify the event reads `Salary · {EmployerName}` with badge `Recorded`.
   - Verify the original Income transaction is not duplicated on that day.
3. **Notification Preferences**:
   - Navigate to Settings -> Notifications -> Financial Calendar.
   - Verify the switch "Salary & expected paydays" is present and enabled by default.
   - Test changing the timing ("On the day", "1 day before", "3 days before") and toggling the switch off/on.
4. **Missing Paycheck Alerts in Calendar**:
   - When a paycheck is overdue by >2 days without a credit, verify an alert appears on the calendar with state `Overdue` and high priority tint.

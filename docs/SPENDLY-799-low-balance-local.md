# SPENDLY-799: Low-balance alerts — on-device fallback

**Epic:** SPENDLY-793. **Story:** S6 of 6 (the last).

**State:** built on `feature/SPENDLY-799-low-balance-local`. Nothing is deployed. It ships with the next Expense release.

## What it does
For a phone the server doesn't push to (`usePushReminderMode()` is `"local"`), the same low-balance alerts are scheduled on the device.

- **`shared/utils/lowBalanceLocalPlan.ts`** (`planLowBalanceNotifications`, pure):
  - It plans from the **stored** result only (`serverResults/autoDebitShortfall`). Nothing is computed in the app (epic 735 rule).
  - **Short on a trusted account:** one notice a day from `dueDate − leadDays` (or today, if later) through the due day.
  - **Same wording and tap target as the push:** `lowBalanceCopy`, `lowBalanceUrl`. Amounts appear only with `showAmounts`.
  - **Ids:** `lowbal:{kind}:{refId}:{billId}:{dueDate}@{fireDate}`, stable, so rebuilding never duplicates.
  - **Nothing is planned when:** the switch is off, the debit is covered, the balance is untrusted, the due day has passed, the result is more than a day old, or there is no result.
- **`services/lowBalance/lowBalanceNotificationScheduler.ts`**, modelled on the calendar scheduler:
  - Cancels every `lowbal:` notification, then schedules the plan at 09:00 local, moved into the delivery window (`dateTriggerFromDateKey`).
  - Uses the push's Android channel `low-balance` (high), so muting it on the phone covers both.
  - Does nothing on web, never prompts for permission, and swallows and logs every failure.
- **`components/lowBalance/LowBalanceNotificationSync.tsx`**, mounted in the app shell next to the calendar and goal syncs:
  - **Push mode, or while the mode is unknown:** cancels everything, and doesn't mount the result listener.
  - **Local mode:** rebuilds when the stored result changes (a new run, e.g. after a top-up re-runs the server job via the 796 queue) or when the settings change. It waits for the result before planning and is debounced by 1 second, like the calendar sync.
- **Tap routing:** `lowBalance` is added to `NOTIFICATION_ROUTE_SOURCES`, so tapping a local alert opens the item or the bill.
- **`useLowBalanceAlerts`** also returns the raw `stored` result, so the planner can see items whose window opens later.

## Limits
- The phone can't re-check at fire time, unlike the push.
- A debit covered while the app stays closed can still fire that day's scheduled notice. The next app open rebuilds the plan from the new result.
- A top-up made in the app re-runs the server job (796), so the plan normally updates within about a minute.

## Tests
- `shared/utils/lowBalanceLocalPlan.test.ts` (5 tests):
  - a notice per day through the due day, with dated ids, push wording, "tomorrow" and "today";
  - a lead window that opens later;
  - card autopay routing to its bill;
  - amounts only with `showAmounts`;
  - every "plans nothing" case.
- `shared/utils/push/notificationRoutes.test.ts`: `lowBalance` local taps route.

### Run locally
- 138 files, **1661/1661**: `lib` (including `listenersOff`, `providerSwitch`, `readModelWriteHooks`), `components`, `hooks`, `app`, `shared/utils/push`, and the planner and display tests.
- `tsc --noEmit` and `typecheck:shared` are clean.

**Not run:** nothing on a device. Scheduling needs a phone in local mode with notifications allowed. Check it in device QA on Spendly Test (the emulator).

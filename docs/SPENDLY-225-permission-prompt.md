# SPENDLY-225: Ask for notification permission in context, with recovery when denied

**Ticket:** [SPENDLY-225](https://kesavach.atlassian.net/browse/SPENDLY-225) (Story; Spendly only since 2026-11-06)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md) and the [go-live checklist](SPENDLY-222-go-live-checklist.md).
**Branch:** `feature/SPENDLY-225-permission-prompt`, cut from the epic branch after the 697 merge.

## Problem (plan bug 3)

`reconcileBillReminders` called `requestPermissionsAsync()` on every reconcile, including at app launch. So the system dialog could appear with no context. On Android 13+, two "Don't allow" taps and the phone never asks again, and the app offered no way back.

## What changed

**One place asks** (`lib/notificationPermission.ts`, rules in `shared/utils/push/permissionFlow.ts`):

| Situation | What the user sees |
|---|---|
| The user turns something on (bill reminders, calendar reminders or dues, a goal reminder, or "Turn on notifications" on the Notifications card) and the phone can still ask | **A short explanation in Spendly's voice first** ("Get bill reminders on your phone?…"), with **Allow** and **Not now**. Allow opens the system dialog. |
| The phone won't ask again (`canAskAgain === false`) | "Notifications are off for Spendly… **Open settings**" (`Linking.openSettings()`), instead of a dead switch |
| Already allowed | Nothing |
| Web | Nothing |
| Not now / Don't allow | Remembered. An **automatic** ask waits at least 14 days. A switch the user taps always explains again. (No automatic asks exist today; the rule is there for any future one.) |

- **Background work never asks.** `reconcileBillReminders` now only reads the permission (`billNotificationsAllowed`). The calendar and goal schedulers already only read it.
- **The old request functions are removed:** `requestBillNotificationPermission`, `requestCalendarNotificationPermission`, `requestGoalNotificationPermission`. Their UI callers use `askForNotifications`.
- **The Notifications card shows the current state:**
  - "Notifications are on";
  - "Notifications are off" with **Turn on notifications**;
  - "off in your phone's settings" with **Open phone settings**;
  - on the web, that notifications aren't available.
- **Android channels:** the card names any Spendly category **muted in the phone's settings** (a channel with importance NONE), with **Open phone settings**. It refreshes on returning to the app.

## Files

| File | |
|---|---|
| `shared/utils/push/permissionFlow.ts` | `toPermissionState`, `nextPermissionStep`, `PERMISSION_COPY` |
| `lib/notificationPermission.ts` | `readNotificationPermission`, `askForNotifications`, `openNotificationSettings` |
| `hooks/useNotificationPermission.ts` | The state plus muted channels, refreshed on foreground |
| `components/settings/PushNotificationSettings.tsx` | The status row and actions |
| `CreditCardBillReminderSettings.tsx`, `CalendarNotificationSettings.tsx`, `GoalRemindersSheet.tsx` | Ask through `askForNotifications` |
| `services/creditCardBills/billReminderScheduler.ts` | Read-only `billNotificationsAllowed` |
| `services/calendar/…Scheduler.ts`, `services/goals/…Scheduler.ts` | The request functions are removed |

## Tests

- `shared/utils/push/permissionFlow.test.ts`: state mapping (granted, undetermined, denied, blocked, web); next step (explain, open settings, none, unavailable); the 14-day snooze for automatic asks only; copy for every reason.
- `services/creditCardBills/billReminderScheduler.test.ts`: **the background reconcile never asks** (`requestPermissionsAsync` is not called) and schedules nothing without permission. The existing permission-denied log still works.

## Not covered here

- **UI review:** the user checks it on local Expo web. On web the card says notifications aren't available here. The explanation dialogs and system prompt only show on a phone, so they get checked in device QA (233).

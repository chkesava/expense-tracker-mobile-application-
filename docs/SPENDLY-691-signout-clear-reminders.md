# SPENDLY-691: Clear a user's local reminders on sign-out and account switch

**Ticket:** [SPENDLY-691](https://kesavach.atlassian.net/browse/SPENDLY-691) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md).
**Branch:** `feature/SPENDLY-691-signout-clear-reminders`, cut from `feature/SPENDLY-222-push-notifications`.

## Problem

Bill reminders (`ccbill:`), Financial Calendar reminders (`cal:`) and Save Goal reminders (`goal:`) are scheduled on the device. Nothing cancelled them on sign-out, so on a shared or handed-over phone the next person kept receiving the previous user's reminders, including card names and amounts.

## What changed

| File | Change |
|---|---|
| `shared/utils/userReminderNotifications.ts` | `USER_REMINDER_NOTIFICATION_PREFIXES` (the bill, calendar and goal prefixes, each imported from its own module) and `isUserReminderNotificationId`. |
| `shared/utils/creditCardBillReminders.ts` | Adds `BILL_REMINDER_NOTIFICATION_PREFIX = "ccbill:"`, which `stableReminderNotificationId` now uses. The generated ids are unchanged. |
| `lib/userReminderNotifications.ts` | `clearUserReminderNotifications()` cancels the matching scheduled notifications and dismisses matching ones already in the tray. It does nothing on web and never throws; failures go to `logWarning`. |
| `providers/AuthProvider.tsx` | `logout()` awaits the clear before Firebase sign-out. The auth listener also clears whenever a signed-in uid goes away, which covers a revoked session or a deleted account. For a direct switch to another uid, the new user is published only after the clear finishes, so it can't remove their freshly scheduled reminders. A sequence guard drops stale events, and the cleanup drops a pending apply on unmount. |

## Behaviour

- **Sign-out:** every `ccbill:`, `cal:` and `goal:` notification is cancelled, and any already showing is removed from the tray.
- **Next sign-in:** the new user's reminders are rebuilt by the existing schedulers from their own data, as on any app start.
- **Untouched:** notifications from other sources and products (Ganesh, Nutrition, anything else) are left alone.
- **Web, local test build, Expo Go:** web does nothing. The others run the same code against whatever the notification module supports, and any failure is only logged.

## Tests

- `shared/utils/userReminderNotifications.test.ts`: real bill ids from `stableReminderNotificationId`, calendar and goal ids, non-matching ids from other products, non-string ids, and the exact prefix set.
- `lib/userReminderNotifications.test.ts`: cancels only the user's scheduled reminders, dismisses only theirs from the tray, does nothing on web, and logs instead of throwing.

## Not covered here

- Remote push tokens. The device registration story (SPENDLY-224) owns moving or removing a token on sign-out.
- Device QA on a real phone: sign in, schedule a bill reminder, sign out, and check that nothing fires and the tray is clear. This is listed for SPENDLY-233.

# SPENDLY-693: Hand local reminders over to push, without duplicates or stale reminders

**Ticket:** [SPENDLY-693](https://kesavach.atlassian.net/browse/SPENDLY-693) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md) and the [go-live checklist](SPENDLY-222-go-live-checklist.md).
**Branch:** `feature/SPENDLY-693-local-push-handover`, cut from the epic branch after the 696 merge.

## Problem

Every phone scheduled its own bill, calendar and goal reminders:
- **Stale reminders:** a bill paid on phone A kept reminding on phone B until B opened Spendly (plan bug 1).
- **Duplicates:** with push live, the same reminder would arrive twice, once from push and once locally.
- **iOS limit:** iOS allows only 64 pending local notifications per app (plan bug 8).

## Decision: one deliverer at a time, switched by the server

`shared/utils/push/reminderMode.ts`: a phone's reminders come **either** from push **or** from the phone, never both. **Push only when both are true:**
1. **Push reminders are live:** `system_settings/global.pushRemindersLive === true`.
   - The owner sets it at switch-on (checklist C4), after a scheduled run succeeds, and clears it in the emergency stop.
   - This prevents the opposite failure: phones dropping their own reminders while the server isn't sending (before switch-on, or with the kill switch on), which would leave users with **no** reminders.
2. **This install is registered for the signed-in user**, with notification permission (224).

In every other case the phone schedules its own reminders exactly as before: flag off, web, Expo Go, the local test build, registration failed, permission revoked, or a duress session.

## What changed

| File | Change |
|---|---|
| `shared/utils/push/reminderMode.ts` | The pure rule |
| `lib/pushRegistration.ts` | `isRegisteredForUser(uid)`, plus `onPushRegistrationChange`, which fires on every registration write or removal |
| `hooks/usePushReminderMode.ts` | `{ mode, loading }`, from the flag, the registration and the permission. It refreshes on registration changes and on returning to the foreground. **`loading` holds until all are known, so no scheduler ever cancels on a guess.** |
| `providers/SystemSettingsProvider.tsx` | `pushRemindersLive?: boolean` |
| `providers/CreditCardBillsProvider.tsx` + `services/creditCardBills/billReminderScheduler.ts` | In push mode, cancel every local `ccbill:` reminder (`cancelAllBillReminders`) instead of scheduling |
| `components/calendar/CalendarNotificationSync.tsx` | In push mode, cancel every local `cal:` reminder |
| `components/goals/GoalReminderSync.tsx` | In push mode, cancel every local `goal:` reminder |

**Switching back** (flag cleared, token lost, permission revoked): the next reconcile schedules local reminders again. That happens on data changes and app foreground.

**About the acceptance criterion "shared slot id as identifier and collapse key":** this isn't needed with exclusive modes, because a phone never has both a push and a local reminder for the same slot. The push slot ids still start with the local ids (bills add `@date`), for any later reconciliation.

## Tests

- `shared/utils/push/reminderMode.test.ts`: push only when live, registered and allowed. Local when not live, flag missing, flag not a real `true`, not registered, or permission revoked.
- `lib/pushRegistration.test.ts`: `isRegisteredForUser` follows the last registration and sign-out. Listeners hear writes and removals and can unsubscribe.
- Existing bill, calendar and goal scheduler and provider suites still pass.

## Go-live

No deploy. Checklist **C4** now sets `pushRemindersLive` after a good run. The **emergency stop** now also clears it, so phones go back to local reminders.

# SPENDLY-694: Financial Calendar reminders as push

**Ticket:** [SPENDLY-694](https://kesavach.atlassian.net/browse/SPENDLY-694) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md) and the [go-live checklist](SPENDLY-222-go-live-checklist.md).
**Branch:** `feature/SPENDLY-694-calendar-push`, cut from the epic branch after the 230 merge.

## What it does

The user's own calendar reminders (`users/{uid}/calendarReminders`) now arrive as push on every signed-in phone, from the reminder engine (692).

**Same plan as on the phone.** The source runs `planCalendarNotifications` (SPENDLY-184) for one reminder at a time, through the shared helper `calendarPush.ts`, which 695 dues will reuse. So push and on-device reminders always agree.

| Case | Behaviour |
|---|---|
| Lead days (`remindDaysBefore` 0, 1, 3 or 7) | "Due in 3 days" on the lead day |
| On the day | "Due today", at the reminder's **own time** if it has one (decision D8), otherwise 09:00, moved into the delivery window |
| Not done by the next day | One "Not done yet" notice the day after, at 09:00. Nothing after that. |
| **Marked done** (`completedDates`) | Never notified. The engine re-reads the reminder at send time, so marking it done a moment earlier counts. |
| **Recurring** (monthly, yearly, every N days) | Only the open occurrence. Nothing after `untilDate`. |
| **Deleted** | Nothing (the re-read finds no document) |
| **Edited** (date, time, lead days) | Planned from the re-read reminder. Slot ids carry the occurrence date, so a moved date is a new slot. |
| "My reminders" switched off | Nothing |
| Amount (`estimatedAmount`) | Only with "Show amounts on the lock screen" on (226) |
| 3+ reminders due together | One summary: "3 reminders for today" |
| Tap | Opens the calendar on that day with the reminder (allow-listed by 230) |

**Reads** (Spark budget):
- recurring reminders;
- one-time reminders dated from yesterday to a week ahead;
- at send time, the reminder itself.

## Files

| File | |
|---|---|
| `shared/utils/push/sources/calendarPush.ts` | Calendar events to push slots, through the local planner. Shared with 695. |
| `shared/utils/push/sources/calendarReminderSource.ts` | The source: candidates, `toReminder`, reload, summary |
| `shared/utils/push/testing/fakeAdminDb.ts` | Test helper: in-memory Admin Firestore plus push ports (shared by the source tests) |
| `scripts/push-reminders.ts` | The calendar source joins `buildSources` |
| `firestore.indexes.json` | `calendarReminders.recurrence` collection-group override, and the composite collection-group index `(recurrence, startDate)` |

## Tests

`shared/utils/push/sources/calendarReminderSource.test.ts`:
- lead-day notice, with the amount hidden by default;
- own time on the day, with the amount when allowed;
- the single overdue notice;
- a done occurrence;
- recurrence and `untilDate`;
- the switch off;
- a moved date;
- candidates under `users/` only;
- **end to end: done or deleted between query and send means no push, while the others are sent**.

## Go-live

The two indexes deploy with checklist step B2. Nothing else is new.

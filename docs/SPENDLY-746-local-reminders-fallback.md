# SPENDLY-746 — Local reminders only as a fallback; fewer reminder listeners

Story in epic **SPENDLY-735**, audit items B1–B4. Branch `feature/SPENDLY-735-remaining`. Built last, as agreed. Push goes to everyone (SPENDLY-222, C4b) after the epic reaches `main`.

## Already in place (no change needed)
- **Exclusive mode (SPENDLY-693):** in push mode, bills (SPENDLY-738), the calendar and goals cancel their local reminders and schedule nothing. In local mode (no push, no permission, or the kill switch off) they schedule as before. Never both, never neither.
- **Re-plan only on change:** the calendar and goal syncs already re-plan only when their plan key changes (SPENDLY-738's rule for bills). They are debounced, and nothing is written to Firestore.

## What changed
- **No listeners for reminders in push mode** (`localReminderSourcesEnabled`, `shared/utils/push/reminderMode.ts`):
  - `CalendarNotificationSync` registers the loans and money-owed listeners only in local mode.
  - `GoalReminderSync` subscribes to the goals only in local mode.
  - While the mode is unknown, both wait. They never cancel or schedule on a guess.
- **No second calendar-reminders listener:**
  - `RemindersInboxProvider` already listens to calendar reminders for the bell, and now shares them with `CalendarNotificationSync` through its context (`calendarReminders`, `calendarRemindersReady`).
  - The sync waits for them to load, so it doesn't plan twice on launch.
  - Every mode now has one listener fewer.
- **Inbox (B4):** its other sources (bills, subscriptions, loans, money owed, goals) are the shared, ref-counted provider listeners that the dashboard and calendar already use. So it adds no listener of its own except the notification rows.

## Not done (stated)
- **Serving the dues list from stored server output.** The bell's dues are a live view: overdue or due soon, with "seen" state kept on the device. The push job sends reminders but writes no inbox rows for dues (only events get rows). Storing a dues snapshot per user needs a new server-written collection and job. Today the inbox's listeners are the shared ones, so the gain is small; left as a follow-up if profiling asks for it.

## Tests
`shared/utils/push/localReminderStandDown.test.ts` (4) covers:
- the mode gate;
- the calendar sync uses the inbox's reminders and registers its loan listeners only in local mode;
- the goal sync subscribes only in local mode;
- push mode still cancels.

The existing `reminderMode` tests stay green.

## Owner steps
None for this story. After the epic reaches `main`, push reaches everyone through the SPENDLY-222 go-live step C4b (`pushRemindersLive: true`). From then on, phones with push registered and permitted schedule nothing locally.

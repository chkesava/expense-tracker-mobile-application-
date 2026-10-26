# SPENDLY-612: Goal reminders and estimated completion dates

Part of SPENDLY-606. Tracker: `docs/SPENDLY-606-save-goals.md`.

## What changed

### Reminder settings (FRD FR-11)
- `GoalReminders` (stored on the goal, last-writer-wins, no history event) gains `weekday` (0–6) and `monthDay` (1–28). Both are validated in `validateReminders`. The rules keep `reminders` as a map, so the rules don't change.
- **`components/goals/GoalRemindersSheet.tsx`** controls each of these independently:
  - **scheduled reminder:** off, daily, weekly (weekday) or monthly (day 1–28), with a time from preset chips, as in the existing notification settings;
  - **inactivity alert:** on or off, after 7, 14 or 30 days;
  - **milestone alerts:** on or off.
- **Permission:**
  - It is requested **only** when saving with a notification turned on.
  - If it's denied, the sheet says reminders still appear in the inbox and offers "Open device settings" (`Linking.openSettings`).
  - On web it explains that reminders are inbox-only.

### Planning: `shared/utils/goalReminders.ts` (pure)
- **`planGoalNotifications`:**
  - Stable ids `goal:{goalId}:{kind}:{date}`, a 31-day horizon, and a **cap of 20**. The calendar takes up to 30 and card bills a few, and iOS keeps 64 pending.
  - Ordered soonest first.
- **Suppression:** only **active** goals that haven't reached their target can remind. Paused, completed, archived and cancelled goals never notify, which is the AC's default.
- **Inactivity:** a single trigger at `lastContributionAtMs` (else `createdAtMs`) plus N days, at the reminder time.
  - It is re-planned whenever the goal summary changes, so every contribution moves it. **No polling, no history reads.**
  - A past inactivity date isn't sent again (no nagging); the inbox shows it until the next contribution.
- **`goalInboxItems`:** today's scheduled reminder and any overdue inactivity alert, for the **in-app inbox**. They work without permission and on web.

### Scheduling (existing infrastructure, no second notification system)
- **`services/goals/goalReminderScheduler.ts`:**
  - Cancels every `goal:` notification, then schedules exactly the plan, like the calendar scheduler.
  - Reuses `ensureBillNotificationHandler` and adds a "Savings goals" Android channel.
  - Never prompts by itself, never runs on web, and swallows and logs every failure.
- **Timezone:**
  - `billReminderScheduler` now exports `zonedDateAt(dateKey, hour, minute, timezone)`. It is extracted unchanged from `dateTriggerFromDateKey`, and the existing bill tests pass.
  - Goal reminders fire at the chosen time in the user's timezone setting.
- **`components/goals/GoalReminderSync.tsx`** is mounted beside `CalendarNotificationSync`.
  - It uses the shared, ref-counted goals listener (summaries only), attached after startup idle and only while Save Goals is on.
  - It debounces and re-plans on changes, and cancels everything when nothing is wanted.
- **Tap routing:** `NOTIFICATION_ROUTE_SOURCES` now includes `"goal"`, so a tap opens `/goals/{id}` through the existing handler.
- **Inbox:** `RemindersInboxProvider` adds goal items (source `"goal"`, piggy-bank icon in `inbox.tsx`).

### Milestone alerts
A goal's `milestoneEnabled` gates its **milestone** celebrations (`useGoalCelebrations`). Completion always celebrates.

### Estimated completion: `shared/utils/goalEstimate.ts` (pure)
- The estimate is based on the **average of recent contributions**: the net movement over the last 90 days since the first contribution in that window, as a daily rate.
- It needs at least **2 contributions spanning at least 14 days**. Otherwise it says "Not enough history to estimate…" and never invents a date.
- If savings aren't growing, it says so. It also flags an estimate that lands after the target date.
- **`hooks/useGoalEstimate.ts`:** one bounded read (`where goalId ==, createdAtMs >= now − 90d`, limit 200, using the 609 index) on the goal page. It re-reads only when the goal's version, amount, target or deadline changes.
- **`components/goals/GoalForecastSection.tsx`:** the estimate plus a one-line summary of the reminders, with Set up / Edit. Shown on open goals.

## Acceptance criteria → evidence
| AC | Evidence |
|---|---|
| Preferences persist; notification types can be turned off independently | Stored on the goal via `buildSettingsChange` (rules: settings-only path). Separate switches for scheduled, inactivity and milestone. `validateReminders` tests |
| No notification for archived, cancelled or completed goals (default: suppress) | `goalReminders.test.ts`: paused, completed, archived, cancelled and reached goals are all excluded |
| No excessive polling or full-history reads for inactivity | Inactivity comes from `lastContributionAtMs` on the summary, re-planned on change. The planner has no history input |
| Timezone boundaries, denied permission and duplicate scheduling tested | Month and year boundary dates. Stable ids give the same plan twice (no duplicates). Cancel-then-schedule. Inbox items need no permission. The `zonedDateAt` conversion is the existing, tested bill path |
| Estimate handles insufficient history and no contributions gracefully | `goalEstimate.test.ts`: none, one, a short span, older than 90 days, not growing, after the target date |

## Tests run
See the Jira comment for this commit.

## Limitations
- **"Push" is local scheduled notifications.** Remote push doesn't exist in Spendly yet (SPENDLY-222), so a milestone reached on another device shows in that goal's history, not as a push.
- **Notifications are per device.** Each device schedules its own from the shared goal settings once it has permission.
- Device check of notification delivery is pending (Spendly Test).

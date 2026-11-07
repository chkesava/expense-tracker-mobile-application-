# SPENDLY-696: Save Goal reminders as push

**Ticket:** [SPENDLY-696](https://kesavach.atlassian.net/browse/SPENDLY-696) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md) and the [go-live checklist](SPENDLY-222-go-live-checklist.md).
**Branch:** `feature/SPENDLY-696-goal-push`, cut from the epic branch after the 695 merge.

## What it does

Save Goal reminders now arrive as push on every signed-in phone, from the reminder engine (692). They are planned by **the same `planGoalNotifications`** as the on-device goal reminders (SPENDLY-612).

| Case | Behaviour |
|---|---|
| **Scheduled nudge** (daily, weekly on its weekday, monthly on its day) | "Time to save for {goal}" at the **goal's own time**, now moved into the delivery window (on-device, goals ignored the window) |
| **Inactivity** | "{goal} is waiting": N days after the last contribution, at the goal's time. Measured from `lastContributionAtMs` **at send time**, so a contribution just made cancels it. |
| **Paused, completed, archived, cancelled, or target reached** | Nothing (`goalCanRemind`, checked on the re-read goal) |
| Goal reminders off | Nothing |
| Legacy goal with no `status` | Treated as active, as in the app |
| **Save Goals rollout flag** (`system_settings/global`) | Only users the flag lets see goals get these pushes |
| Timezone | The inactivity date is worked out in the **user's** timezone. Before this, the planner used the machine's local time: fine on a phone, but UTC on the GitHub runner. `planGoalNotifications` / `inactivityDate` / `localDateKey` take an optional timezone, and the on-device behaviour is unchanged. |
| 3+ goals at once | One summary: "3 goals to save for today" |
| Tap | Opens `/goals/{id}` (allow-listed by 230) |

**Reads** (Spark budget):
- the flag document;
- goals with a scheduled nudge or the inactivity reminder on (two equality/`in` queries on nested reminder fields);
- at send time, the goal itself.

## Files

| File | |
|---|---|
| `shared/utils/push/sources/goalSource.ts` | `goalSlots`, `createGoalSource` (flag, candidates, reload, summary) |
| `shared/utils/goalReminders.ts` | Optional `timezone` for `localDateKey`, `inactivityDate`, `planGoalNotifications` |
| `shared/utils/push/testing/fakeAdminDb.ts` | Supports dotted field paths in queries |
| `scripts/push-reminders.ts` | The goal source joins `buildSources` (all four reminder sources are now in) |
| `firestore.indexes.json` | Collection-group overrides `financialGoals.reminders.frequency` and `financialGoals.reminders.inactivityEnabled` |

## Tests

`shared/utils/push/sources/goalSource.test.ts`:
- weekly nudge on its weekday at its time;
- inactivity in the user's timezone (a contribution at 23:30 IST counts for that day), cancelled by a recent contribution;
- each stopped status and target reached;
- legacy goal with no status;
- the rollout flag;
- reminders off;
- candidates under `users/` only;
- **end to end: the 09:00 inactivity nudge goes at 09:30, and the weekly 19:00 nudge isn't sent after the target is reached at 18:00**.

The existing `goalReminders` tests are unchanged and pass.

## Go-live

The two indexes deploy with checklist step B2. Nothing else is new.

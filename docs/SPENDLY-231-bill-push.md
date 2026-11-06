# SPENDLY-231: Credit card bill reminders as push (stop when paid)

**Ticket:** [SPENDLY-231](https://kesavach.atlassian.net/browse/SPENDLY-231) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md) and the [go-live checklist](SPENDLY-222-go-live-checklist.md).
**Branch:** `feature/SPENDLY-231-bill-push`, cut from the epic branch after the 692 merge.

## What it does

Bill reminders now come from the server (the reminder engine, 692), so they reach every signed-in phone even if Spendly was never opened there. **They stop as soon as the bill is paid**, because the engine re-reads the bill from Firestore just before each send and recomputes its status with the same helper the app uses.

| Case | Behaviour |
|---|---|
| **Paid** (in full), cancelled, or nothing left to pay | No reminder. The status is recomputed (`parseStoredBill`); a stale stored `status` is never trusted. |
| Paid **between the candidate query and the send** | Not sent: it's re-read at send time (end-to-end test). |
| **Part paid** | Keeps reminding, showing **what is still owed**. This also fixes the on-device copy, which used to show the statement total. |
| Global bill reminders off, or the bill's own reminder off | No reminder |
| **Snoozed** (`nextReminderAt`) | Nothing before that date. The on-device reminders now honour it too; the scheduler used to ignore it. |
| Cadence | The bill's own `reminderFrequency` beats the global defaults. Auto bills keep 3/1 days before. Due today. Overdue every 1–3 days, for at most 60 days. |
| **Due date or amount edited**, statement regenerated | Slots are recomputed from the re-read bill. The push slot id carries the slot's date (`ccbill:{id}:before:3@2026-11-06`), so a send for the old date never blocks the new one. |
| **Duplicate bills** from the legacy cron (SPENDLY-676) | One reminder per account and statement date. Cancelled extras never remind, and the app's own id `{accountId}_{statementDate}` wins. |
| **Account deleted** | No reminder |
| **Lock screen** | Amounts and card digits only when "Show amounts on the lock screen" is on (226). That now applies to the on-device reminders too. |
| Window and timezone | 09:00 in the user's timezone, moved into the delivery window (226). Once a day per slot. A late or missed run sends that day's notice, never a stale one. |
| 3+ bills due at once | One summary: "3 credit card bills need attention" |
| Reminder log | `users/{uid}/creditCardBillReminderLogs/push_{slotId}` with `channel: "push"` and status sent, skipped or failed |
| Tap | Opens `/credit-card-bills/{id}` (routing of push taps: 230) |

**Reads** (the Spark budget):
- A range query on `dueDate` for bills due from yesterday to a week ahead.
- A query on stored open statuses for bills up to 60 days overdue, so paid history isn't read.
- At send time, the bill and its account.

## Files

| File | Change |
|---|---|
| `shared/utils/push/sources/billSource.ts` | `billSlots`, `dedupeBills`, `createBillSource` (candidates, reload, summary, reminder log) |
| `shared/utils/billReminderCopy.ts` | The bill wording, moved from `services/` (now re-exported there): the remaining amount, `showAmounts`, no-account fallback |
| `shared/utils/creditCardBillStatus.ts` | `parseStoredBill`. The app's `toCreditCardBill` now delegates to it. |
| `shared/utils/creditCardBillReminders.ts` | `resolveBillReminderFrequency`, `isBillSnoozed`, shared by the local scheduler and push |
| `services/creditCardBills/billReminderScheduler.ts`, `providers/CreditCardBillsProvider.tsx` | Local reminders: the remaining amount, snooze, lock-screen setting |
| `shared/utils/push/reminderEngine.ts` | Sends the **re-read** slot (fresh amounts and names). Adds the `onSent` hook. |
| `scripts/push-reminders.ts` | The bill source joins the job |
| `firestore.indexes.json` | `creditCardBills.dueDate` collection-group override; composite collection-group index `(status, dueDate)` |
| `shared/types/creditCardBill.ts` | The reminder log `channel` can be `"push"` |

## Tests

- `shared/utils/push/sources/billSource.test.ts`:
  - each slot kind and the overdue cadence, with the 60-day cap;
  - paid, cancelled or zero left, despite a stale status;
  - part paid shows the remaining amount;
  - the switches and snooze;
  - auto-bill cadence;
  - deleted account;
  - moved due date gives a new slot id;
  - duplicate handling;
  - candidates under `users/` only (paid history excluded);
  - reload with or without the account;
  - the reminder log;
  - **end to end: paid between query and send means no push, while the overdue unpaid bill is sent**.
- `services/creditCardBills/billNotificationCopy.test.ts`: remaining amount, hidden amounts and digits, unknown account.
- Existing scheduler, read-model bill-pass and engine suites still pass.

## Go-live

The two indexes deploy with the go-live checklist's B2. Nothing else is new.

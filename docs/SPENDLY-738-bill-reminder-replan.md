# SPENDLY-738 — Bill reminders: no Firestore writes from planning; re-plan only when something changed

Story 3 of epic **SPENDLY-735**, "Server-side calculations: the app only delivers". Audit item B1 ([audit](SPENDLY-735-server-calculations-audit.md)). Branch `feature/SPENDLY-738-bill-reminder-replan`, cut from the epic branch.

## The problem (verified)
`CreditCardBillsProvider` re-planned the local bill reminders on every bills snapshot, every reminder-prefs change and **every app focus**. Each pass:
- called `getAllScheduledNotificationsAsync` **once per bill** to cancel, then scheduled up to 12 slots per eligible bill;
- when notification permission wasn't granted, wrote **one Firestore `creditCardBillReminderLogs` doc per eligible bill**. **On web the permission is never granted**, so every focus on the web app wrote them. A slot that failed to schedule wrote one per slot per pass.

Nothing in the app reads these logs. The collection isn't in the read model; it falls under the rules' catch-all list. The server's push job writes its own logs for the pushes it sends.

## What changed
- **No Firestore writes from planning.** The provider's `writeReminderLog` is gone. A device that can't schedule (no permission, web, an OS error) is a device condition, not a bill event. It gets one `logWarning("creditCardBills.localReminders")` per reason per session, with counts only.
- **Re-plan only on change.**
  - `billReminderPlanKey` (`shared/utils/creditCardBillReminders.ts`, pure) holds everything the plan depends on:
    - the user, the mode (local or push), the permission, today, the timezone, `showAmounts` and the prefs;
    - each bill's reminder fields (status, due date, remaining, enabled, frequency, snooze);
    - the card's name and last 4, for the notification text.
  - It does **not** hold the account balances, so a new expense doesn't re-plan every reminder.
  - The snapshot and focus passes run only when the key differs from the last applied one. An unchanged focus costs one permission read.
  - **Push mode** cancels local reminders once, not on every focus.
- **A caller always gets a pass.** The context's `refreshReminderSchedules`, and the refreshes right after a bill write, are forced.
- **One scheduled-list read per pass** (`reconcileBillReminders`) instead of one per bill. The caller's permission read is passed in (`granted`).

## Invariant
Reminder eligibility and slots are unchanged: same functions, same caps. A day change, a bill change, a permission change, a prefs change or a mode change re-plans. The first pass after every launch always runs, because the key lives in memory.

## Tests
- `shared/utils/creditCardBillReminders.test.ts`:
  - the key is stable across bill order and account balances;
  - it changes for every input listed above;
  - push mode ignores the bills;
  - it never holds the full card number.
- `services/creditCardBills/billReminderScheduler.test.ts`:
  - one scheduled-list read for three bills;
  - the caller's permission is used, so the permission isn't read again.
- `lib/billReminderReplan.contract.test.ts` (provider source guard):
  - no reminder-log writes;
  - the pass is gated by the key unless forced;
  - the context's refresh is forced.
- Still green:
  - `providerSwitch`;
  - `readModelWriteHooks`;
  - the settle-up contract.

## No data change
- No new collection, field, index, rule or migration.
- The app simply stops writing the unread `creditCardBillReminderLogs` docs.

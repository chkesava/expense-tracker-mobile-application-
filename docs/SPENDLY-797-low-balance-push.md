# SPENDLY-797: Low-balance alerts — push source

**Epic:** SPENDLY-793. **Story:** S4 of 6.

**State:** built on `feature/SPENDLY-797-low-balance-push`. Nothing is deployed.

## What it does
`shared/utils/push/sources/lowBalanceSource.ts` is a reminder source, registered in `scripts/push-reminders.ts` (`buildSources`). It sends one push a day for each coming debit that its paying account can't cover, from `dueDate − leadDays` through the due day, until the shortfall is resolved.

- **Candidates:**
  - One collection-group query on `serverResults` with `kind == autoDebitShortfall` and `hasShortfall == true`. That is one document per short user (written by `autodebit-daily`, SPENDLY-796).
  - Each debit that falls short on a trusted account becomes its own item: `{kind}:{refId}:{billId}:{dueDate}`.
- **Today's slot (pure, `lowBalanceSlots`):**
  - Sent only inside the item's window, while `shortBy > 0`, and while `lowBalanceAlerts.enabled` is on.
  - Slot id: `lowbal:{key}@{today}`. A new day is a new once-only send, and a moved due date is a new key.
  - Kinds: `low_balance_before`, then `low_balance_due` on the due day. It goes out at 09:00, clamped into the delivery window.
- **Re-check at send time (`reload`):**
  - It re-reads the user's inputs from Firestore and runs the same engine as the job (`loadAutoDebitInputs` + `computeForInputs`).
  - Each user is read once per run, however many of their debits are due.
  - If the item no longer falls short, the engine counts it as `resolved` and sends nothing.
- **Copy:**
  - Without amounts (the default): "HDFC Savings may not cover Home loan EMI due on 22 Nov. Add money before it's debited."
  - With `showAmounts`: "…is short by ₹2,000 for Home loan EMI (₹12,000) due on 22 Nov…"
  - A card reads "{card} autopay". The day reads "today", "tomorrow" or "on 22 Nov".
- **Tap:**
  - a recurring item opens `/recurring/{id}`;
  - a card opens `/credit-card-bills/{billId}`.

  Both are on `PUSH_ROUTE_ROOTS`.
- **Burst:** 3 or more short debits for one user at once collapse into one summary: "N auto-debits may fall short" (→ `/recurring`).
- **Inbox:** after the first send, `onSent` creates one row per debit, not per day. It uses `create`, so it never resets a read row, and the row is noted for the read model.
  - Type `low_balance`, category `lowBalance`, shown with the bank icon.
  - A dry run skips `onSent` (SPENDLY-715).

### Category and switch
- `PushCategory` gains `lowBalance`. Its channel in `PUSH_CHANNELS` is `low-balance`, "Low balance before auto-debits", **high** importance (money about to be debited, like bills).
- **Switch:** `settings.lowBalanceAlerts.enabled`, **on by default**, mapped in `isPushCategoryEnabled`. It lives on the feature's own settings object (SPENDLY-794) rather than in `pushNotifications.categories`, so the on-device fallback (SPENDLY-799) can use the same switch.
- **UI:**
  - `SettingsProvider.setLowBalanceAlerts` (S5 reuses it for the default lead days);
  - a "Low balance before auto-debits" switch in the Notifications card;
  - the inbox icon.

### One loader for the job and the push
`shared/utils/autoDebitInputs.ts` (`loadAutoDebitInputs`, `computeForInputs`, `userToday`) is now the only Firestore read of a user's inputs and the only engine call.
- `autodebit-daily` (SPENDLY-796) was moved onto it. Its behaviour is unchanged.
- So the stored result and the push can't disagree.

### Index
The composite collection-group index `serverResults (kind, hasShortfall)` is in `firestore.indexes.json`. It moved here from S3, because this is the story that queries it.

## Tests
- `shared/utils/push/sources/lowBalanceSource.test.ts` (17 tests):
  - the slot, its date-carrying id and hidden amounts;
  - `showAmounts`;
  - today and tomorrow, and the due-day kind;
  - card routing;
  - stops before the window, after the due day, when covered, untrusted or switched off;
  - a new day gives a new slot;
  - `itemsFromAccounts`.
- The engine end to end on `fakeAdminDb`:
  - sends, with an inbox row and a read-model note;
  - **stops when** the account is topped up after the stored result, the debit posted, the item is paused, unlinked or untrusted, or the card bill is paid;
  - the switch off;
  - once a day, and the next day again, without a second inbox row;
  - the 3+ summary, with inputs read once per user.
- Updated tests:
  - `pushPreferences.test.ts` (category and channel);
  - `settings.test.ts` (`enabled`);
  - `lib/pushChannels.test.ts` (8 channels);
  - the 796 contract (shared loader).

### Run locally
- Push suite plus settings, job and contract: 24 files, **415/415**.
- Read-model guards (`readModelWriteHooks`, `readmodelServerPush`, `mapping`, `providerSwitch`): **194/194**.
- `typecheck:shared` and `tsc --noEmit` are clean. An include-based check of the changed scripts is clean.
- **Emulator smoke test** in an isolated demo project, cleared afterwards:
  - seeded a ₹12,000 EMI due in 2 days against ₹10,000;
  - `autodebit-daily` stored the shortfall;
  - `push-reminders --dry-run` reported `[DRY RUN] would send 1 push(es): low_balance_before`.

## Go-live (each step needs approval)
1. Deploy the index (dry-run diff first).
2. Have 796 live: migration `20261121000000`, `AUTODEBIT_DAILY_ENABLED`, the Worker.
3. **App release first:** it carries the `low-balance` channel and the switch. It hasn't been checked on a phone how a push to a missing channel shows on an older build.
4. Run a `push-reminders` dry run and check that `low_balance_before` appears for a short tester.

The send itself follows the existing push rollout: kill switch, `allowUids` and `PUSH_REMINDERS_ENABLED`.

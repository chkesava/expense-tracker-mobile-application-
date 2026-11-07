# SPENDLY-692: Server reminder engine

**Ticket:** [SPENDLY-692](https://kesavach.atlassian.net/browse/SPENDLY-692) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md).
**Branch:** `feature/SPENDLY-692-reminder-engine`, cut from the epic branch after the 227 merge.

## Decisions

- **Runtime (D3, user, 2026-11-06): GitHub Actions cron.**
  - The Firebase project is on **Spark**, so Cloud Functions can't run. The `functions/` codebase was never deployed. An earlier plan line said otherwise and has been corrected.
  - Netlify credits are low.
  - The repo is public, so Actions minutes are free.
  - Firestore reads count against Spark's 50K/day, shared by dev and prod, so every run is read-budgeted.
- **Ledger = the sender's idempotency claim**, not a separate `users/{uid}/pushDeliveries` collection.
  - The key is `{uid}:{slotId}`, and slot ids are the ones the local reminders already use. The claim in `pushSendLogs` (227) already guarantees once-per-slot.
  - A second ledger would be a parallel record, and a new user collection that would need the full read-model treatment.
  - Skips are counted per run, by reason, in the job's summary output. They aren't stored, so a slot skipped now (for example, outside the window) can still go out later that day.

## How a run works (`scripts/lib/pushRunCore.ts`)

1. **Budget.** `pushConfig/usage-{UTC date}` holds the day's reads. Allowance per run = min(`PUSH_MAX_READS_PER_RUN`, default 400; what's left of `PUSH_MAX_READS_PER_DAY`, default 6000). Every Firestore read goes through a meter (1 per document get, the document count per query), and the run stops early once the allowance is spent.
2. **Receipts.** Logs with `receiptsPending` that are 15 min – 24 h old are read through `processReceipts`, and `DeviceNotRegistered` devices are pruned. After 24 h, Expo no longer has the receipts, so the job stops asking.
3. **Engine** (`shared/utils/push/reminderEngine.ts`, `runReminderTick`):
   - Every source returns candidates across users (collection-group queries).
   - For each user, their timezone and delivery window (226) are read. Outside the window, the user is skipped.
   - The item's slots are worked out for the **user's** date. Only the **latest due** slot per item is kept, and a slot timed outside the window moves to the window's start.
   - The item is **re-read from Firestore** and its slots recomputed. If it was deleted or resolved, nothing is sent.
   - The slot is sent with `idempotencyKey = {uid}:{slotId}` and a TTL to the end of the user's day.
   - **Three or more** due notices for one user and category collapse into **one summary**. Each covered slot is then claimed, so they don't follow one by one.
4. **Read model.** Pruned device deletes go through `createServerPush(serverPushPorts(db))` and are flushed (SPENDLY-680). Without Supabase settings, the nightly sync copies them.
5. The usage counter is saved.

**Dry run** (`--dry-run`; the workflow's manual default): reads and decides everything, but sends, claims, prunes and writes nothing.

## Workflow: `.github/workflows/push-reminders.yml`

- Runs `*/15 * * * *` plus manual. No concurrency overlap, 10-minute timeout.
- **Scheduled runs do nothing until `PUSH_REMINDERS_ENABLED=true`.**
- **Secrets:** `PUSH_FIREBASE_SERVICE_ACCOUNT` (falls back to `FIREBASE_SERVICE_ACCOUNT`), and optionally `EXPO_ACCESS_TOKEN` and `READMODEL_SUPABASE_SERVICE_ROLE_KEY`.
- **Variables:** `READMODEL_SUPABASE_URL`, `PUSH_MAX_READS_PER_RUN`, `PUSH_MAX_READS_PER_DAY`.
- **Kill switch:** `pushConfig/global { sendsDisabled: true }`.

**No sources yet.** 231 (bills), 694 (calendar), 695 (dues) and 696 (goals) each add one to `SOURCES` in `scripts/push-reminders.ts`. Until then, a run only reads receipts.

## Tests

- `shared/utils/push/reminderEngine.test.ts`, with a test source:
  - sends once per slot, with the TTL;
  - re-check skips items paid or deleted since the query;
  - only the latest due slot, never another day's;
  - outside the window in the user's own timezone;
  - summary collapse claims each slot;
  - budget stop, no settings, kill switch;
  - time helpers, including an overnight window.
- `scripts/pushRunCore.test.ts`:
  - per-run and per-day budget, and the meter;
  - a full run sends, logs and records reads;
  - dry run writes nothing;
  - stops when today's allowance is used;
  - receipts 15 min – 24 h old prune and notify the read model, and fresh ones wait.

## Open

- **Before enabling the schedule:** the 227 rules and indexes are deployed, the owner's FCM key is uploaded, and at least one source (231) is merged. Then a manual dry run, then `PUSH_REMINDERS_ENABLED=true`.
- **Read cost** is measured per run in the summary (`reads`, `readsToday`). Tune the allowances after the first week.

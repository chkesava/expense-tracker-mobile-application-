# SPENDLY-796: Low-balance alerts — server job

**Epic:** SPENDLY-793. **Story:** S3 of 6.

**State:** built on `feature/SPENDLY-796-autodebit-check-job`. Nothing is deployed and nothing runs until the go-live steps below.

## What it does
`autodebit-daily` runs the S2 engine (`computeAutoDebitShortfall`) on the server for each user. It stores the result at `users/{uid}/serverResults/autoDebitShortfall`, in the existing `serverResults` collection, which is already synced (no new collection or table). The app (S5) and the push (S4) only read it.

**Alerts only:** the job never writes a balance, a transaction or a bill.

### Core (`scripts/lib/autoDebitDailyCore.ts`)
- **Today** is the user's own calendar day, from `settings.timezone` (default `Asia/Kolkata`). An invalid timezone is counted (`invalidTimeZone`) and the user is skipped, not guessed.
- **Default lead days** come from `settings.lowBalanceAlerts.defaultLeadDays`. A bad value falls back to 3.
- **Inputs are read from Firestore**, never the copy (R4.3a):
  - active subscriptions;
  - accounts and account types;
  - card bills, open statuses only;
  - group funds;
  - the stored result.
- **Write rules:**
  - The document is written only when it differs from the stored one: a different `today`, figures, flag or version. Re-runs on the same day don't churn.
  - It is written with `merge: true`, so `createdAt` survives. Every field is a scalar or a whole array, so nothing stale is left behind.
  - A user with nothing to check and nothing stored gets no document.
  - A user whose stored shortfall has cleared gets an empty result (`hasShortfall: false`).
- **Run modes:**
  - `runAutoDebitDaily` covers every user.
  - `runAutoDebitQueue` covers only the queued users, for up to 3 rounds; it clears what it served and leaves everything queued when the budget runs out.

### CLI (`scripts/autodebit-daily.ts`)
- **Owners:** the ids of every `users` doc (one cheap list), so card-only users and stale results are covered too.
- **Per user:**
  - Reads the settings, the stored result, active subscriptions and accounts.
  - Bills, account types and group funds are read only when the user has an auto-debit (a subscription with an account, or a card linked to a paying account).
- **Push and budget:** creates the read-model server push. Budget is `AUTODEBIT_MAX_READS_PER_RUN` (default 5000).
- **Firestore queries:** `isActive == true` and `status in [...]` are single-field queries on one collection, so no new index is needed.

### Triggers
- **Daily:** the Cloudflare Worker's 03:00 UTC tick now also dispatches `autodebit-daily.yml` (`DAILY_WORKFLOWS`, `wrangler.toml` comment, trigger tests).
- **After a save:** Supabase migration `20261121000000_readmodel_autodebit_run_queue.sql` adds the job `autodebit-daily` to `server_run_queue` and adds `autodebit-daily.yml` to `server_run_dispatch`. Every earlier job is kept, with the same 60-second debounce per job and no uid sent.
- **What queues a user** (an app save only, `written_by = 'client'`; server writes never queue):
  - `subscriptions`: an item with an `account_id` now or before. Unlinking, pausing and deleting count.
  - `accounts`: when the card's `autopayFromAccountId` is set now or before, or the user has any auto-debit. A top-up is an `accounts` row update, so it clears the banner within about a minute.
  - `credit_card_bills`, `group_funds`: only for a user with an auto-debit (`server_run_has_autodebits`, a filter on typed `subscriptions` columns plus the `doc->>'autopayFromAccountId'` test the Spaces migration also uses).
  - Users without auto-debits, and duress uids, never queue. The existing purge trigger clears the job's rows.
- **The workflow:** `.github/workflows/autodebit-daily.yml` accepts `manual | cron | queue` triggers. Cron and queue runs only go ahead when `AUTODEBIT_DAILY_ENABLED` is set. Manual runs default to a dry run.

### Guards and tests
- `scripts/autoDebitDailyCore.test.ts` (13 tests):
  - the user's day by timezone;
  - the stored shape;
  - default lead days and card types;
  - no churn on the same day, and a rewrite on a new day;
  - a top-up clears the result;
  - a version change rewrites;
  - nothing stored means no document;
  - an invalid timezone;
  - duress and dry run;
  - queue mode, and the queue's dry run.
- `lib/autoDebitRunAfterSave.contract.test.ts` (5 tests) pins:
  - the triggers;
  - that each watched table is client-written;
  - that the dispatch keeps every job;
  - the workflow gate and its `--queue`;
  - the Worker list;
  - that the engine runs on Firestore inputs.
- `supabase-readmodel/tests/autodebit_run_queue.sql` checks:
  - server writes, users without auto-debits and duress don't queue;
  - an item save and an unlink queue;
  - a top-up queues, then dispatches with no uid, debounced;
  - linking and unlinking card autopay both queue;
  - a tombstone queues;
  - the job constraint keeps every job;
  - a purge clears it.

  It is added to `readmodel-schema.yml` and **runs in CI only**: Docker isn't available locally.
- `netlify/functions/readmodelServerPush.test.ts`: the core is allowed as an `applyJobWrites` writer, and the CLI creates the push.
- `cloudflare/push-trigger/trigger.test.ts`: 11 daily workflows, and this one's gate.

### Verified locally
- The focused tests pass:
  - core 13/13;
  - contract 5/5;
  - Spaces contract 6/6;
  - trigger 23/23;
  - server-push guard 9/9 (it timed out once under a parallel run and passed on its own);
  - engine 22/22.
- `typecheck:shared` and `tsc --noEmit` are clean. The new scripts also pass an include-based check, because the root config excludes `scripts/`.
- An end-to-end run on the Firestore emulator, in an isolated demo project:
  - **The seeded user:** ₹6,000 EMI + ₹7,000 card bill (total), ₹10,000 balance, ₹1,000 held, lead days 5.
  - **Dry run:** 10 reads, and 1 planned write.
  - **Real run:** stored `available 9000`, `cumulative 13000` and `shortBy 4000` on both items, with the paid bill ignored.
  - **Second run:** `unchanged`, with no write.
  - Afterwards the demo project was cleared.

## Go-live (each step needs approval)
1. Apply Supabase migration `20261121000000` with a dry run first. It only adds triggers and functions; no data changes.
2. Run a dry run of `autodebit-daily.yml` (manual, `dry_run: true`) and check the summary.
3. Set the repo variable `AUTODEBIT_DAILY_ENABLED=true`.
4. Redeploy the Worker (`wrangler deploy`) so the daily tick dispatches it.

The plan called the variable `AUTODEBIT_CHECK_ENABLED`. It is named `AUTODEBIT_DAILY_ENABLED` to match every other `*-daily` job.

The push candidate index on `serverResults (kind, hasShortfall)` moves to S4 (SPENDLY-797), the story that queries it.

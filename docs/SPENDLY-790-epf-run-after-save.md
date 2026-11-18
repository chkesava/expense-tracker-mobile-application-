# SPENDLY-790 — The server recomputes the EPF summary about a minute after an EPF save

Follows **SPENDLY-740** (epic SPENDLY-735, "the app only delivers") and reuses **SPENDLY-737**'s run queue. Branch `feature/SPENDLY-790-epf-run-after-save`, cut from `main`.

## Why
Since SPENDLY-740 only `epf-daily` writes `users/{uid}/financialSummaries/epf`, once a day at 08:30 IST. Net worth, the Accounts EPF card, the dashboard and runway all read that document. The EPF tab itself derives its balance from the rows, so the two disagreed for up to a day after any EPF change.

Seen on 2026-11-18. The owner backfilled October 2026 (₹6,000) and marked it credited after that morning's run:
- the EPF Balance tab showed ₹56,391.11;
- Money → Accounts showed ₹50,391.11.

The 08:30 run had found nothing to do (`written: 0`). A dry run (44308998759) found the one stale summary, and a manual run (44309652005) repaired it: 1 written, 0 failed.

## Design: Supabase notices the save (as in SPENDLY-737)
The app sends nothing extra. An EPF save already reaches the read model through `rm_client_apply` (`written_by = 'client'`).

### Supabase (migration `20261117000000_readmodel_epf_run_queue.sql`)
- **Queue:** `server_run_queue.job` now allows `'epf-daily'` as well as `'bill-daily'`.
- **Trigger:** `server_run_note_epf_inputs()` is a statement trigger on insert and update of `epf_establishments`, `epf_contributions`, `epf_transfers` and `epf_reconciliations`.
  - Those are every ledger input of `calculateEpfSummary`, except `epf_interest_entries`, which `epf-daily` writes itself; watching it would loop.
  - It queues each owner of app-written rows. An app delete is an update with `written_by = 'client'`, so deletes queue too.
  - Server writes never queue, and neither do duress uids.
  - It never fails the save: errors become warnings.
- **Dispatch:** `server_run_dispatch(job)` now maps `bill-daily` to `bill-daily.yml` and `epf-daily` to `epf-daily.yml`.
  - It sends `{dry_run: false, trigger: queue}` with no uid.
  - The debounce stays once a minute per job (`server_run_dispatches`), so an EPF save never holds back a bill dispatch.
  - Unknown jobs are refused.
  - It uses the Vault token from SPENDLY-737. Without the token, nothing is dispatched and the daily run catches up.
- **Purge:** the SPENDLY-737 trigger already clears every job's rows for a purged user.

### `epf-daily --queue` (`scripts/lib/epfDailyCore.ts` `runEpfQueue`)
Each round:
1. Read the `epf-daily` queue.
2. Run `runEpfDaily` for those users only (`onlyUids`), straight from Firestore.
   - There is no read-model finder, because the copy can lag the save that queued the user.
   - Each queued user costs about 6 reads.
3. Clear the served requests, unless a newer save moved `requested_at`.

More details:
- Up to 3 rounds pick up saves made during the run.
- If the read budget runs out, the requests stay queued.
- A dry run does one round and clears nothing.
- Duress requests are cleared without being served.
- The contribution catch-up (the epf-cron handler) is skipped in queue mode. It stays in the daily run.

The summary is still derived whole from the rows (`decideEpfSummarySync`) and written only when it differs, so a run with nothing new writes nothing.

### Workflow (`.github/workflows/epf-daily.yml`)
- `trigger` has a new `queue` option, which runs `--queue`.
- Queue runs obey `EPF_DAILY_ENABLED`, like the Worker's `cron` runs.
- The `epf-daily` concurrency group keeps runs from overlapping.

### App
Nothing changes. The save is the signal.

## Freshness
Save → read model (seconds) → dispatch (at most once a minute) → Actions start and `npm ci` (about 1–2 minutes) → summary written. About 2–3 minutes in all.

## No new user data
- No new table, Firestore collection, field, rule or index.
- The queue holds a uid and a time, briefly, and is server-only.

## Tests
- **`supabase-readmodel/tests/epf_run_queue.sql`** (new CI step in `readmodel-schema.yml`):
  - server writes don't queue;
  - an app save queues `epf-daily` only, and without a token nothing is dispatched;
  - with a token, mark credited sends one dispatch to `epf-daily.yml`, with no uid;
  - debounced within the minute;
  - the debounce is per job (a bill save still dispatches `bill-daily`);
  - an app delete queues;
  - all four inputs carry both triggers, and the interest table carries none;
  - duress is never queued;
  - unknown jobs are refused;
  - a purge clears every job.
- **`supabase-readmodel/tests/assert_security.sql` §12:** the trigger function is a definer with an empty search_path that clients can't execute, and all four inputs carry both triggers.
- **`scripts/epfDailyCore.test.ts`** (7 queue tests):
  - the stale summary is rewritten from Firestore with no owner scan, and the request is cleared;
  - an empty queue reads nothing;
  - an in-sync user is cleared without a write;
  - a save during the run is taken by round 2;
  - a dry run;
  - duress;
  - budget.
- **`lib/epfSummaryRunAfterSave.contract.test.ts`** (new guard): the watched tables are exactly the EPF ledger tables, are on the `rm_client_apply` allowlist, and are what the job loads. The live dispatch keeps both workflows. The workflow gate and `--queue` are pinned.
- **`lib/creditCardBillSettleUp.contract.test.ts`:** the dispatch check now reads the latest `server_run_dispatch` definition.

## Owner steps (after `main`, each with approval)
1. **Apply migration `20261117000000`.** Dry run first, per `docs/READMODEL_RUNBOOK.md`. pg_net and the Vault token are already live from SPENDLY-737.
2. **Check it:**
   - Mark an EPF month credited, or backfill one.
   - Within about 3 minutes, Actions shows an *EPF daily* run with `trigger: queue`.
   - Net worth matches the EPF Balance tab.

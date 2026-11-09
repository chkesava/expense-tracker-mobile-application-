# SPENDLY-737 — The server settles bills about a minute after a money action

Story in epic **SPENDLY-735**, "Server-side calculations: the app only delivers". Branch `feature/SPENDLY-737-on-demand-server-run`, cut from the epic branch (after SPENDLY-734).

## Why
SPENDLY-734 removed the bill pass from the app. `bill-daily` settles bills at 08:30 IST, so a cashback or payment recorded during the day would wait until the next morning. The owner chose results within minutes of a money action (2026-11-09).

## Owner decision (2026-11-09): Supabase notices
The owner was offered two designs:
- **The app sends a request:** a new Firestore collection plus a public Worker endpoint.
- **Supabase notices the save:** chosen. **The app sends nothing extra.** Its save already reaches the read model within seconds through `rm_client_apply` (`written_by = 'client'`). The read model queues the user and starts the job.

## What changed
### Supabase (migration `20261112000000_readmodel_bill_run_queue.sql`)
- **`server_run_queue (uid, job, requested_at)`:**
  - server-only: RLS on, no policies, no client grants;
  - one row per user, and a newer save moves `requested_at`.
- **The trigger:** `server_run_note_bill_inputs()`, a statement trigger on insert and update of `expenses`, `account_payments`, `credit_card_bills` and `accounts`.
  - It queues each owner of **app-written** rows (`written_by = 'client'`).
  - Server writes (the sync, the per-write push, `bill-daily`'s own bills) never queue, so there are no loops.
  - Duress uids are never queued.
  - It never fails the app's save: errors become warnings.
- **The dispatch:** `server_run_dispatch('bill-daily')`.
  - It is debounced to **once a minute** (`server_run_dispatches`).
  - It sends `net.http_post` (pg_net; sent only if the transaction commits) to GitHub's run-workflow API: `bill-daily.yml`, `{dry_run: false, trigger: queue}`. **No uid in the request.**
  - The token is read from Vault (`spendly_github_dispatch_token`). Without one, nothing is dispatched and the daily run serves the queue.
- **Purge:** a trigger on `purged_users` clears the purged user's queue rows. `readmodel_purge_user` is untouched, so it can't clash with another story's purge list.

### `bill-daily` queue mode (`scripts/lib/billDailyCore.ts` `runBillQueue`, `scripts/bill-daily.ts --queue`)
Each round:
1. Read the queue (service role).
2. Find the work for those users only on the read model (`findBillWorkOnReadModel` with `onlyUids`).
3. Read only those users' accounts from Firestore (`listAccountsFor`; no collection-group scan of every user).
4. Run the bill pass for their closing or named cards, from Firestore, through `applyJobWrites`.
5. Clear the served requests. A request is deleted only if no newer save moved `requested_at`.

Up to 3 rounds take saves made during the run. Out of read budget, the requests stay queued. A dry run does one round and clears nothing. Duress entries are cleared without being served.

### Workflow (`.github/workflows/bill-daily.yml`)
- **New option:** `trigger` has a `queue` option, which runs `--queue`.
- **Gate:** queue runs obey `BILL_DAILY_ENABLED`, like the Worker's `cron` runs:
  `vars.BILL_DAILY_ENABLED == 'true' || (inputs.trigger != 'cron' && inputs.trigger != 'queue')`.
- **Concurrency:** group `bill-daily`, so runs never overlap.

### App
`requestBillPass()` is **removed**: from the provider, the hook, `RecordCashbackModal` and `ReconcileStatementModal`. A money action needs no extra call; its save is the signal. Each call site has a comment saying so.

## Freshness and cost
- **Freshness:** save → read model (seconds) → dispatch (at most once a minute) → Actions start and `npm ci` (~1–2 min) → bill written. About 2–3 minutes in all.
- **Phone:** nothing extra.
- **Firestore:** only the queued users' accounts and their cards with work.
- **Actions:** minutes are free (the repository is public). The `bill-daily` concurrency group keeps at most one run plus one pending.

## No new user data
- The queue holds a uid and a time, briefly. It isn't user data mirrored from Firestore, so it has no `TableSpec`, client allowlist or owner policy.
- It is server-only, and the purge clears it.
- No new Firestore collection, field, rule or index.

## Tests
- **`supabase-readmodel/tests/bill_run_queue.sql`** (new CI step in `readmodel-schema.yml`; pg_net and Vault are stubbed in `bootstrap_roles.sql`):
  - server writes don't queue;
  - an app save queues without a token, dispatches nothing;
  - with a token: one dispatch with the exact URL and body, no uid;
  - debounced within the minute, and dispatches again after it;
  - duress never queued;
  - clients can't read the queue or call the dispatch;
  - a purge clears only that user.
- **`supabase-readmodel/tests/assert_security.sql` §11:** the queue tables are server-only with no policies; the functions are definers with an empty search_path and aren't client-executable; all four inputs carry both triggers.
- **`scripts/billDailyCore.test.ts`** (queue mode, 6 tests):
  - Roar settled with only the queued user read, no collection-group scan;
  - an empty queue reads nothing;
  - a save during the run is taken by round 2;
  - a dry run;
  - duress;
  - budget.
- **`lib/creditCardBillSettleUp.contract.test.ts`** (rewritten guard) pins the chain:
  - the app has no `requestBillPass`/`generateAutoBills`;
  - cashback writes `accountPayments`;
  - the trigger watches exactly the four bill inputs, app saves only;
  - all four are on the `rm_client_apply` allowlist;
  - the dispatch URL and body match the Worker's repo and `bill-daily.yml`;
  - the workflow gates queue runs and passes `--queue`.

## Owner steps (after the epic reaches `main`, each with approval)
1. **The SPENDLY-682 rollout:** `bill-daily` live with `BILL_DAILY_ENABLED`.
2. **Apply migration `20261112000000`** (dry run first, per `docs/READMODEL_RUNBOOK.md`).
3. **Enable `pg_net` and store the GitHub token in Vault** (runbook, "Bill-run queue").
4. **Check it:** record a cashback in the app. Within about 3 minutes, Actions shows a *Bill daily* run with `trigger: queue`, and the bill shows PAID.

# Read-model runbook (SPENDLY-494)

This runbook is for operating the Firestore → Supabase read model. Firestore stays the source of truth. Supabase is a copy that the sync job keeps up to date, and nothing in the app writes to it. It is written for someone with no history of the project: start at "Architecture", then "First-time setup".

## Architecture

```
 app (writes) ──► Firestore ──(read-only, nightly)──► GitHub Actions sync ──(service role)──► Supabase Postgres
                     ▲                                                                                  │
                     │ live window, writes, fallback                                                     │ RLS: owner-only SELECT
 app (reads) ────────┴──── per-screen switch system_settings/global.readModel.<screen> ─────────────────┘ (Firebase token, role claim
                                                                                                             from Netlify readmodel-claims)
```

- **Writes never change:** the app writes only to Firestore. The read model is a rebuildable copy, so losing it loses nothing (drill D1).
- **The sync** (`scripts/readmodel-sync.ts` + `scripts/lib/readmodelSyncCore.ts`):
  - reads Firestore with a read-only key and writes through version-guarded SQL functions;
  - runs nightly in full (tombstones, field parity with repair, orphan check). The 3-hourly changed-only schedule was removed on 2026-10-23 to save about 4,800 Firestore reads a day while nothing reads the copy. `incremental` is still available as a manual mode. Per-write pushes (SPENDLY-583) will keep the copy current;
  - never reads duress trees or erased accounts.
- **Reads:** each screen reads Firestore, or the read model under its switch, with a session fallback to Firestore and a freshness badge (SPENDLY-511 to 513).
- **Identity:** the app's Firebase ID token. Supabase third-party auth checks it; `readmodel_auth.uid()` re-checks issuer, audience, expiry, role and duress. The `role: authenticated` claim is set once by the Netlify `readmodel-claims` function (SPENDLY-505).
- **Account deletion:** the `delete-account` function calls `readmodel_purge_user` and the read model refuses the uid from then on (SPENDLY-508).

| Piece | Where |
|---|---|
| Sync job | `.github/workflows/readmodel-sync.yml`, runs `scripts/readmodel-sync.ts`. **Nightly** at 02:00 IST it copies everything (SPENDLY-506; nightly-only since 2026-10-23). Manual runs can also use `incremental` (changed documents only) |
| Health check | `.github/workflows/readmodel-health.yml`, runs `scripts/readmodel-health.ts` hourly at :45 (SPENDLY-507) |
| Supabase project | `spmsgncjbnbkxvsbpqlu`. Tables: `sync_runs`, `sync_failures`, `sync_status`, `sync_checkpoints` |
| Design | `docs/SPENDLY-494-adr.md` §0 and §8 |

## First-time setup (in this order)

**The step-by-step version, with exact commands, dashboard paths and checks, is `docs/READMODEL_POST_MERGE_SETUP.md`.** Below is the summary.

Each step is idempotent. Nothing here writes to Firestore.

1. **Supabase project** `spmsgncjbnbkxvsbpqlu`: apply every file in `supabase-readmodel/supabase/migrations/`, in name order, in the SQL editor or with `supabase db push --workdir supabase-readmodel`. Then confirm with the queries in `supabase-readmodel/tests/assert_security.sql` §1–4.
2. **Supabase → Authentication → Third-party auth:** add Firebase, project `expenseapp-27f94`. Nothing else may be listed.
3. **GitHub:**
   - set the secrets and variables in "Secrets and variables" below, using `! gh secret set NAME` so a value never passes through a chat or a file;
   - leave `READMODEL_SYNC_ENABLED` unset for now.
4. **Netlify site env:** set `READMODEL_SUPABASE_URL` and `READMODEL_SUPABASE_SERVICE_ROLE_KEY` (the account-deletion purge), plus whatever `readmodel-claims` needs (SPENDLY-505 doc). **Do this before the next web deploy:** account deletion fails closed without them ("Account deletion is paused…"), so no login is deleted while its data stays in Supabase.
5. **The workflow files must be on `main`.** GitHub runs scheduled workflows, and offers manual runs, only from the default branch.
6. **Backfill:** see "Backfill" below. Run a dry run, get approval, then the real full run, then verify.
7. Set `READMODEL_SYNC_ENABLED=true`. The nightly sync and the hourly health check start.
8. Wait for the **14-day parity gate** (SPENDLY-510). Only then flip screens: `shadow` for 7 days, then `supabase` ("Flipping a screen").

## How you find out something is wrong

The **Read-model sync health** workflow goes red. GitHub emails the repository owner about failed workflow runs, and the run's **step summary** lists the problems with metrics. It names collections and counts, never users.

| Health problem | What it means | What to do |
|---|---|---|
| Supabase is unreachable or paused | Supabase Free pauses a project after a week without activity, or the project is down | Restore the project in the Supabase dashboard. Screens fall back to Firestore by themselves (SPENDLY-511). The next sync run catches up; nothing is lost |
| No sync run for over 4 h | The schedule is off or stuck | Check Actions → Read-model sync. Is it enabled? Is `READMODEL_SYNC_ENABLED` `true`? GitHub **disables schedules after 60 days without repository activity**; re-enable the workflow |
| No full sync run for over 26 h | The nightly run is missing or failing | As above. Deletes and edits from older app versions aren't being caught |
| The latest sync run failed | The job crashed: secrets, Firestore or Supabase errors | Open the run's log. Fix the cause, then **Run workflow** (`mode=incremental`, `dry_run=false`) |
| Failures older than 24 h: `<collection> (mapping)` | A document has a value the read model can't type, such as a non-numeric amount. Its row is stored `unmapped`, with typed columns null | Find it in Supabase (`sync_failures`: doc id and field) and correct the source document in the app. The next pass maps it and resolves the failure by itself |
| `<collection> (pair_failed)` | Reading or writing one user's collection failed | It retries every run. If it persists, the run log has the reason (with a hashed uid) |
| Run note `purgedSkipped` / log line `[PURGED] skipped N erased account(s)` | An account was erased from the read model (account deletion) but Firestore still holds its documents, so the Firestore half of the deletion didn't finish. The sync skips it: no reads, no rows (SPENDLY-520) | Not an alert. Check `delete-account` logs for that account and finish the Firestore deletion |
| `* (orphan_uid)` | A full sync found read-model data for an account that no longer exists in Firestore: it was deleted without its read-model purge (SPENDLY-508), for example, before account deletion failed closed on missing settings (PR #234) | Erase it. In the SQL editor, as service role, run `select public.readmodel_purge_user('<uid>');`. The uid is in `sync_failures`. The purge also clears the failure. Then check `READMODEL_SUPABASE_URL` and `READMODEL_SUPABASE_SERVICE_ROLE_KEY` are set on the Netlify site |
| `<collection> (mass_tombstone_guard)` | A full pass found more than half of a user's rows in a table missing, so it refused to mark them deleted | Check Firestore. If the user really deleted them, tombstone them by hand (below). If it was a bad read, the next clean full pass resolves it |
| p95 copy age over 4 h | Copies are going stale | Usually a symptom of one of the problems above; check the runs list in the summary |
| Warning: runs skipped for the daily read budget | The sync used its 12K Firestore reads per day | Expected only in a backlog. If it repeats, check `reads_used` per run in `sync_runs` |

## Backfill (first copy) and verification (SPENDLY-509)

The first copy is just a full sync. Production data may only be written after an approved dry run (AGENT_WORKFLOW §7):

1. Actions → Read-model sync → **Run workflow**, `mode=full`, `dry_run=true`. Review the log: reads used, docs per collection, unmapped count.
2. Get approval. Then run it again with `mode=full`, `dry_run=false`. The **Verify count parity** step runs after it.
3. The verify step compares Firestore `count()` per (user, collection) with the read model's live rows. Green means the copy is complete; the step summary has the table by collection.
4. If it stopped on the read budget (`partial`), run the same thing again. It resumes and is idempotent.

**Count parity also runs after every nightly full sync.** On demand, use `mode=verify`; it costs about 1 read per 1,000 documents.

**Health:** "Count parity failed: …" means the latest verify found a (user, collection) whose counts differ. Usually a write landed between the sync and the verify, so re-run `mode=verify`. If it persists, run `mode=full` (`dry_run=false`), which restores missing rows and tombstones extra ones, then verify again.

## Parity (SPENDLY-510)

Every nightly full run also checks **field parity**: each stored row must equal what the mapper builds from its Firestore document.
- **A diverged row** (for example, edited by hand in Postgres) is rewritten from Firestore and recorded as a `parity` failure. The run shows `parityMismatches`.
- **Count parity** (verify) then confirms the totals.
- **Record parity findings** stores tonight's data findings: orphans, duplicate cashback, overpaid bills, balances the Wave 1 rows don't explain, missing amounts. These describe the data as Firestore has it, so they are reported, not failed on. The fix is in the app's data.

**The 14-day gate:** Actions → Read-model sync → `mode=report` prints it. The health summary shows the streak, "Parity gate: N of 14 clean days". A clean day means a full run with no field divergence, a passing verify, and no failed run.

When the gate passes, paste the report into `docs/` for sign-off. That is the Phase 2 exit evidence; screens move to Supabase only after it.

## Flipping a screen (SPENDLY-511)

Each screen's source is `system_settings/global.readModel.<screen>`, and each screen has its own switch and its own fallback (one failing screen never moves another back to Firestore). Clients can only read that document; the app follows changes live and applies them on the next load, so no release is needed.

| Screen key | What moves to the read model | What stays on Firestore |
|---|---|---|
| `journal` (511/512) | Month loads, older-history pages past the live 300-row window, filter matches. Reports and export are built from the same rows | The live window |
| `insights` (513) | The Insights month's expenses and incomes, by month key | Nothing else changes; the helpers are the same |
| `cashFlow` (513) | The dashboard chart's months before the last two (`v_cash_flow_by_month`) | The current and previous month (the tiles), until Phase 4 |
| `audit` (513) | One transaction's history (no listener at all), and older pages of the whole audit trail | The whole trail's newest 100 events (realtime) |
| `cashback` (513) | The purchases a cashback links to, when older than the loaded window (their notes) | The cashback rows and totals (already complete on the device) |

The `cashFlow` screen needs migration `20261027000000_readmodel_phase3_reads.sql`, which grants `authenticated` SELECT on `v_cash_flow_by_month` and the two `v_active_*` views it reads through. RLS still applies through them (`security_invoker`).

| Mode | What the screen does | When |
|---|---|---|
| `firestore` (unset = this) | Today's queries, unchanged. Nothing touches Supabase | Default, and the **kill switch** |
| `shadow` | Serves Firestore, fetches the same data from Supabase in the background, and logs any difference (`readModel.shadow.journal`, at most once per 10 min) | Any time after the sync is live, to prove a screen |
| `supabase` | Serves the read model, with a "last synced" badge when stale and "Updating…" when this device has newer writes. On an error or a 4 s timeout, Firestore serves the rest of the session (logged once, no toast), and the screen shows "History copy unavailable — showing live data" | **Only after the SPENDLY-510 14-day report is signed off** |

**Duress sessions, offline devices and builds without the read model always read Firestore, whatever the mode.**

**Journal flip order (SPENDLY-512):**
1. `shadow`: month loads are compared per load. Once Firestore has loaded a user's whole history, that history is compared whole (`readModel.shadow.journal.history`).
2. Wait for **7 days with zero shadow differences**.
3. `supabase`. Then 7 more days with zero incidents complete the ticket.

```
npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=shadow            # dry run
npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=shadow --apply
npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=firestore --apply  # roll back
```

You can also edit the field in the Firebase console, `system_settings/global` → `readModel` map.

**The app needs** `EXPO_PUBLIC_READMODEL_SUPABASE_URL` and `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY` in its build (SPENDLY-505). Without them, every mode behaves as `firestore`. `release.yml` and `web-deploy.yml` pass them in, from the variable `READMODEL_SUPABASE_URL` and the secret `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY`.

### Testing on a phone with Spendly Test (SPENDLY-512)

Spendly Test can't use the real read model, by design: emulator sign-in tokens are unsigned, and a test build must never see production data. In a local test build, the read model is instead a **loopback** (`lib/readModel/backend.ts`). It reads the emulator and puts every document through the same round trip as the real sync, then applies the same rules as the SQL: live rows only, date order, filters. Every mode, badge, fallback, page, filter and export can be tried on a phone. The SQL and RLS themselves are covered by the CI SQL tests.

```
# With the emulator running (npm run emulators:local):
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=supabase --apply
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=supabase --loopback-lag=240 --apply   # stale banner
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=supabase --loopback-fail=true --apply # outage → Firestore fallback
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=firestore --apply
```

The `--loopback-*` knobs are refused against production.

**Filtering on the read model (SPENDLY-512):** in `supabase` mode, a category, account or amount filter fetches **every matching row** from the read model. So the filtered Journal is complete without paging all history, and the screen still applies its full filter.

## Replay and recovery

There is no separate replay step. Every run re-reads the **current** Firestore document, and the upsert is version-guarded. So:
- **A failed run:** no high-water mark advanced, and the next run re-covers the same window.
- **To force a catch-up now:** Actions → Read-model sync → **Run workflow**, `mode=full`, `dry_run=false`.
- **Running it twice is harmless:** the second run changes nothing.
- **Rebuild from scratch** (proven by drill D1, which drops the whole database):
  1. In the SQL editor, as the service role, run `truncate public.expenses, public.incomes, public.ledger_events, public.accounts, public.account_types, public.account_transfers, public.account_entries, public.account_payments, public.credit_card_bills, public.categories, public.sync_status, public.sync_checkpoints;`. If the schema itself is broken, re-apply the migrations instead.
  2. Run workflow `mode=full`, `dry_run=true`, then (with approval) `dry_run=false`. The run reads about 1 per document: ≈ 3,800 for today's data, inside the 6,000-per-run budget.
  3. `mode=verify`.
  - Firestore is untouched. Screens fall back to Firestore while the tables are empty only if a read fails, so set every screen to `firestore` first (D4) if the rebuild will take longer than a few minutes.
- **A bad mapping deploy** (a mapper bug, drill D5):
  - **Symptoms:** the nightly run ends `partial` with `parityMismatches`; `v_data_quality` grows.
  - **Why it repairs:** the parity repair writes what the *deployed* mapper builds, so a bad mapper corrupts stored rows on its first nightly run, and alerts on that same run.
  - **Fix:**
    1. Revert the mapper commit on `main`.
    2. Run workflow `mode=full`. That run repairs every row and still exits red, because repairs are reported.
    3. Check that the following run is green.
  - Flip any affected screens to `firestore` until it is green.

**Manual tombstone,** after you've checked a mass-tombstone guard in Firestore. Run as the service role in the SQL editor:

```sql
select public.readmodel_tombstone('<table>', '<uid>', array['<doc id>', ...]);
update public.sync_failures set resolved_at = now()
 where uid = '<uid>' and collection = '<collection>' and error_class = 'mass_tombstone_guard' and resolved_at is null;
```

## Turning it off

| Goal | Action |
|---|---|
| Stop syncing | Set `READMODEL_SYNC_ENABLED` to anything but `true` (stops both workflows), or disable them under Actions |
| Stop reads from Supabase | The per-screen kill switch (SPENDLY-511), or leave the app's `EXPO_PUBLIC_READMODEL_*` empty |
| Cut client access entirely | `revoke select on all tables in schema public from authenticated;` |

## Per-write push (SPENDLY-583)

After this device saves synced documents, the app asks the Netlify function `readmodel-push` to copy them. The server reads each document **from Firestore** (never from the request) and upserts it, version-guarded, within seconds. The nightly full run is the safety net. Design and tests: `docs/SPENDLY-583-readmodel-push.md`.

| Need | Do |
|---|---|
| Turn pushes off | Netlify env `READMODEL_PUSH_ENABLED=false`. The function answers 202 and does nothing; the nightly run continues. No app release |
| Change the per-account limit | Netlify env `READMODEL_PUSH_LIMIT` (default 120 cost units per 10 min: 1 per document, 30 per per-user sync) |
| See what pushes are doing | The hourly health summary's "Per-write pushes today" line, or `select * from public.push_daily order by day desc;` |
| Health warns "N per-write push(es) failed today" | Netlify → Functions → `readmodel-push` → logs. Common causes: Supabase paused, a migration not applied (`20261028000000`), or Netlify env missing. The nightly run repairs the data either way |
| Health shows pushes **rejected**, or "—" while people are saving | Netlify → Functions → `readmodel-push` → logs. Since SPENDLY-662 every rejection is counted and logged as `[PUSH] rejected: <reason>`: `token <firebase code>` (e.g. `auth/id-token-expired` is normal now and then; a constant `auth/insufficient-permission` or `auth/argument-error` means the site's `FIREBASE_SERVICE_ACCOUNT` can't verify app tokens), `no-token`, `not-allowed`, `bad-request`, `purged`, `rate-limited`. `[PUSH] record failed` means the counters can't be written (migration `20261028000000` or the service-role key) |

## The nightly schedule and divergences (SPENDLY-672)

**The schedule:** nightly at 20:30 UTC (02:00 IST). The repository variable `READMODEL_NIGHTLY_MODE` chooses what it does:
- **unset or `full`** (the default): a full pass every night, then count parity and parity findings.
- **`safety-net`:**
  - Monday to Saturday: a changed-only pass. Changes are found by `createdAt`/`updatedAt` with collection-group queries, and the always-full account collections and `users/{uid}` run per user. It costs about 450 reads, against about 5,300 for a full pass.
  - Sunday (IST): a full pass, then count parity and parity findings.
  - Health then allows 7 days plus 2 hours between full passes, not 26 hours.

**Switching to `safety-net` (in order):**
1. The app dual-writes in production: a release with 670/671, then `system_settings/global.readModel.clientWrites = true`, and health shows app writes.
2. Deploy the collection-group indexes:
   - first diff the live indexes against the repo (`firebase firestore:indexes`), and dry-run;
   - then run `firebase deploy --only firestore:indexes`;
   - wait until every index is **Enabled** in the console. A collection-group query without its index fails, and its run records a `pair_failed` failure.
3. Trigger the sync manually with `mode = nightly`, `dry_run = true`, and set `READMODEL_NIGHTLY_MODE=safety-net` for that test. Check the reads and that `crossUserCollections` is about 48.
4. Set the repository variable `READMODEL_NIGHTLY_MODE = safety-net`. Watch the reads in `sync_runs.reads_used` for 7 days; the target is under 1K a night.

**Back to full nightly:** clear the variable, or set it to `full`. Nothing else changes.

**The indexes and the drift check:**
- The daily "Live vs repo drift" job (`firestore-rules-deploy.yml`) fails while `firestore.indexes.json` has overrides that aren't live. So deploy the collection-group indexes **when the epic reaches main, or before it**.
- Adding indexes is harmless before anything queries them; they only add a little index-write cost.
- Deploy them with the manual "Deploy Firestore rules" workflow (`deploy_indexes`), dry run first. It refuses a deploy that would delete live indexes.

**What a divergence is:** a row the app wrote directly (`written_by = 'client'`) that differed, in a typed column, from what the server maps from Firestore. The sync counts it in `sync_runs.notes.divergences` (per table), and Firestore's version replaces the row. Health warns when there are more than `READMODEL_DIVERGENCE_WARN` in 24 hours (default 0). Normal use is 0.

**When a divergence warning appears:**
1. Health names the tables. Look at that day's runs: `select started_at, notes->'divergences' from sync_runs where notes ? 'divergences' order by started_at desc`.
2. Usual causes:
   - the app's outbox mapped from a stale cache document;
   - a writer changed a field after its commit without notifying;
   - the app and server mappers differ, because a device runs an old build after a mapping change. That one clears as devices update.
3. A steady divergence on one table means a bug: find the writer, fix it, and add a test.

**When to run a manual full pass:**
- after a mapping change;
- after a known missed writer;
- after a restore;
- after any day health shows divergences or failures you can't explain.

Run it from the workflow with `mode = full`, first with `dry_run = true` to see the reads.

## Realtime (SPENDLY-593)

**How it works:**
- On every real change to a synced table, the database sends a **ping** to the owner's private Broadcast topic `user:<uid>`.
  - It sends one per user per write statement. Over 100 rows, it sends one `resync` ping instead of a list.
  - A ping carries the table, doc ids, the deleted flag and `synced_at`, never document data.
  - Unchanged rows send nothing: the version guard skips them.
- The app (`lib/readModelRealtime.ts`) listens on one private channel and refetches through PostgREST. After a reconnect, or every 30 seconds while the channel is down, it calls `readmodel_changes_since(p_since, p_limit)`.
  - That function returns ids and times only, tombstones included, for the caller's own uid. RLS hides tombstones from plain reads, which is why it's a function.
- Who may join a topic: `realtime.messages` policy `readmodel_user_topic_read`. Only `user:<own uid>` is allowed, through `readmodel_auth.uid()`, so duress and expired tokens get nothing.

**Switch:** `system_settings/global.readModel.realtime = true`. It's off by default, and never on in duress, when signed out, or in Spendly Test. Turn it on **after** SPENDLY-594 ships; nothing consumes the stream before that.

**Before turning it on (hosted project):**
- In the Supabase dashboard, Realtime settings: check that private channels require authorization. The spike tested the policy with Firebase-shaped tokens; the hosted check of a real RS256 Firebase token for Realtime is still open (ADR §3).
- Confirm one device's save pings another within 10 s (the 593 acceptance).

**Message volume:**
- Messages are stored for a few days in `realtime.messages`. To count them:

  ```sql
  select date_trunc('day', inserted_at) d, count(*) from realtime.messages where topic like 'user:%' group by 1 order by 1 desc;
  ```

- Billing counts each message delivered to each subscribed client. The free plan allows 2M messages a month and 200 concurrent connections.
- Expected volume: about one ping per save, per open device, plus the nightly run's changed batches.

**Turning it off:** set `readModel.realtime = false`. The copy (594) then catches up at every launch and whenever the app comes back to the foreground (601). While realtime is on but down, it polls the catch-up every 30 s.

## The on-device copy (SPENDLY-594)

**What it is:** each device keeps a copy of its user's read-model rows (`lib/readModelLocal/`): SQLite on Android and iOS (`spendly-readmodel.db`), IndexedDB on web.
- It hydrates on first start (resumable), catches up on every start (`readmodel_changes_since`), and stays fresh from realtime pings.
- Reads layer the device's unsent writes on top.
- **Offline at launch** (601): a fully hydrated copy opens with the rows it has, and catches up when the network is back. A copy that never finished hydrating can't open offline, so the screens read Firestore.

**Switch:** `system_settings/global.readModel.localCopy = true` (default off). It's never opened in duress, signed out or Spendly Test.

**Safety:**
- The store has one owner uid; opening it for another uid wipes it first.
- Sign-out and account deletion delete it.
- Money is shown exactly as PostgREST returned it (R4).

**Cap:** 50,000 rows per table. A table past it keeps its newest rows by `synced_at`, is marked partial, and older history is paged from Supabase online.

**Problems:**
- *A device's copy looks wrong:* sign out and in (it wipes and rehydrates), or set `localCopy = false` (the screens read as before).
- *A mapping change:* the changed table is dropped and rehydrated automatically on the next start.

## Per-collection read switches (SPENDLY-673)

**The switch:** `system_settings/global.readModel.<collection>` = `firestore` (default) | `shadow` | `supabase`.
- It needs `readModel.localCopy` on.
- `supabase` waits until the device's copy is hydrated.
- Duress, Spendly Test and signed out are always `firestore`.

**Wired:**
- 673: `creditCardBills`, `borrowings`, `borrowingRepayments`, `receivables`, `receivableRepayments`, `categoryBudgets`, `investments`.
- 596: `expenses`, `incomes`.
- 597: the account ledger.
- 598: portfolio, SIP, subscriptions, watchlists, the EPF passbook.
- 599: `financialSummaries`, `netWorthHistory`, `financialGoals`.
- 674: `categories`, `spaces`, `categorizationRules`, `calendarReminders`.

The rest read Firestore on purpose; each story doc says why.

**Setting it:**
```
npx tsx scripts/readmodel-set-mode.ts --collection=expenses --mode=shadow            (dry run)
npx tsx scripts/readmodel-set-mode.ts --collection=expenses --mode=shadow --apply
```

**Shadow:** watch the logs for `readModel.shadow.<collection>`. These carry counts only (missing, extra, differing, and the differing columns), at most every 10 minutes per device, and only when there's a difference. None for the whole period means the copy matches.

**Fallback:**
- `readModel.fallback.<collection>` means a device's copy failed for that collection. It went back to Firestore for the rest of the session.
- Repeated fallbacks mean: set the switch back to `firestore` and check the copy (runbook, "The on-device copy").

## Plan v2 in one page (SPENDLY-601)

For someone who wasn't there.

**What runs where:**
- **Firestore is the truth.** Every save goes there first.
- **Supabase is a copy.** The app also writes its own saves to it (`rm_client_apply`, through an on-device outbox), and the server writers push theirs. The nightly sync repairs any difference, and Firestore wins.
- **The app reads the copy** only for collections switched to `supabase`, through an on-device copy (SQLite or IndexedDB) kept fresh by realtime pings.

**The switches** (`system_settings/global.readModel`; clients can only read it):

| Switch | What it does | Command |
|---|---|---|
| `clientWrites` | The app's own writes to Supabase | `--switch=clientWrites --value=true\|false` |
| `localCopy` | The on-device copy; **off sends every collection back to Firestore** | `--switch=localCopy --value=true\|false` |
| `realtime` | Pings that keep the copy fresh | `--switch=realtime --value=true\|false` |
| `<collection>` | firestore, shadow or supabase, per collection | `--collection=<name> --mode=<mode>` |
| `<screen>` | The older per-screen history reads (511) | `--screen=<name> --mode=<mode>` |

Every command is `npx tsx scripts/readmodel-set-mode.ts … --apply`. Without `--apply` it only shows the change. Devices pick it up live; no release is needed.

**Emergency, anything looks wrong on screens:**
1. Run `--switch=localCopy --value=false --apply`. Every device reads Firestore again, and the per-collection settings stay for later.
2. Then investigate with health, the divergences and the shadow logs.

**Signals and what to do:**

| Signal | Meaning | Do |
|---|---|---|
| Health fails: unreachable or paused | Supabase is down, or the Free plan paused it | Restore the project in the dashboard. Screens already read Firestore, and outboxes hold the writes |
| `divergences` in the nightly run | App writes disagreed with Firestore (repaired already) | If it keeps happening for a table, set that collection to `firestore` and look for the writer (`readModelWriteHooks.test.ts` lists them) |
| `readModel.shadow.<collection>` | The copy differs from Firestore during the shadow period | Keep that collection out of `supabase` and find the cause before restarting its shadow period |
| `readModel.fallback.<collection>` | A device's copy failed; it fell back for that session | Repeated: set the collection to `firestore` |
| Capacity rows warn | The Free-plan limits (595) | See "The Free plan" |

**Drills:** run the harness (`run_drills.sh`, D1–D11) after any change to the sync, the mapping, the migrations or the client-write RPC. The app-side drills run in CI (`lib/readModelLocal/outageDrills.test.ts`). The readiness review is `docs/SPENDLY-601-readiness-review.md`.

## Recovery drills (SPENDLY-520)

Every procedure above has been exercised end to end on a local stack: the production scripts unchanged, the Firebase emulator, a local Postgres with the real migrations, and PostgREST (Supabase's API). The latest log is in `docs/SPENDLY-520-drill-log.md`. Re-run the drills after any change to the sync, the mapping or the migrations:

```
initdb -D <dir> -U postgres -A trust && pg_ctl -D <dir> -o "-p 55432" start      # throwaway Postgres
POSTGREST_BIN=<path to postgrest> bash supabase-readmodel/drills/run_drills.sh
```

- The harness refuses anything but its own emulator project (`demo-readmodel-drill`, port 8180; a Spendly Test emulator on 8080 is never touched), a local Postgres, and a database named `*drill*`. It drops and recreates that database.
- The convergence checker is `shared/utils/readModel/convergence.ts`.

| Drill | Procedure it proves | Pass condition |
|---|---|---|
| D1 Rebuild | Drop everything, re-apply the migrations, dry run, full sync, verify | Zero divergence; duration and reads recorded |
| D2 Sync outage | Writes continue while the sync is stopped (option C has no trigger to fail) | An incremental run catches up adds, edits and soft deletes; the nightly run catches hard deletes; then zero divergence |
| D3 Supabase outage | The API is down during a sync; the app reads during an outage (`lib/readModel/outageDrill.test.ts`) | The sync exits non-zero (the job alerts) and converges on the next run; every screen falls back with the banner, bounded, logged once |
| D4 Kill switch | Every screen to `firestore` and back with `readmodel-set-mode.ts` | One remote document; other settings untouched; no release |
| D5 Bad mapping | Deploy a broken mapper, detect it, roll back, repair | Alert on the bad run; parity and `v_data_quality` show it; rollback + full run repairs; the next run is clean |
| D6 Account purge | `delete-account`'s purge call, then a full sync while Firestore still has the account | Every row erased; nothing brought back; no false alarms |
| D8 Client-write outage (601) | The app saves while the read model is down | The outbox holds the writes and drains on recovery; each lands once; a replayed batch changes nothing |
| D9 Client-write rejection (601) | `rm_client_apply` gets a corrupt row | Refused and not stored; dropped from the outbox; the nightly run restores Firestore's version |
| D10 Dual-write divergence (601) | The app's row disagrees with Firestore | The full run replaces it with Firestore's and counts `divergences` |
| D11 One-write rollback (601) | `--switch=localCopy --value=false` | Every collection reads Firestore; other settings kept; no release |
| D7 Per-write push (SPENDLY-583) | The Netlify function's own wiring (`livePushPorts`): create, edit (with fake data in the request), hard delete, an erased account, a per-user push, a push during an outage | Each change is in the read model in about 0.2 s; request data is ignored; the erased account gets 403; the outage push fails without touching Firestore; the nightly run converges |

**In production**, only with approval and never with Firestore writes: D4 (the switch) and the D1 dry run are safe. The rest are proven locally and are the procedures for a real incident.

## The Free plan (SPENDLY-595)

**Decision (the user, 2026-11-04):** the read model runs on Supabase's Free plan, permanently. No Pro.

**Why it's safe:**
- Firestore is written first and stays the source of truth, so the read model is a **rebuildable copy**: a full sync rebuilds it.
- Every screen falls back to Firestore.
- The app's outbox keeps unsent writes until Supabase answers again.

| Free limit | How it's watched | If it's near |
|---|---|---|
| **Database 500 MB** (17 MB on 2026-11-04) | Hourly health: warns at 50%, fails at 80% (`readmodel_capacity`) | Look at the largest tables (health logs them); trim or stop syncing a heavy collection; at worst set its switch back to `firestore` |
| **Realtime messages, 2M a month** | Hourly health: the last 24 h × 30, warns at 50%, fails at 80% | Pings are one per write statement, per user. If it grows, turn `readModel.realtime` off: the copy then refreshes on launch and on focus |
| **Egress 5 GB a month** | Monthly: the Supabase dashboard (Usage) | The copy's hydrate is the big one (about 21 MB per 30K-transaction user, per device, once). Avoid forced rehydrates |
| **Realtime connections, 200 at once** | Monthly: the dashboard | One per open app; far under the limit |
| **Pause after a week of inactivity** | The nightly sync and the hourly health count as activity. Health fails with "unreachable or paused" | Restore the project in the dashboard. While it is paused, every screen reads Firestore and the outbox holds the app's writes |
| **No backups** | Not needed: **rebuild instead of restore**, `mode=full` (drill D1) | After any data loss, run the full sync. Every row comes back from Firestore |

**Monthly check (first Monday):** the dashboard's Usage page for egress, connections and database size. Compare with the health rows.

## Cost watch

- **Expected cost:** ₹0 on the current plans (SPENDLY-519 §3): Firestore Spark, Supabase Free, Netlify Free, Actions free (public repo).
- **Firestore reads:** the sync budgets are 1,500 per incremental run, 6,000 per full run and 12,000 per day. Monthly, `sync_runs.reads_used` per day plus the Firebase console's daily reads must stay well under the 50K/day Spark quota.
- **Supabase Free, permanently** (the user's decision, 2026-11-04; see "The Free plan" below).
- **Netlify credits:** `readmodel-claims` runs once per sign-in, not per read. Check the credit meter monthly; exhausting credits pauses every site.

## Decision record: keep the Firestore fallback paths

**Decision (2026-10-22, SPENDLY-520):** keep every Firestore read path as the fallback and the kill switch, permanently. Do not retire them after the flips.

**Why:**
- The read model runs on Free plans with no backups and a pause after inactivity.
- It lags writes (option C, no Blaze triggers): up to a day with the nightly-only schedule, seconds once SPENDLY-583 pushes each write.
- The fallback paths are the screens' original bounded queries, so keeping them costs nothing until they're used, and they are what made drills D3 and D4 trivial.

**Revisit if:** the project moves to Blaze with change capture (seconds-level lag) **and** a paid Supabase plan with backups, **and** 90 days pass in `supabase` mode with no fallback logged (`readModel.fallback.*`). Even then, retire one screen at a time, keeping its switch.

## Monthly check (first Monday)

- [ ] Actions → **Read-model sync** and **Read-model sync health** are enabled and green. GitHub disables schedules after 60 days without repository activity.
- [ ] `sync_runs`: Firestore `reads_used` per day is well under the 12K budget.
- [ ] `sync_failures`: nothing open older than a day.
- [ ] Supabase dashboard: the project isn't near a Free-plan limit (500 MB database, egress).

## Secrets and variables

| Name | Kind | Used by |
|---|---|---|
| `READMODEL_FIREBASE_SERVICE_ACCOUNT` | Actions secret: a service account with **Cloud Datastore Viewer** only. Optional: if unset, the workflows fall back to `FIREBASE_SERVICE_ACCOUNT` (the existing admin key; the user chose to reuse it on 2026-10-22). Adding the read-only one later needs no code change | sync, verify |
| `READMODEL_SUPABASE_SERVICE_ROLE_KEY` | Actions secret | sync, health |
| `READMODEL_SUPABASE_URL` | Actions variable | sync, health |
| `READMODEL_SYNC_ENABLED` | Actions variable, `true` to schedule | sync, health |
| `READMODEL_MAX_READS_PER_DAY` | Actions variable, optional (default 12000) | sync, health |
| `READMODEL_SUPABASE_URL`, `READMODEL_SUPABASE_SERVICE_ROLE_KEY` | **Netlify site** environment variables | `delete-account`: the `readmodel` purge phase (SPENDLY-508) |

None of these may appear in app code or as an `EXPO_PUBLIC_` variable. `scripts/readmodelSecrets.test.ts` enforces that.

## Performance and security checks (SPENDLY-519)

- **Query budget:** `PGHOST=localhost PGPORT=55432 PGUSER=postgres bash supabase-readmodel/tests/perf/run_perf.sh`. It loads a 30K-transaction user into a throwaway local database and fails if any app query's p95 reaches 300 ms or scans a user table sequentially. It also runs in CI.
- **Bundle secret scan:** `npx expo export --platform web --output-dir dist-web`, then `npx tsx scripts/scan-bundle-secrets.ts dist-web`. Run it before a release that touches env or the read model.
- **Sync health over 30 days:** paste `supabase-readmodel/reports/sync_metrics.sql` into the read-model project's SQL editor. It is read-only and selects no uids.
- **Scheduled workflows run only from `main`.** The sync and health jobs can't run, scheduled or by hand, until their workflow files are on the default branch.

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

**In production**, only with approval and never with Firestore writes: D4 (the switch) and the D1 dry run are safe. The rest are proven locally and are the procedures for a real incident.

## Cost watch

- **Expected cost:** ₹0 on the current plans (SPENDLY-519 §3): Firestore Spark, Supabase Free, Netlify Free, Actions free (public repo).
- **Firestore reads:** the sync budgets are 1,500 per incremental run, 6,000 per full run and 12,000 per day. Monthly, `sync_runs.reads_used` per day plus the Firebase console's daily reads must stay well under the 50K/day Spark quota.
- **Supabase Free:** 500 MB database (today ≈ 3 MB), 5 GB egress, pause after a week of inactivity (the sync's own runs count as activity). Upgrade to Pro ($25/month) only if usage passes half of a limit; backups are not needed for a rebuildable copy.
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

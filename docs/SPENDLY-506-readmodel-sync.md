# SPENDLY-506: Firestore → Supabase read-model sync

[SPENDLY-506](https://kesavach.atlassian.net/browse/SPENDLY-506) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-506-readmodel-sync`, cut from the epic branch after SPENDLY-571 was merged.
- Design: ADR §0, decision 6 (amended 2026-10-22).

## What it does

**When it runs:**
- **Every 3 hours (incremental):**
  - `accounts`, `accountTypes`, `accountTransfers` and `accountEntries` are copied in full. They're small, and that catches balance increments and hard deletes.
  - The other six collections (`expenses`, `incomes`, `ledgerEvents`, `accountPayments`, `creditCardBills`, `categories`) are copied only where `createdAt` or `updatedAt` is after the high-water mark, with a 10-minute overlap.
- **Nightly at 02:00 IST (full):** every collection in full. This is the only pass that may tombstone those six collections, and it catches writers that don't stamp (older app versions, scripts).

**Rules:**

| Rule | How |
|---|---|
| Firestore is only read | The Firestore reader (`firestoreReader`) only queries, and a test checks its source. The core has no I/O; the Supabase sink is the only writer |
| Read budget | Reads are counted the way Firestore bills them: per query page, its documents, at least 1. Limits: **1,500 per incremental run, 6,000 per full run, 12,000 per day** (summed from `sync_runs`), and the per-run limit is capped by what's left of the day. A stopped run is `partial` and the next run resumes where it stopped |
| Version guard | `readmodel_upsert` writes only when the Firestore document `updateTime` is newer, so replays, overlaps and late older versions are no-ops. A row seen alive again is un-tombstoned |
| Deletes | Only a complete full pass of a (uid, collection) tombstones, and rows are never removed. **Mass-tombstone guard:** it won't tombstone more than half of a user's rows in a table (when more than 20). That is reported as a failure instead |
| A stopped or failed pass | No tombstones and no high-water advance, so the next run re-covers it |
| Mapping | `shared/utils/readModel/mapping.ts`. Money is exact, dates are real calendar dates, every timestamp shape is handled. A bad value makes the row `unmapped` with the full `doc` kept, never dropped |
| Duress, privacy | `{uid}_duress` trees are never read. Logs and failures carry hashed uids |
| Freshness | `sync_status` per (uid, collection) for the "last synced" label (readable by its owner, SPENDLY-505) |

## Files

| File | Role |
|---|---|
| `supabase-readmodel/supabase/migrations/20261023000000_readmodel_sync.sql` | Adds `readmodel_upsert`, `readmodel_live_ids` (keyset-paged, because the API caps a response at 1,000 rows and a truncated list would look like deletes) and `readmodel_tombstone`. **Service role only.** Also adds `sync_checkpoints.high_water` and the `incremental`/`full` run modes |
| `shared/utils/readModel/mapping.ts` | Declarative per-table spec plus the generic mapper |
| `scripts/lib/readmodelSyncCore.ts` | The sync rules: a pure function of its ports |
| `scripts/lib/readmodelSyncMemory.ts` | In-memory sink with the SQL semantics, for tests and a dry run without Supabase |
| `scripts/readmodel-sync.ts` | CLI: the Firebase Admin reader and the supabase-js sink |
| `.github/workflows/readmodel-sync.yml` | 3-hourly plus nightly full runs. **Schedules are off until the `READMODEL_SYNC_ENABLED` variable is `true`**. Manual runs take a mode and a dry-run switch |

## Tests

| Test | Proves |
|---|---|
| `supabase-readmodel/tests/sync_functions.sql` (CI and local PG18) | Insert; a replay and an older version are no-ops; a newer version wins; money is exact (0.1 + 0.2 → 0.30); live ids; tombstone (own user only, never removes, twice is a no-op); un-tombstone; 1,500 ids page as 1,000 + 500 in order; unknown tables and injected names are refused; no client execute |
| Mutation check of the SQL | Removing the version guard, the un-tombstone, the client revoke, or the live-ids filter each fails a test |
| `shared/utils/readModel/mapping.test.ts` (25) | For all 10 tables, the spec's columns equal the migration's typed columns (catches drift). Expense mapping; derived month; restored rows; 7 unmapped shapes; numeric strings and ISO datetimes; every timestamp shape; strict booleans and integers; refuses a document with no `updateTime`; JSON-safe docs |
| `scripts/readmodelSyncCore.test.ts` (19) | Sync-core behaviours, listed below |
| `firestore/readmodelSync.emulator.rules.test.ts` (emulator) | The real Admin SDK queries. 600 categories page past 500. A full run, then app-style writes (`serverTimestamp`), then an incremental run picks up the new expense, the edit, a balance change and a deleted account, in under 40 reads, without re-reading the 600 categories. The duress tree isn't read |

**What the sync-core tests cover:**
- a first run copies everything; an unchanged run writes nothing;
- the duress tree is skipped;
- creates and edits are picked up through `createdAt` and `updatedAt`;
- the overlap window catches late writes;
- an unstamped edit waits for the full run;
- accounts are copied every run;
- account deletes tombstone on an incremental run, category deletes only on a full run;
- a soft delete stays a column;
- runs are idempotent;
- a budget stop records partial, doesn't advance, and resumes;
- the daily budget skips or caps a run;
- the mass-tombstone guard;
- unmapped rows are counted;
- an older version never wins;
- a dry run writes nothing;
- one user's failure doesn't stop the others, and no uids appear in logs;
- static checks that the Firestore reader and core never write.

**Results (2026-10-22):**
- The SQL chain (assertions, RLS behaviour, sync functions, assertions) passes on local Postgres 18.
- `npm test`: 403 files, 5,869 tests, all passing.
- `npm run test:rules`: 28 files, 550 tests, all passing.
- `typecheck:shared` passes, and full `tsc` passes. The new script files were also typechecked with a temporary config, since `scripts/` is outside the main tsconfig.

## Production dry run: 2026-10-22 (full, read-only, no Supabase)

`npx tsx scripts/readmodel-sync.ts --mode=full --dry-run` with no Supabase key, so nothing was written anywhere.

| | |
|---|---|
| Status | succeeded |
| Firestore reads | **4,024** (budget 6,000) |
| Documents mapped | 3,807: `categories` 2,093, `expenses` 1,372, `accountEntries` 145, `incomes` 46, `creditCardBills` 37, `accountTransfers` 28, `accounts` 26, `accountTypes` 22, `accountPayments` 21, `ledgerEvents` 17 |
| Unmapped | **0** |
| Failures | 0 |
| Duress trees | none read |

**Expected incremental cost** at today's size:
- about 24 reads to list users;
- the 4 small collections in full (≈ 220 documents, plus 1 read per empty collection);
- 6 × 2 range queries per user, mostly empty at 1 read each.

That comes to **≈ 550–600 reads per run**. With 8 incremental runs and one full run a day, the total is **≈ 8–9K reads per day**.

## Setup (the user, in order)

1. **Apply the migrations** to `spmsgncjbnbkxvsbpqlu`, in order: SPENDLY-505's `20261022000000_readmodel_read_policies.sql` (if not done yet), then `20261023000000_readmodel_sync.sql`.
2. **GitHub → Settings → Secrets and variables → Actions:**
   - **Secret `READMODEL_FIREBASE_SERVICE_ACCOUNT`.** Recommended: a **new** service account with only the **Cloud Datastore Viewer** role, because the sync never needs write access to Firestore. Paste its JSON key.
   - **Secret `READMODEL_SUPABASE_SERVICE_ROLE_KEY`:** the read-model project's service-role (secret) key.
   - **Variable `READMODEL_SUPABASE_URL`:** `https://spmsgncjbnbkxvsbpqlu.supabase.co`.
3. **Actions → Read-model sync → Run workflow:** `mode=full`, `dry_run=true`. Review the log. The run's reads are recorded and count toward the daily budget.
4. **First real full run (the backfill), with your approval:** `mode=full`, `dry_run=false`. Expect about 4K reads and about 3.8K rows.
5. **Set the variable `READMODEL_SYNC_ENABLED` = `true`.** The 3-hourly and nightly schedules start.
6. **Definition of Done:** 7 consecutive days of scheduled runs with no unexplained failures or budget overrun.

## Rollback

Any one of these is enough:
- Set `READMODEL_SYNC_ENABLED` to anything else, or disable the workflow. Firestore is unaffected.
- Truncate the read-model tables. The next full run rebuilds them.

## Not done / open

- Setup steps 1–5, and the 7-day DoD run.
- **The optional Cloud Monitoring check** (skip incremental runs when the app's own daily reads are already high) isn't built. The fixed 12K/day allowance is the guard for now.
- **Wired by later stories:** alerting on failures and missing runs (SPENDLY-507, `readmodel-health.yml`), purging on account deletion (SPENDLY-508), and the parity report (SPENDLY-509/510).

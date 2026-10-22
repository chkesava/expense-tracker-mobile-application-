# SPENDLY-508: erase the read model on account deletion

[SPENDLY-508](https://kesavach.atlassian.net/browse/SPENDLY-508) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-508-readmodel-purge`, cut from the epic branch after SPENDLY-507 was merged.

Copying financial data into Supabase creates a second copy, and deleting an account must erase it. Tombstones aren't enough, because they keep the data.

## Changes from the ticket (option C)

| Ticket item | Now |
|---|---|
| The trigger ignores events for purged uids | There is no trigger. **The database itself refuses them:** `readmodel_upsert` skips rows for a purged uid, and triggers drop `sync_status`, `sync_checkpoints` and `sync_failures` rows for one. So a sync run that read the account just before it was deleted can't recreate anything |
| The reconciler flags Postgres rows whose account no longer exists | **Built into the full sync run** (the nightly reconciler): an `orphan_uid` failure that turns the health check red |

## What was built

| Piece | What it does |
|---|---|
| `supabase-readmodel/supabase/migrations/20261024000000_readmodel_purge.sql` | Details below |
| `delete-account` phase `readmodel` (`netlify/functions/_readmodelPurge.ts`) | Runs **after both Firestore trees and before `auth`**. It calls the purge through PostgREST with the service-role key, from the Netlify site environment, for the **verified** uid only. On failure it throws, the client loop retries the phase, and Auth is never deleted first. The error carries no provider detail. If the read model isn't configured on the site, the phase is skipped |
| `shared/utils/deleteAccountRemote.ts`, `services/deleteAccountClient.ts`, `app/delete-account.tsx` (label) | The new phase, a `readModelRows` count, and the progress label "Deleting your reporting copy…" |
| Orphan check (`scripts/lib/readmodelSyncCore.ts`, full runs only) | Read-model uids (from `sync_status`) that Firestore no longer has become one `orphan_uid` failure each. The failure isn't repeated, and logs hash the uid. Health turns it red after 24 h; the runbook says to purge |

**The migration adds:**
- **`readmodel_purge_user(uid)`:** deletes, not tombstones, from the 10 read-model tables plus `sync_status`, `sync_checkpoints` and `sync_failures`, for the uid **and** `{uid}_duress`.
  - It is idempotent and returns `{rows, tables}`.
  - It refuses an empty or duress uid.
- **`purged_users(uid_hash, purged_at)`:** a **sha256 hash**, never the uid.
- **Resurrection guards:** the upsert filter, plus `skip_purged` triggers on the three bookkeeping tables.
- **Permissions:** every function is service-role only, and clients can't read `purged_users`.

## Exclusions

Asserted by tests:
- `_duress` trees are never read: a sync-core test watches every request.
- **Only the 10 Wave 1 collections are ever requested.** That excludes `meta`, `stats`, `notifications`, `financialSummaries` and the Nutrition collections (`daily_logs`, `weight_history`).
- Ganesh data isn't under the synced allowlist at all: `pandalMemberships`, and the top-level `pandals/`, are never read.

## Tests

| Test | Proves |
|---|---|
| `supabase-readmodel/tests/purge.sql` (CI and local PG18) | The purge removes all 23 seeded rows: 10 tables × (uid + duress twin), plus status, checkpoint and failure. Every table is then empty for the account, and another account is untouched. `purged_users` holds hashes only. A second purge returns 0. A late upsert writes only the other account's row. Late status, checkpoint and failure writes are dropped, while live accounts still work. Empty and duress uids are refused. Clients can't purge or read `purged_users` |
| Mutation check of the purge | Removing the upsert guard, the trigger, the duress twin or a bookkeeping table each fails a test |
| `netlify/functions/readmodelPurge.test.ts` (6) | Calls the RPC for the given uid with the service role; a second purge returns 0; an outage (HTTP 503, network) throws with no provider detail; unconfigured makes no call; the phase sits between `duress-tree` and `auth`; `delete-account` passes the **verified** uid |
| `shared/utils/deleteAccountRemote.test.ts` (updated) | Phase order `duress-tree → readmodel → auth` |
| `scripts/readmodelSyncCore.test.ts` (+3, 26 total) | Orphan flagged once with a hashed log; no orphan check on incremental or dry runs; only Wave 1 collections requested, never a duress tree |

Results (2026-10-22):
- The SQL chain (assertions → RLS → sync functions → purge → assertions) passes on local Postgres 18.
- `npm test` passes, as do `typecheck:shared` and full `tsc`.

## Setup (the user)

1. **Apply the migration** `20261024000000_readmodel_purge.sql` to `spmsgncjbnbkxvsbpqlu`, after 505's and 506's.
2. **Netlify site** (spendly-share) **→ Environment variables:**
   - `READMODEL_SUPABASE_URL` = `https://spmsgncjbnbkxvsbpqlu.supabase.co`
   - `READMODEL_SUPABASE_SERVICE_ROLE_KEY` = the read-model service-role key

   These are server-side only. The function deploys with the next web deploy from `main`.
3. **Do both before the first real full sync** (SPENDLY-506 setup step 4). The ticket requires the purge before any production backfill.

## Not done / open

- **The ticket's manual check** (Spendly Test with local Supabase: create data, delete the account, query every table) needs Docker or the live project. The SQL purge and the phase are tested separately. The first real deletion after setup should be checked in the SQL editor.
- **The account-deletion flow itself has still never run end to end** (SPENDLY-7, known limitation 1).

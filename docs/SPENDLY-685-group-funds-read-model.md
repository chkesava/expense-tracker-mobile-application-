# SPENDLY-685: Group Funds S3, Supabase read model (dual write and reads)

**Epic:** SPENDLY-678 (`docs/SPENDLY-678-group-funds.md`).

**Branch:** `feature/SPENDLY-685-group-funds-read-model`, cut from the epic branch.

## Saving
Nothing new on the write side. Every Group Funds write already goes through `commitMutations` (S2), which notifies the per-write server push and the client outbox (`rm_client_apply`) for each path.

Once `groupFunds` and `groupFundEvents` have a `TableSpec`, they are pushed, synced and purged automatically. The guards `lib/readModelWriteHooks.test.ts` and `netlify/functions/readmodelServerPush.test.ts` stay green.

## Mapping (`shared/utils/readModel/mapping.ts`)
- **`group_funds`:** `name`, `status`, `version`, `created_at` (from `createdAtMs`).
  - The fund's stored totals (`totals`, `byPurpose`, `heldByAccount`) stay in `doc` as an exact copy (R4.1). There is no typed money column, because SQL never filters or sums them (R2.2).
  - The held amount on screen is read from Firestore.
- **`group_fund_events`:** `fund_id`, `kind`, `amount` (money), `purpose_id`, `member_id`, `date`, `period`, `reversal_of`, `created_at`.
- **`EXTRA_CHANGE_FIELDS`:** `createdAtMs` for both collections.

## Migration
`supabase-readmodel/supabase/migrations/20261106000000_readmodel_group_funds.sql`. It only adds:
- the two tables, with the contract columns plus `written_by` and `client_written_at`;
- the index `(uid, fund_id, created_at desc, doc_id desc)` for history paging;
- RLS: deny by default, then owner-only SELECT, with tombstones hidden;
- realtime ping triggers on insert and update;
- a full restatement (from `20261103000000`) of:
  - `readmodel_sync_table_ok` and `readmodel_client_table_ok` (the `rm_client_apply` allowlist);
  - `readmodel_purge_user`;
  - `readmodel_live_counts`;
  - `v_data_quality`, with an "amount or fund missing" check on events.

## Reads
- **Fund list, `hooks/useGroupFunds.ts`:**
  - Reads through `useReadModelSource("groupFunds")`: `firestore` by default, `shadow` compares, `supabase` reads the on-device copy with no listener mounted.
  - One listener in all, with members and purposes embedded in the fund doc, and no event reads.
  - Display only: writers load the fund from Firestore (`loadGroupFund`, R4.3a).
- **History, `hooks/useGroupFundHistory.ts`:**
  - A Firestore listener on the newest 25 events, so this device's writes show at once (R4.3).
  - `loadMore` pages older events by cursor.
  - Under the screen switch `readModel.groupFundHistory = "supabase"`, older pages come from `group_fund_events` (`lib/readModel/groupFundSources.ts` and `groupFundsReadPath.ts`), falling back to Firestore for the session on any failure.
  - The screen switch is separate from the `groupFunds` collection switch, so list and history can be flipped independently.
- **Read-model backend:** `groupFundEventsPage` on both the Supabase backend and the loopback used in local test builds.
- **`shared/utils/groupFundDocs.ts`:** doc mappers (for both sources), sorting, and the page size.

## Guards and tests
- **`mapping.test.ts`:** both tables; a bad amount leaves the row unmapped, never dropped; totals stay in `doc`.
- **`providerSwitch.test.ts`** (`INTEGRATED`) and **`listenersOff.test.ts`** (`MIGRATED`): `groupFunds` added.
- **`readmodelCrossUserIndexes.test.ts`:** six collection-group overrides added to `firestore.indexes.json`.
- **`pushRefs.test.ts`, `readmodelSyncCore.test.ts`, `readmodelVerify.test.ts`:** synced collections updated; count parity is now 55 collections.
- **`lib/readModel/groupFundsReadPath.test.ts`:**
  - `firestore` and `shadow` never connect;
  - `supabase` pages with a keyset;
  - a failure falls back for the session;
  - duress and offline stay on Firestore.
- **`outageDrill.test.ts`:** the new screen falls back with the others.
- **`shared/utils/groupFundDocs.test.ts`.**
- **SQL tests** (`assert_security`, `rls_behaviour`, `purge`, `client_apply`): new tables added; owner policies 54 → 56; purge rows 110 → 114; RLS row counts updated.
  - Run locally against a throwaway Postgres 18 cluster, following `.github/workflows/readmodel-schema.yml`. All 11 steps passed: security, RLS, sync functions, purge, verify, views, golden, push, client apply, realtime, and the security re-check.
- `scripts/readmodel-identity-check.ts`: table list updated.
- `docs/READ_MODEL_RULES.md`: 55 synced tables.

## Not run
`supabase-readmodel/run_drills.sh` (the D1–D11 harness drills). It needs the drill environment.

## Deploy (production; needs approval)
1. A dry run of the migration, then applying it to the read-model project. It must land before any build that writes group funds.
2. The cross-user field overrides, deployed with the S2 index and rules. Diff against live first.

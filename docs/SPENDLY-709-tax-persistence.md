# SPENDLY-709: Tax persistence, dual write and read model

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md)).

**Branch:** `feature/SPENDLY-709-tax-persistence`, from `feature/SPENDLY-288-tax-itr-readiness`.

**Builds on:** the pure model of SPENDLY-289 (`shared/features/tax`). This story adds no UI.

## Collections (all under `users/{uid}`, all in the read model)

| Collection | Doc id | Writes | Delete | Read-model table |
|---|---|---|---|---|
| `taxProfiles` | the year, `2025-26` | create, update | allowed (reset) | `tax_profiles` |
| `taxEntries` | client id | create, update (correction, soft delete) | **never** (soft delete only) | `tax_entries` |
| `taxReviews` | `{fy}__{sourceKind}__{sourceId}` | create, update | allowed (undo = back to derived) | `tax_reviews` |
| `taxDocuments` | client id | create, update | allowed (metadata; the file goes first, SPENDLY-298) | `tax_documents` |
| `taxSnapshots` | `{fy}__{createdAtMs}` | create only | never | `tax_snapshots` |

## Saving (Firestore first, then Supabase)

- **Store:** `services/tax/taxStore.ts`. Every write goes through `commitMutations`, which notifies the per-write push and the client outbox (`rm_client_apply`) for each path. So the dual write needs nothing extra, and `lib/readModelWriteHooks.test.ts` stays green without an allowlist entry.
- **Ops:** `shared/features/tax/utils/writes.ts` turns a built document into ops.
  - **Create:** a `set` with `createdAt` and `updatedAt` server timestamps (R1.2).
  - **Correction:** an `update` of every field, with `deleteField()` for dropped fields and a fresh `updatedAt`. `createdAt` is never rewritten.
  - **Ids:** the id is only in the path.
- **Builders:** the documents come from the SPENDLY-289 builders (`buildTaxEntry`, `softDeleteTaxEntry`, `buildTaxReview`, `buildTaxProfile`). This story adds `buildTaxSnapshot` and `validateTaxSnapshot`. The store throws `TaxWriteInvalidError` on any issue, so nothing invalid is written.
- **R4.3a:**
  - A correction builds on the document as **Firestore** has it (`getDocFromCache`, then `getDoc`), never on the copy.
  - A review's `sourceAmount` and a snapshot's outputs come from the caller. Story 290 and later must verify copy-derived values on Firestore (`copyAgreesWithFirestore`) before calling, or read those inputs with `copy: false`.
- **Snapshots are append-only:** `/taxSnapshots/` is in `CREATE_ONLY_SEGMENTS` (`lib/commitMutations.ts`), so an outbox replay checks the ack instead of failing as an update.

## Firestore rules (`firestore.rules`, section "SPENDLY-709 Tax")

- **Shape:** every collection is owner-only, with `hasOnly`/`hasAll`, and kept off the catch-all list.
- **Enums:** each matches the TypeScript list.
- **Amounts:** money is 0 or more and under 1e9. "Unknown" is an explicit `null`.
- **Identifiers:** TAN, BSR, challan, CIN and ISIN are checked by pattern.
- **Stamps:** `schemaVersion == 1`; `createdAtMs` is an int and is pinned on update; `createdAt`/`updatedAt` are timestamps.
- **Entries:**
  - field lists are per kind (`TAX_ENTRY_FIELD_KEYS`);
  - a create has `revision == 1` and no `deletedAt`;
  - a correction keeps the year, kind and `createdAtMs`, and advances the revision;
  - a soft-deleted entry is frozen;
  - a hard delete is denied.
- **Reviews:**
  - the id must be `{fy}__{sourceKind}__{sourceId}`;
  - `defer`/`resolve` only on checklist items, with no amount;
  - `recategorize` needs a category; `replace` needs an entry id.
- **Profiles:** the id is the year; there is no birth date or PAN field.
- **Documents:** `storagePath` must be `users/{uid}/tax/{documentId}/{fileName}`; the type is pdf, jpeg, png or webp, at most 10 MB; the path, year and creation can't move on update.
- **Snapshots:** the id is `{fy}__{createdAtMs}`; the outputs map has at most 100 keys; update and delete are denied.
- **What rules don't check:** year boundaries (a date inside its FY). The builders check those.

## Read model

| Table | Typed columns |
|---|---|
| `tax_profiles` | `fy`, `created_at`, `updated_at` |
| `tax_entries` | `fy`, `kind`, `soft_deleted_at`, `created_at`, `updated_at` |
| `tax_reviews` | `fy`, `source_kind`, `source_id`, `decision`, `created_at`, `updated_at` |
| `tax_documents` | `fy`, `category`, `status`, `created_at`, `updated_at` |
| `tax_snapshots` | `fy`, `rule_version`, `reason`, `created_at` |

- **No money columns:** every amount stays in `doc` (R2.2). SQL never sums or computes a tax figure; the TypeScript lines do (R3.6, R4).
- **Index:** `(uid, fy)` on each table.
- **Change fields:** `EXTRA_CHANGE_FIELDS` has `createdAtMs`/`updatedAtMs` for each collection (`taxSnapshots` has `createdAtMs` only).
- **Migration:** `supabase-readmodel/supabase/migrations/20261115000000_readmodel_tax.sql` (written as 20261110; renamed to run after main's 20261112–14 on 2026-11-10). It is additive and re-runnable, and holds:
  - the five tables, with the contract columns plus `written_by` and `client_written_at`;
  - RLS: deny by default, owner-only SELECT, tombstones hidden;
  - realtime ping triggers;
  - restated in full from `20261106000000`, with the tax tables added: `readmodel_sync_table_ok`, `readmodel_client_table_ok` (the `rm_client_apply` allowlist), `readmodel_purge_user`, `readmodel_live_counts`, `v_data_quality` ("missing year").
- **Restated over SPENDLY-222 (2026-11-07):** 222 reached main with `20261107000000` (devices) and `20261108000000` (notifications). The first version of this migration restated the shared functions from `20261106000000`, and so would have **dropped** `devices` and `notifications` from both allowlists, the purge, the counts and the data-quality view. Main was merged into the epic, and the restatement is now built from `20261108000000` with the tax tables added. The SQL test counts became:
  - owner policies 58 → 63;
  - visible rows 114 → 124;
  - user B rows 57 → 62;
  - purged rows 118 → 128;
  - verify recorded pairs 114 → 124.
- **Guard (new):** `shared/utils/readModel/mapping.test.ts`, "the latest migration restates every synced table". The *last* restatement of `readmodel_sync_table_ok`, `readmodel_client_table_ok` (all but server-only tables), `readmodel_purge_user`, `readmodel_live_counts` and `v_data_quality` must name every table in `READ_MODEL_TABLES`. Against the old migration, all four checks fail; against the fix, they pass.

## Reading

`hooks/useTaxData.ts` has `useTaxEntries`, `useTaxReviews`, `useTaxProfile`, `useTaxDocuments` and `useTaxSnapshots`. Each one:
- takes `fy` and `{ enabled }`, and mounts only where its section is on screen (SPENDLY-406);
- reads through `useReadModelSource("<collection>")`:
  - `firestore` (default): one listener with `where("fy", "==", fy)`, bounded to the year;
  - `shadow`: compares, windowed (the copy holds other years);
  - `supabase`: reads the on-device copy, filtered to the year, with **no Firestore listener**;
- uses `useLoadFailure` and `snapshotErrorHandler`, with errors through `lib/errors.ts`;
- maps documents with `shared/features/tax/utils/docs.ts`, which drops documents of another year or an unknown shape and strips the Firestore timestamps.

The effects are written per hook on purpose, so the guards can see each listener next to its collection name.

## Account deletion

- **Firestore:** `delete-account` removes the whole `users/{uid}` tree, so no change is needed.
- **Read model:** `readmodel_purge_user` now covers the five tables.
- **Stored files:** document files in `spendly-files` are SPENDLY-711, which blocks 298.

## Guards and tests

| Check | Result |
|---|---|
| `shared/features/tax/utils/taxRules.contract.test.ts` (new) | Enums, per-kind field lists and every written key match `firestore.rules`; limits; tax kept off the catch-all |
| `shared/features/tax/utils/writes.test.ts` (new) | Ops, `deleteField`, no `createdAt` rewrite, id change refused, snapshots create-only, mappers |
| `firestore/tax.rules.test.ts` (new, emulator) | 12 tests: the app's own writes pass; forged ones, another user, a hard delete and changes to frozen fields fail |
| `npm run test:rules` | Full rules suite: see the Jira comment for the run |
| `shared/utils/readModel/mapping.test.ts` | Tax mappings; amounts stay in `doc`; change fields |
| `lib/readModelLocal/providerSwitch.test.ts` | `INTEGRATED` + the five tax collections; `SWITCHED_COLLECTIONS` matches |
| `lib/readModelLocal/listenersOff.test.ts` | `MIGRATED` + five; the scan now asserts it finds the five tax listeners |
| `lib/readModelWriteHooks.test.ts`, `netlify/functions/readmodelServerPush.test.ts` | Green; no change needed (`commitMutations`) |
| `scripts/readmodelCrossUserIndexes.test.ts` | 19 field overrides added to `firestore.indexes.json` (147 of 200) |
| `scripts/readmodelSyncCore.test.ts`, `pushRefs.test.ts`, `readmodelVerify.test.ts` (60 collections), `scripts/readmodel-identity-check.ts` | Lists updated |
| SQL suite (`readmodel-schema.yml` steps, local Postgres 18) | All 13 steps pass, plus a second run of the tax migration and a security re-check after it. The perf budget wasn't run (no new SQL query). |

**Not run:** `supabase-readmodel/drills/run_drills.sh`, which needs the drill environment.

## Production (each step needs the user's approval)

1. **Firestore rules and indexes:** diff against live first. The rules must be deployed before any build that writes tax data.
2. **Supabase migration `20261115000000`:** dry run, then apply, before any build that writes tax data. Coordinate with 222's migrations (see above).

No production step has been run.

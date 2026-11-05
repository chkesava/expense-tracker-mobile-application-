# SPENDLY-681: the changed-only sync sees every collection's changes

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-681-safety-net-change-fields` |
| Migration | none (Supabase); **+24 Firestore index overrides** |
| Option | **A**, the user's choice (2026-11-05): change detection per collection |

## The blind spot

In `safety-net` mode (672), nights are changed-only, with a full pass on Sunday. Changes were found only by the Firestore Timestamps `createdAt`/`updatedAt`.

Sixteen synced collections stamp a millisecond number or an event time instead. Some stamp one as well, but nothing requires it. If the app's dual write missed one of their changes and no push happened, the safety net found it only on Sunday.

## Built

**`mapping.ts`:**
- `ChangeField` (`timestamp` | `millis`), `DEFAULT_CHANGE_FIELDS` (`createdAt` and `updatedAt`, kept for every collection), `EXTRA_CHANGE_FIELDS` and `changeFieldsOf(spec)`.
- The extra fields:

| Collections | Extra change fields |
|---|---|
| `financialGoals`, `goalFundingPlans`, `decisions`, `calendarReminders`, `feeReviews`, `merchantOverrides`, `whatIfScenarios`, `netWorthHistory` | `createdAtMs`, `updatedAtMs` (millis) |
| `goalEvents`, `epfWageHistory` | `createdAtMs` |
| `runwaySettings`, `runwayOverrides` | `updatedAtMs` |
| `feeSignalDismissals` | `atMs` |
| `epfContributionEvents`, `epfTransferEvents` | `at` (Timestamp) |
| `recurringDismissals` | `dismissedAt` (Timestamp) |

The lists may over-cover on purpose. A field a collection doesn't carry costs one read per night: a query's minimum, about 24 reads a night in total.

**The sync** (`readmodelSyncCore.ts`, `readmodel-sync.ts`):
- the cross-user pass and the per-user incremental pass query every change field of a collection;
- `changeValue` compares a `millis` field as a number and the rest as a `Timestamp`.

**Indexes:** 24 collection-group single-field overrides in `firestore.indexes.json`, each restating the defaults as 672's do. That makes 122 of Firestore's 200.

## Checked in production (read-only)

A key-only query on the read model's copied documents (counts, no values) showed data only in `financial_goals` and `goal_events`. Those carry `createdAt`/`updatedAt` plus `createdAtMs`. The other 14 tables have no rows yet, so the fields come from their writers' code.

## Tests

**`readmodelSyncCore.test.ts`:**
- a reminder stamped only with `updatedAtMs`, or a new one with only `createdAtMs`, is found by a cross-user night, and the queries are exactly `createdAt`, `updatedAt`, `createdAtMs:millis`, `updatedAtMs:millis`;
- the per-user incremental pass finds a `createdAtMs`-only goal event;
- `changeValue` returns a number for millis and a Timestamp otherwise;
- the query-count and read bounds now scale with the change fields.

**Mutation check:** with `changeFieldsOf` returning only the defaults, both behaviour tests fail.

**`mapping.test.ts`:**
- every stamp a collection maps (`createdAtMs`, `updatedAtMs`, `atMs`, `at`, `dismissedAt`) is one of its change fields;
- the extra fields name synced collections, with `*Ms` as millis;
- every collection keeps `createdAt`/`updatedAt`.

**`readmodelCrossUserIndexes.test.ts`:** an override exists for every change field of every queried collection.

## Results

- `npx vitest run`: 541 files, 7,710 tests pass.
- tsc passes for the app, the scripts and shared code.

## After the epic reaches main

Deploy the indexes before `READMODEL_NIGHTLY_MODE=safety-net` (checklist §4 step 1). The 24 new overrides go with 672's 96 in the same deploy. The index diff must show only these as new.

# SPENDLY-672 — the nightly sync becomes the safety net

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2), N4 |
| Branch | `feature/SPENDLY-672-sync-safety-net` |
| Migration | none |
| Firestore index change | `firestore.indexes.json`: 96 new collection-group field overrides (deploy needs approval) |

## Why

Today the nightly run is a **full** pass: 4,140 reads on 2026-11-04, from 24 users and 13 collections. With the epic's 53 synced collections, a full pass would be about 5,300 reads. Once the app writes Supabase directly (670/671), the nightly run doesn't need to copy everything. It only has to catch what the push and the app missed, and repair disagreements.

## Design (the user chose collection-group queries, 2026-11-04)

| Nightly approach (24 users, 53 collections) | Reads a night |
|---|---|
| Full pass | ~5,300 |
| Changed-only, per (user, collection): two queries each, every empty query billed as one read | ~2,800 |
| **Changed-only, one collection-group query per collection and field** | **~450** |

### What changed

- **`READMODEL_NIGHTLY_MODE`** (`scripts/lib/readmodelNightlyMode.ts`) picks the mode for the scheduled run (`--mode=nightly`).
  - Unset or `full`: today's nightly full pass. **This is the default**, so merging changes nothing.
  - `safety-net`: changed-only nights, plus a full pass on Sunday (IST).
  - The sync writes `mode` to the step output, so count parity and parity findings run after full passes only.
- **The cross-user pass** (`runSync` with `crossUser`, in `scripts/lib/readmodelSyncCore.ts`):
  - one collection-group query per collection and field (`createdAt`, `updatedAt`), paged;
  - documents grouped by uid, mapped, divergence-checked and upserted;
  - duress trees, erased accounts and unknown users are never copied;
  - one global checkpoint per collection (uid `*`);
  - every user's `sync_status` is stamped, so copy age stays honest;
  - the first time, a collection starts from the oldest per-user checkpoint. A collection some user was never copied for runs per user that night.
  - The always-full account collections and `users/{uid}` still run per user.
- **The reader** (`firestoreReader.readChangedAcrossUsers`): only paths that are exactly this spec's `users/{uid}/{collection}/{id}`, or the nested form, are kept (`scripts/lib/readmodelPaths.ts`). Same-named collections elsewhere are dropped: Ganesh pandals' `expenses`, Nutrition. Their reads are still counted.
- **Divergences:**
  - *What it is:* before every upsert, on any pass, a client-written row that differs from Firestore's mapping in a typed column.
  - *How it's recorded:* counted per table in `sync_runs.notes.divergences`, with `clientRowsReplaced` beside it.
  - *Repair:* Firestore's version replaces the row, through the server upsert (669: server writes always replace client rows).
  - *Test fidelity:* the in-memory sink now mirrors that rule.
- **Health** (`scripts/lib/readmodelHealth.ts`, `readmodel-health.yml`):
  - divergences in 24 hours by table, with a warning above `READMODEL_DIVERGENCE_WARN` (default 0);
  - app direct writes in 24 hours (head-only counts of `written_by = 'client'`) beside the day's pushed docs;
  - in `safety-net` mode the full-pass gap allows 7 days plus 2 hours.
- **Indexes:**
  - 96 field overrides: 48 collection groups × `createdAt`/`updatedAt`.
  - Each restates Firestore's automatic indexes (ascending, descending, array-contains), because an override replaces them and the app orders these fields both ways. Each also adds the ascending collection-group index.
  - The existing two overrides are kept: 98 in total, under the limit of 200.
  - `scripts/readmodelCrossUserIndexes.test.ts` keeps them in step with the synced collections.
- **Rules and runbook:** READ_MODEL_RULES R1.2b and R1.3; `docs/READMODEL_RUNBOOK.md` "The nightly schedule and divergences" (switch-over order, what a divergence means, when to run a manual full pass).

## Tests

- **Sync core:**
  - a disagreeing client row is a divergence and is repaired; an agreeing one isn't;
  - cross-user: one query pair per collection, not per user;
  - duress is never copied, and the global checkpoint is set;
  - divergences are counted in cross-user passes too;
  - a never-copied pair falls back to per user;
  - the "core never writes Firestore" guard still holds.
- **Nightly mode:** the default is full; safety-net runs full on Sunday IST and changed-only on other days.
- **Paths:** pandal and Nutrition same-named collections are refused; nested composite ids work.
- **Health:** divergence warning and threshold, weekly-full gap, summary rows, loader.
- **Indexes:** every cross-user collection and field has the defaults plus the collection-group index.
- **Emulator (`npm run test:rules`):** real collection-group queries copy `users/alice/expenses/x1`, but never `pandals/p1/expenses/px` or the duress tree; the reads stay per collection.

## Results

- `npm test`: 529 files, 7,531 tests. `npm run test:rules`: 31 files, 622 tests.
- `tsc` passes, and the changed scripts typecheck on their own.

## Acceptance and what's left (needs the user)

- **Reads under 1K a night for 7 days.** Needs, in order:
  1. the epic on main;
  2. a release, and `readModel.clientWrites` on;
  3. the **index deploy** (diff against live first, then approval). Deploy at or before the epic merge: the daily drift job is red while repo and live differ;
  4. `READMODEL_NIGHTLY_MODE=safety-net`.
- **Divergences reported and 0 for 7 days:** after the same steps.
- **Drills D1–D5 still pass:** run them at the 601 readiness review or when switching.

# SPENDLY-507: sync failure recovery and monitoring

[SPENDLY-507](https://kesavach.atlassian.net/browse/SPENDLY-507) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-507-sync-monitoring`, cut from the epic branch after SPENDLY-506 was merged.
- Runbook: `docs/READMODEL_RUNBOOK.md`.

## Re-scope for option C

The ticket was written for a Firestore trigger. The sync is now the scheduled job from SPENDLY-506 (ADR §0), so the plan changed as follows. This was recorded on the ticket on 2026-10-22.

| Ticket item | Now |
|---|---|
| Firestore fallback failure doc when Postgres is down, plus a rules test | **Not applicable.** The job never writes Firestore. If Supabase is down, the run fails (red), no high-water mark advances, and the next run re-covers the window. Nothing is lost |
| Netlify `readmodel-replay` function (secret-authenticated) | **Not needed.** Every run re-reads the current Firestore document, and the upsert is version-guarded, so a "replay" is just the next run, or a manual full run. Failures resolve themselves (below). This also avoids Netlify Free credits |
| Mapping failure → `sync_failures` row; the next health run fails, naming the collection | **Built** |
| `readmodel-health.yml` hourly, failing with a step summary | **Built**, plus missing-run detection |
| 60-day cron-disable note, monthly reminder | **Built**, in the runbook |

## What was built

**Failures are recorded and resolved by the sync itself** (`scripts/lib/readmodelSyncCore.ts`):

| Failure class | Recorded when | Resolved when |
|---|---|---|
| `mapping` (per document) | A document has a value its typed column can't hold. The message names the field and type (for example `amount: not a valid money`), **never the value**. Recorded once while it stays open | A later pass maps that document |
| `pair_failed` (doc `*`) | Reading or writing one user's collection throws | That (uid, collection) next completes |
| `mass_tombstone_guard` (doc `*`) | A full pass would tombstone more than half of a user's rows in a table | A later full pass completes without tripping the guard |

The mapper (`mapDocumentWithReason`) now reports the failing field. Open failures are loaded once per run, and dry runs record and resolve nothing.

**Health** (`scripts/lib/readmodelHealth.ts`, `scripts/readmodel-health.ts`, `.github/workflows/readmodel-health.yml`, hourly at :45):

| Check | Threshold |
|---|---|
| Supabase reachable, not paused | Any query error means unreachable |
| A sync run happened recently (dry runs don't count) | ≤ 4 h (3-hourly plus slack) |
| A full run happened recently | ≤ 26 h |
| The latest run didn't fail | — |
| No failure open too long | ≤ 24 h. Named by collection and class, with a user count, never a uid |
| p95 copy age (from `sync_status`) | ≤ 4 h (ADR §8: 3 h plus slack). Names the collections that are behind |
| **Warnings:** budget-skipped runs; Firestore reads above 90 % of the daily budget; failures younger than 24 h | — |

- **Output:** a step summary with runs, reads and copy age (p50/p95/max) for 24 h, plus the last 10 runs.
- **Exit 1 when unhealthy:** the workflow goes red, and GitHub emails the owner.
- **Reads only Supabase:** no Firestore reads at all.
- **Like the sync,** its schedule waits for `READMODEL_SYNC_ENABLED`.

## Tests

| Test | Proves |
|---|---|
| `scripts/readmodelSyncCore.test.ts` (+4, 23 total) | A mapping failure is recorded once, names the field and not the value, and resolves when fixed. A pair failure resolves on the next clean pass, and the failed pair didn't advance. A guard failure stays open while the guard fires and resolves after a clean pass. Dry runs record nothing |
| `scripts/readmodelHealth.test.ts` (13) | Green on a clean schedule, with metrics. Red on: unreachable or paused, no run in more than 4 h (dry runs don't count), no full run in more than 26 h, the latest run failed, a failure older than 24 h (named by collection, **no uid anywhere in the report or summary**), p95 copy age over 4 h. Warnings for a fresh failure and for the budget. Summary rendering. The loader turns a paused project into "unreachable", not a crash |
| Mapper and sync suites | Unchanged behaviour, still passing |

Results (2026-10-22):
- `npm test` passes.
- `typecheck:shared` passes, and full `tsc` passes.
- The sync and health scripts were typechecked with a temporary config, since `scripts/` is outside the main tsconfig.

**Definition of Done: "workflow green on a clean run and red on an injected failure".** The threshold logic is proven both ways by the tests above. The live workflow needs the Supabase secrets from the SPENDLY-506 setup. After that, run **Read-model sync health** by hand once green; then, as the injected failure, temporarily set `READMODEL_SUPABASE_URL` to a wrong value and confirm it goes red.

## Not done / open

- The live green and red workflow runs (after the 506 setup).
- **Account deletion:** a deleted account's `sync_status` rows stop updating and would eventually push the p95 copy age up. SPENDLY-508 purges them on deletion.

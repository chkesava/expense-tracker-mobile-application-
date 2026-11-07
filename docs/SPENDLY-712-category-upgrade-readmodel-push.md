# SPENDLY-712 — Category taxonomy upgrade never reaches Supabase

Bug, standalone (no epic). Branch `fix/SPENDLY-712-category-upgrade-readmodel-push` from `main`.

## The report (2026-11-06, production)
- Opening v5.2.0 ran `ensureCategoryHierarchy`, which upgraded one user's categories: 231 created and 186 updated (417 documents). They were legitimate new defaults, not duplicates.
- As a bulk writer it didn't name its writes. It called `notifyReadModelChanged(uid)`, which asks the push for a **per-user sync** (`{ mode: "user" }`).
- That sync started at 05:17:40 UTC and never finished: `sync_runs` still showed it `incremental` / `running`.
- Verify at 10:15: `categories` Firestore 1,665 vs Supabase 1,434 for that user. The 2026-11-07 nightly stopped at the daily read cap; a manual full sync copied them.

## Root cause
1. **The writer didn't name its documents.** `ensureCategoryHierarchy` was on the dual-write guard's allowlist ("bulk migration: push user sync"), so only a per-user sync could copy its writes.
2. **The pusher turned any write of more than 50 documents into a per-user sync** (`MAX_PUSH_REFS`), so naming them wouldn't have helped on its own.
3. **The per-user sync can't finish inside a Netlify function.** A synchronous function is killed at 10 seconds. The sync makes one or two queries plus several Supabase calls for each of the 57 synced collections, so it was killed partway. `runSync` never reached `finishRun`, so the run stayed `running` forever, with no resume point.
4. **Push runs and nightly runs shared one resume point.** `lastRunNotes("incremental")` returned the newest partial incremental run, whatever started it. A partial push run (one user) could set where the nightly resumed, and the reverse.

## The fix
| Part | Where | What |
|---|---|---|
| Name the writes | `lib/ensureCategoryHierarchy.ts` | Its batch writer uses `trackedBatch` and collects each committed batch's paths (and `users/{uid}` when `defaultCategory` is remapped). `stampVersion` calls `noteDirectWrites(uid, paths)` once, after every batch is committed: the client outbox (`rm_client_apply`) and the server push get exactly the documents written. No writes means no announcement. |
| Push in chunks | `lib/readModelPush.ts` | The pusher sends at most `MAX_PUSH_REFS` (50) refs per request and keeps sending until every ref is sent (417 refs = 9 requests, about 2 s apart). Only a backlog over `MAX_PENDING_PUSH_REFS` (1,000) becomes one per-user sync. |
| Rate limit | `lib/readModelPush.ts` | A 429 keeps that request's refs and holds every push for `PUSH_RATE_LIMIT_WAIT_MS` (10 min, the server's window), then sends the rest. Other failures are logged once and dropped, as before. |
| Time limit | `scripts/lib/readmodelSyncCore.ts`, `netlify/functions/readmodel-push.ts` | `runSync` takes `timeLimitMs`. It is checked before every page, like the read budget. When time runs out the run stops as `partial` with `resumeFrom` and `notes.stoppedBy: "time limit"`, and is recorded. The per-user push sync uses 6 s (`USER_SYNC_TIME_LIMIT_MS`). |
| Separate resume points | `SinkPort.lastRunNotes(mode, trigger)` | Push runs resume only from push runs (`notes->>trigger = 'push'`), and scheduled runs only from untriggered ones (`notes->>trigger is null`). |
| Stuck runs | `SinkPort.closeAbandonedRuns` | Before it starts, every non-dry run marks runs still `running` that started over `ABANDONED_RUN_MS` (2 h) ago as `failed`, adding `notes.abandoned` to the notes it already has. A run now stores its `trigger` when it starts (`startRun(mode, budget, trigger)`), so a push run that never finishes stays a push run for the health check. The nightly job's timeout is 30 min, so a real run is never closed. A failure to close them never stops the run. This also closes the 2026-11-06 stuck run the first time a sync runs with this code. That run started before this change, so it has no trigger; it is older than the nightlies since, so it never becomes the health check's "latest run". |
| Guard | `lib/readModelWriteHooks.test.ts` | `lib/ensureCategoryHierarchy.ts` is off both allowlists (synced collections and `users/{uid}`) and is now on the scan's list of known direct writers. |

### Acceptance
- After an upgrade that changes the taxonomy, the changed categories reach Supabase through the client outbox within seconds. The server push confirms them within about 20 s, or after the rate-limit window for anything over the push limit (default 120 documents per 10 min). No nightly is needed.
- No sync run is left `running`. The per-user sync stops itself before Netlify's limit, and a run killed anyway is closed by the next run.

## Not changed
- Firestore stays the source; Supabase is written only through `rm_client_apply` (client) and the push function (server).
- No schema change, migration, rules or index change. `sync_runs` already allows `failed`.
- The push function's rate limit (`READMODEL_PUSH_LIMIT`, default 120 per 10 min) and the per-user read budget (200) are unchanged.

## Tests
- `lib/ensureCategoryHierarchy.test.ts`: a taxonomy upgrade (a missing default, a renamed default, a retired default) and a first-time seed. In both, every path the committed batches wrote is in the outbox and the push exactly once, after the commits. A stamp-only run and the early exit announce nothing.
- `lib/readModelPush.test.ts`: 417 refs go in 9 requests of at most 50, all of them sent. Over 1,000 pending becomes one per-user sync. A 429 holds the unsent refs and sends them after the window.
- `scripts/readmodelSyncCore.test.ts`: the time limit stops as partial with a resume point and a recorded run, and the next push run finishes. Push and scheduled resume points are separate. Abandoned runs are closed before the run (not in dry runs), and a failure to close them doesn't stop the run. The Supabase sink's `lastRunNotes` / `closeAbandonedRuns` queries are covered too.
- `netlify/functions/readmodelPushUserSync.test.ts`: the per-user push sync is an incremental `push` run with the 6 s time limit.

## Deploy
- The client parts ship with the next Expense release and web deploy.
- The server parts (time limit, abandoned-run cleanup, resume points) ship with the next web deploy (Netlify function) and the next nightly sync run from `main` (GitHub Actions).
- `categories` stays in shadow until this is released and an upgrade has been seen to arrive.

# SPENDLY-680: server-side writers copy what they wrote to the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-680-server-writers-push` |
| Migration | none |

## The gap (dual-write audit, 2026-11-05)

The app's saves reach Supabase within seconds, through the client outbox (670) and the per-write push (583). Server-side writers wrote Firestore only, so a screen reading the copy saw their changes only after the nightly sync:
- the EPF monthly cron;
- the admin repair scripts;
- the legacy site's crons.

The EPF cron's audit events (`at` only) would have waited for the weekly full pass in `safety-net` mode.

## Built

**`copyDocsToReadModel(uid, refs, ports)`** (`_readmodelPushCore.ts`): the push's copy step, pulled out of the HTTP handler unchanged:
- it reads the documents from Firestore;
- it maps them exactly as the sync does;
- it upserts version-guarded rows and tombstones a document that's gone.

The handler now calls it.

**`_readmodelServerPush.ts`:**
- `createServerPush(ports)`: `note(uid, paths)` after each commit, `flush()` at the end.
- It is best effort: it never throws, and whatever it misses the nightly sync copies.
- It skips duress trees, erased accounts, paths that aren't synced, and another user's paths.
- It sends at most 50 refs per call.
- `trackServerBatch(db.batch())`: the admin-SDK version of the app's `trackedBatch`. It records every path that `set`, `update`, `create` or `delete` writes.
- `serverPushPorts(db)` (`readmodel-push.ts`): the push's live wiring, with no caller token. It returns null when the site has no read-model settings or `READMODEL_PUSH_ENABLED=false`. In that case nothing is copied and the run says so.

**Wired:**
- **`epf-cron.ts`:** the repair, release and generation batches (contributions and their events) are tracked and noted after each commit, and flushed once per page. The response adds `readModelPushed` and `readModelPushFailed`.
- **`scripts/lib/rebuildRunner.ts`** (`rebuild-domain-summaries.ts`, `rebuild-financial-summaries.ts`): `ChunkedBatch` records its paths. An `--apply` run copies them and logs the count.
- **`scripts/rebaseline-account.ts`:** copies the rebased account after `--apply`.

**Guard** (`netlify/functions/readmodelServerPush.test.ts`):
- Every Netlify function or script that writes a `users/${uid}/<synced collection>` path must push, or be listed with its reason: the drill, the sync, the push, and `delete-account` (which purges).
- **Mutation check:** without the EPF cron change, the guard names `epf-cron.ts`.

## Not in this repo: the legacy site's crons (decision needed)

The old `kesavaexpensetracker` site still runs the daily SIP and credit-card bill crons (SPENDLY-522; duplicate bills in SPENDLY-676). They write `sipTransactions`, `sipPlans`, `virtualPositions` and `creditCardBills` with no push. Their changes reach Supabase only nightly, and in `safety-net` mode only if they stamp `createdAt`/`updatedAt`.

**Options:**
1. **Retire them (recommended).** The app already runs SIP execution and the bill pass itself (`services/sip/executeSips.ts`, the bill pass in `CreditCardBillsProvider`), and SPENDLY-676 shows they double-write bills.
2. **Have them push.** This needs their code updated on that site.

## Tests and results

- `readmodelServerPush.test.ts` (7 tests):
  - copies once, and tombstones a missing document;
  - skips duress, another user, unsynced collections and erased accounts;
  - chunks by 50;
  - a failure is counted and logged, never thrown, and the next account still goes;
  - unconfigured: nothing is copied and it says so;
  - the tracked batch records paths and passes calls through;
  - the guard.
- The existing push tests (14) and `rebuildRunner.test.ts` (9) pass unchanged.
- `npx vitest run`: 541 files, 7,680 tests pass.
- tsc passes for the app, the scripts and shared code.
- `npm run test:rules` passes.

## After the epic reaches main

- **Web deploy:** the EPF cron and the push are Netlify functions. The site already has `READMODEL_SUPABASE_URL` and `READMODEL_SUPABASE_SERVICE_ROLE_KEY` (583).
- **Check:** the next `epf-cron` run's summary shows `readModelPushed > 0` when it writes.

# SPENDLY-670 — the on-device outbox: the app writes its saves to Supabase

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2, ADR v2 §2) |
| Branch | `feature/SPENDLY-670-client-outbox` |
| Depends on | SPENDLY-669 (`rm_client_apply`, applied to production 2026-11-03) |

## How it works

1. **`commitMutations`** already names every path it wrote, for the SPENDLY-583 push. It now hands the same paths to `notifyClientWrites` (`lib/readModelClientWrites.ts`).
2. **For each synced path** (`pushRefFromPath`: synced collections, the caller's uid), the outbox reads the document from **Firestore's local cache** with `getDocFromCache`, using `serverTimestamps: 'estimate'`. That is the exact saved version, with no billed read.
   - A deleted document becomes a delete.
   - A document missing from the cache is skipped; the push copies it.
3. **It maps the document with the shared mapper** (`buildClientEntry` → `mapDocumentWithReason`, the code the server uses) and stamps `client_written_at`.
4. **The queue** (`shared/utils/readModel/clientOutbox.ts`, pure):
   - one entry per document, the newest save winning;
   - at most 2,000 entries, after which the oldest are dropped and counted;
   - kept in AsyncStorage per uid (`spendly.rmClientOutbox.v1.<uid>`), so it survives an app kill.
5. **Sending:**
   - batches of up to 50 rows and 50 deletes, from the table holding the oldest entry, go to `rm_client_apply`;
   - **refused** (SQLSTATE class 22/23/42): the batch is dropped, so one bad row can't jam the queue;
   - **failed** (network, server, not connected): it stays, with backoff from 2 s, doubling, capped at 5 min;
   - **back online**: it sends at once (`kick`);
   - a resend is a no-op (the RPC's version guard).
6. **Sign-out** removes the previous user's queue from the device. **Sign-in** resumes a saved queue.

## When it runs

**Only when `system_settings/global.readModel.clientWrites === true`.** It is a server-only setting, so turning it off is the kill switch, with no release.

Also required:
- the read model is configured in the build (or it's Spendly Test, where batches go to a **no-op loopback**);
- not duress;
- signed in.

**Unchanged:** the SPENDLY-583/662 server push still runs after every save, and the nightly repair has Firestore win. So the outbox makes Supabase current sooner; correctness doesn't depend on it.

## Tests

- `shared/utils/readModel/clientOutbox.test.ts` (14): mapping, delete and not-synced, coalescing, other uid, the cap, batch selection and cap, settling with a newer save in flight, retry/refuse, refusal classification, backoff, restore and stats.
- `lib/readModelClientWrites.test.ts` (10):
  - the cache → queue → persisted → sent-once path;
  - delete and not-cached;
  - off by setting, signed out, other uid;
  - **airplane mode → backoff → lands once, in order**;
  - **a Supabase outage → retry**, then a refused batch dropped;
  - **an app kill → the next process resumes the saved queue**;
  - only the newest version sent;
  - sign-out forget;
  - `kick`;
  - the module hook.
- `lib/commitMutations.test.ts`: every written path reaches the hook. `readModelReadPath.test.ts`: the `clientWritesEnabled` setting.
- `npm test` (523 files), `npm run typecheck:shared` and `tsc`: pass.

**Not run yet:**
- an end-to-end send from a phone to Supabase. It needs a release, then turning the setting on.
- device checks: the native `serverTimestamps: 'estimate'` option is typed in RNFB 24; to confirm on device.

## Rollout

1. Merge into the epic. This ships in an Expense release. **Nothing changes until the setting is turned on.**
2. Turn on `system_settings/global.readModel.clientWrites = true` (Firebase console; **user**).
3. Check:
   - **web app, DevTools → Network:** a `rm_client_apply` request returns 200 within about 2 s of a save. The row is `written_by = 'client'` only until the push replaces it, usually in about 20 s, so a count of client rows is no proof (SPENDLY-689 adds a database counter);
   - `spendlyClientOutbox.stats()` in a dev build;
   - `push_daily` keeps counting.
4. Direct writers outside `commitMutations` (bills, receivables, theme, categories…) come in SPENDLY-671.

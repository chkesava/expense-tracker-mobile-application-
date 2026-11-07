# SPENDLY-224: Register each signed-in device for push

**Ticket:** [SPENDLY-224](https://kesavach.atlassian.net/browse/SPENDLY-224) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md).
**Branch:** `feature/SPENDLY-224-device-registration`, cut from the epic branch after the 223 merge.

## What it does

Each signed-in Spendly install keeps one document, `users/{uid}/devices/{installId}`:

```
{ token, tokenType: "expo", platform, product: "expense", appVersion, locale, createdAt, updatedAt, lastSeenAt }
```

The server sender (SPENDLY-227) reads these documents to reach every device a user is signed in on.

| When | What happens |
|---|---|
| Sign-in, every return to the foreground, push token rotated | `registerPushDevice`: fetch the Expo token. Write only if the token, app version or locale changed, or nothing was written today. So the write happens at most once a day per install. |
| First registration for this user on this install (or the local record was lost) | Full document with `createdAt`. |
| Sign-out (`logout()`) | `unregisterPushDevice` deletes this install's document while still signed in, then clears the local record. |
| Another user signs in on the same install | That user gets their own document. The previous user's was deleted at their sign-out. |
| Account deletion | `delete-account` removes every `users/{uid}` subcollection, including `devices`, and the read-model purge clears the `devices` table. |

**Skipped cleanly, with no errors and no writes:** signed out, web, Ganesh and Nutrition builds, the local test build (no FCM), Expo Go, the privacy decoy (duress) session, and permission not granted.

**Never prompts.** Registration only runs once notification permission is granted. SPENDLY-225 owns the prompt. A user who grants permission later (e.g. in the bill reminder settings) is registered on the next foreground.

**Never blocks.** Every failure is a `logWarning`. A failed refresh clears the local record, so the next launch writes the full document again.

## Read model (user decision 2026-11-06: dual-write `devices`)

- **Mapping:** a `TableSpec` for `devices` in `shared/utils/readModel/mapping.ts`. Typed columns: platform, product, token_type, app_version, locale and the three timestamps. **The token stays in `doc` only.**
- **Migration** `supabase-readmodel/supabase/migrations/20261107000000_readmodel_devices.sql`:
  - the table, with the R2 contract;
  - RLS with owner-only SELECT;
  - `devices` added to `readmodel_sync_table_ok`, `readmodel_client_table_ok` (the `rm_client_apply` allowlist), `readmodel_purge_user`, `readmodel_live_counts` and `v_data_quality`. These are restated in full from 20261103000000.
- **Writes:** `lib/pushRegistration` calls `noteDirectWrites(uid, [ref.path])` after every write and delete. That goes to the server push and the client outbox.
- **Indexes:** collection-group overrides for `devices.createdAt` and `devices.updatedAt` in `firestore.indexes.json`, for the cross-user sync.
- **Reads:** no screen reads devices, so there is no `useReadModelSource` call. The sender reads Firestore (R4.3a does not apply).
- **Tests and docs updated:**
  - SQL tests: `assert_security`, `rls_behaviour`, `purge`, `client_apply`;
  - `scripts/readmodel-identity-check.ts`;
  - the TS table lists in `readmodelSyncCore.test`, `pushRefs.test` and `readmodelVerify.test` (2 × 54);
  - the write-hook guard's known writers;
  - `READ_MODEL_RULES.md` (54 tables).

> **Resolved 2026-11-07:** Group Funds (SPENDLY-678, `20261106000000`) reached main first. `20261107` and `20261108` are rebuilt on its lists (all three features' tables), and each adds its realtime ping triggers. Apply in order: `20261106` (if not yet applied), then `20261107`, then `20261108`.

## Rules

`firestore.rules` `match /devices/{installId}`:
- owner only;
- `hasOnly`/`hasAll` on the nine keys;
- the install id format is checked, and the token must match the Expo token format;
- `tokenType == 'expo'`, `product == 'expense'`, platform is android or ios;
- `updatedAt` and `lastSeenAt` must equal `request.time`;
- `createdAt` is pinned after create (or re-stamped on a full re-registration).

## Tests

- `shared/utils/pushDevice.test.ts` (18): token and id formats, document fields, every skip reason, the write throttle.
- `lib/pushRegistration.test.ts` (14): create, unchanged, refresh without `createdAt`, user switch, failure recovery, skips, unregister.
- `firestore/devices.rules.test.ts` (13): owner, other user, anonymous, pinned `createdAt`, shape and format rejections. Run against the local emulator.
- Read-model suites (53 files), write-hook guard, mapping and the cross-user index guard: all pass, apart from the known `fake-indexeddb` environment failure.
- **Not run locally:** the Supabase SQL tests, because Docker isn't running. CI's `readmodel-schema.yml` runs them on push.

## Open

- **End-to-end test push** (moved here from 223). It needs the owner's FCM key upload and a signed Expense build. Then read your token from your device doc and send to that token only (docs/PUSH_CREDENTIALS.md).
- **A session ended elsewhere** (revoked, deleted on another device) can't delete this install's document: there is no auth left. The next user signing in on the same install registers the same token under their own account. **SPENDLY-227 must dedupe by token**: send to the most recent `lastSeenAt` owner only.
- **Deploys (production, with approval):** `firestore.rules`, `firestore.indexes.json` (diff against live first), and Supabase migration `20261107000000`. Rules must be live before any build containing this code ships.

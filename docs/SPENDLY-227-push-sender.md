# SPENDLY-227: Shared server-side push sender

**Ticket:** [SPENDLY-227](https://kesavach.atlassian.net/browse/SPENDLY-227) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md).
**Branch:** `feature/SPENDLY-227-push-sender`, cut from the epic branch after the 226 merge.

## What it is

**One way for every Spendly feature to notify users:**

```ts
sendToUsers({ uids, category, kind, title, body, url, entityId, idempotencyKey, actorUid?, ttlSeconds? }, ports)
```

- **Transport:** the Expo Push Service (docs/PUSH_CREDENTIALS.md).
- **Runtime-agnostic:** all I/O goes through `PushPorts`. `createFirestorePushPorts(adminDb, { readModel })` implements them with the Admin SDK and `fetch`. The core takes no `firebase-admin` dependency, so the reminder engine (692) and event triggers (229, 697, 698) can run it on Cloud Functions, Netlify or a GitHub Actions script (decision D3, taken in 692).

| Guarantee | How |
|---|---|
| **Kill switch** without a deploy | `pushConfig/global.sendsDisabled == true` → nothing sent, and the key isn't consumed |
| **Idempotent** | The `pushSendLogs/{key}` document is created (`create`, which fails if it exists) **before** sending. A retry of the same key returns `duplicate`. |
| **Right people only** | Recipients are deduplicated. The **actor** and **duress** uids are dropped. `isPushCategoryEnabled` (226) applies each user's preferences. Only `product == "expense"` devices with a valid Expo token are used. |
| **Shared token** (a session ended elsewhere couldn't delete its device, 224) | A collection-group lookup by token. The push goes only to the account that used the token **most recently** (`lastSeenAt`). Also one message per token. |
| **Payload contract** | `data = { product: "expense", category, kind, url, entityId }`. The `url` must be an in-app path. Title and body are clipped. The category's Android `channelId` and priority are set. An optional `ttl` stops a stale reminder arriving late. |
| **Batching** | 100 messages per Expo request |
| **Retries** | HTTP 429, 5xx and network errors back off 1 s, then 2 s, with at most 3 attempts. A 4xx is not retried. |
| **Dead tokens** | `DeviceNotRegistered` in a ticket, or later in a receipt (`processReceipts`), deletes `users/{uid}/devices/{installId}` |
| **Read model** | Pruning is a server write to a synced collection, so the ports **require** a `readModel` decision. The caller passes `createServerPush(serverPushPorts(db))` and flushes it (SPENDLY-680), or `null` only where the nightly sync is enough. |
| **Logs** | `pushSendLogs/{key}`: category, kind, counts (recipients, opted out, no device, messages, accepted, pruned), error codes, and pending receipt ids by **install id**. Never a token. `expireAt` = 30 days, through a Firestore TTL policy. |

**Receipts:** Expo has them about 15 minutes after sending and keeps them about a day. `processReceipts(pending, ports)` reads them and prunes, returning the ones not ready yet. The reminder engine (692) runs it on each pass over recent `pushSendLogs`.

## Files

| File | |
|---|---|
| `shared/utils/push/pushSender.ts` | `sendToUsers`, `processReceipts`, `buildMessage`, `latestOwnerByToken`, `sendLogId`, `validateRequest` |
| `shared/utils/push/firestorePorts.ts` | Admin Firestore + Expo HTTP ports (structural types) |
| `firestore.rules` | `pushConfig/*` and `pushSendLogs/*`: no client access |
| `firestore.indexes.json` | The `devices.token` collection-group index (shared-token lookup), and the TTL on `pushSendLogs.expireAt` |

## Tests

- `shared/utils/push/pushSender.test.ts`: payload; idempotency; the kill switch doesn't consume the key; actor, duress and opt-out; existing reminder switches; other products and invalid tokens; shared token goes to the latest owner; one message per token; chunking; ticket pruning; retry and cap; no retry on 4xx; invalid request refused before claiming; receipts; helpers.
- `shared/utils/push/firestorePorts.test.ts`: kill switch, claim once with the 30-day expiry, device paths only, cross-account token lookup, preferences through the app's settings parser, pruning tells the read model, Expo request and access token, receipts on HTTP error.
- `firestore/devices.rules.test.ts`: `pushConfig` and `pushSendLogs` are denied to signed-in and anonymous clients.

## Not covered here / open

- **Nothing calls the sender yet.** The first callers are 692 (engine) and 229.
- **D3:** where those callers run. To decide in 692.
- **Expo access token:** optional. If used, it lives in the runtime's secret store (decided with D3).
- **Deploys** (production, with approval): rules, and indexes (the token index plus the TTL policy; diff against live first).

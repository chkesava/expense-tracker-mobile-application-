# SPENDLY-593 — realtime from the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2), ADR v2 D2 |
| Branch | `feature/SPENDLY-593-realtime` |
| Migration | `supabase-readmodel/supabase/migrations/20261104000000_readmodel_realtime.sql` |

## Design

**Why not `postgres_changes`:** the owner read policy hides tombstones, so deletes would never reach a subscriber. Instead:

- **The ping:** `public.readmodel_ping()`, security definer.
  - It is fired by **statement-level** triggers (`<table>_rm_ping_ins` and `_rm_ping_upd`, with transition tables) on all 53 synced tables.
  - Per statement, it sends **one** Broadcast message per affected user to the private topic `user:<uid>`: `{table, synced_at, changes: [{doc_id, deleted}]}`, or `{table, synced_at, resync: true}` above 100 rows.
  - No document data, ever.
  - A 200-row sync batch is one message, not 200. A row the version guard skips sends nothing.
  - Server upserts, repairs, tombstones and the app's `rm_client_apply` all ping.
- **Catch-up:** `public.readmodel_changes_since(p_since, p_limit)`, security definer, `authenticated` only.
  - It returns `(table_name, doc_id, synced_at, deleted)` for the caller's uid across all synced tables, ordered by time, capped at 1,000.
  - It includes tombstones, which plain RLS reads can't see.
  - Duress and expired tokens are refused (42501).
- **Topic policy:** `readmodel_user_topic_read` on `realtime.messages` lets in only `realtime.topic() = 'user:' || readmodel_auth.uid()`, for Broadcast.
- **The client** (`lib/readModelRealtime.ts`):
  - **Channel:** one private channel per user. supabase-js re-reads the Firebase token (`accessToken`) on every heartbeat, so token refresh is covered.
  - **Live:** pings become `changes` or `resync` events.
  - **Reconnect:** it catches up from the last `synced_at` seen, less 60 s (a transaction's `now()` is its start).
  - **Down:** the same catch-up every 30 s.
  - **Edge cases:** no baseline, or a full catch-up page, gives `resync`.
  - **Consumers:** they subscribe with `onReadModelChanges`; SPENDLY-594's on-device copy is the consumer.
- **Wiring** (`providers/FinanceDataProvider.tsx`): on only when `system_settings/global.readModel.realtime === true` (`realtimeEnabled`). Never in duress, signed out or Spendly Test. It restarts on user change.

## Tests

- **SQL (`tests/realtime.sql`, run in CI):**
  - one ping per user per statement;
  - no document data;
  - an unchanged row sends nothing;
  - a tombstone pings `deleted: true`;
  - over 100 rows sends `resync`;
  - `rm_client_apply` pings;
  - `changes_since` returns own changes with tombstones, never another user's, respects the limit and is ordered;
  - duress and expired tokens are refused;
  - anon can't execute it;
  - only the owner joins its topic, and duress joins nothing.
- **SQL (`assert_security` §9):** every synced table has both triggers; both functions are security definer with an empty `search_path`; the policy exists.
- **CI bootstrap:** `bootstrap_roles.sql` stands in for Supabase's `realtime` schema (`send`, `topic()`, `messages`), so CI, perf and the drills apply the migration and the tests can read pings back.
- **Client (`lib/readModelRealtime.test.ts`, 9 tests):** pings to events; resync and malformed pings; reconnect catch-up with the overlap; polling while down and stopping when live; a full page means resync; no baseline means resync; never listening when not allowed; stop and a user switch; not connected means polling.
- **`realtimeEnabled`:** only exactly `true`.

## Results

- `npm test`: 530 files, 7,541 tests. `npm run test:rules`: 31 files, 622 tests. `tsc` passes.
- Read-model schema CI passes (migrations, `assert_security` §9, `realtime.sql`, the perf budget).

## Acceptance and what's left

These need SPENDLY-594 (the consumer), the release, and `readModel.realtime = true` on the hosted project:
- device A's save shows on device B within 10 s;
- a soft delete disappears on B;
- the realtime outage drill;
- message volume against plan limits (runbook, "Realtime").

Also needed: the hosted check that Realtime accepts a real RS256 Firebase token (ADR §3), at the switch.

**Production:** the migration needs approval. It's additive: functions, triggers and a policy. Pings start as soon as it's applied, but nothing listens until the switch is on and 594 has shipped.

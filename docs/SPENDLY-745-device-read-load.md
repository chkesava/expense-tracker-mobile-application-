# SPENDLY-745 — Lighter read-model work on the phone

Story in epic **SPENDLY-735**, audit items C7 and C8 (also C3/C5). Branch `feature/SPENDLY-735-remaining`.

## 1. No on-device shadow compares by default (C8)
- **New switch: `system_settings/global.readModel.deviceShadow`.** It is off unless exactly `true` (`deviceShadowEnabled`, `shared/utils/readModelMode.ts`).
- **While it is off, a `shadow` setting means `firestore`:**
  - It applies to per-collection switches (`configuredCollectionMode`) and screen switches (`configuredReadModelMode`) alike.
  - So there is no copy read and no compare on each Firestore snapshot.
  - There is also no Supabase fetch for the journal, cash-flow, audit, insights, goals or group-fund compares.
- **Applied centrally,** in the two `configured*Mode` functions, so every caller gets it without a per-screen change.
- **The check moves to the server:** the nightly verify/parity jobs (`readmodel-verify` / `readmodel-parity`) are the parity check. The owner turns `deviceShadow` on only for a drill.
- **`supabase` mode is untouched,** and so is the Firestore fallback.

## 2. One storage read per table per change (C7)
`withReadCache` (`lib/readModelLocal/store.ts`) wraps the on-device store when the copy opens it.
- **Before:** every subscriber of a table re-read the whole table from SQLite/IndexedDB on each change. The expenses table alone has several subscribers (journal window, dashboard, …).
- **Now:** the first `all(table)` after a change is shared until the table changes again.
- **Invalidation:** every write to a table (`put`, `remove`, `clear`, `evictOldest`) drops its cached rows first. Store calls are serialized by the copy's task chain, so a read never returns rows older than what storage holds.
- **Unchanged:** unsent writes are still overlaid on every read (`localCopy.read`), so offline behaviour is the same.
- **Not done: indexed SQL queries per screen** (WHERE/LIMIT in SQLite and IndexedDB indexes). That needs per-backend query support and per-screen query shapes. The shared read removes the repeated whole-table reads, which was the measurable cost; per-screen indexed queries can follow if profiling still shows the single read per change as hot.

## 3. Realtime catch-up poll (C5)
- **Changed:** the 30 s poll runs only while the realtime channel is down. It now skips its tick while the app is in the background (`active`, from `AppState`). The next active tick catches up from the last change seen.
- **Kept as is: the focus refresh,** which is one id-only catch-up since the last change.

## Tests
- `lib/readModelLocal/deviceLoad.test.ts` (5) covers:
  - shadow defaults to Firestore for screens and collections;
  - the drill switch;
  - one storage read shared by three readers;
  - fresh reads after each kind of write, with other tables still cached;
  - no poll in the background.
- The existing shadow-compare tests now set `deviceShadow: true`, so they still exercise the compares.
- Guards: providerSwitch, listenersOff and the outage drills stay green.

## Owner steps
None required. `deviceShadow` stays absent (off). To run a device drill, set `readModel.deviceShadow: true` along with the `shadow` modes.

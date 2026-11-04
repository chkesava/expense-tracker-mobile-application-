# SPENDLY-594 — the on-device copy (offline)

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2), ADR v2 D1 |
| Branch | `feature/SPENDLY-594-offline-copy` |
| Migration | none (uses 593's `readmodel_changes_since` and PostgREST reads) |
| Native change | **`expo-sqlite` ~57.0.4: a new Android/iOS build** (prebuild picks it up) |

## What it is

A persistent copy of the signed-in user's read-model rows on the device: the offline source once screens read Supabase (SPENDLY-673). Firestore's cache stops being that source once its listeners are off (600).

## Storage (`lib/readModelLocal/`)

- **`store.ts`:** the interface, plus an in-memory backend.
  - **One store per device, one owner uid.** Opening it for another uid wipes it first, so a previous user's rows can never be read, even after a crash.
  - **`destroy`** removes it entirely.
- **`sqliteStore.ts`** (native): one SQLite table per synced table (`rm_<table>`) with:
  - `doc_id` (key);
  - `synced_at` (indexed);
  - `row`, the full row as JSON exactly as PostgREST returned it. Money is shown from here, a copy (R4);
  - the spec's typed columns (`localColumns`), for 673's filters, sorts and indexes.

  A table whose mapping changed is dropped and recreated, and its `table:<name>:*` meta goes with it, so it hydrates again. It's written against the expo-sqlite API subset, so tests run it on `node:sqlite`.
- **`idbStore.ts`** (web): IndexedDB with the same rules. Rows are keyed `[table, docId]`.
- **`platformStore.ts` / `platformStore.web.ts`:** SQLite on native, IndexedDB on web. Metro never bundles expo-sqlite (and its WebAssembly) for web; a web export confirms it.

## The copy (`localCopy.ts`)

- **Hydrate:**
  - It runs on the first start, and for a table whose mapping changed.
  - Every table is paged by `(synced_at, doc_id)` through PostgREST (RLS: live rows only), and the cursor is saved per page, so an interrupted hydrate **resumes**.
  - Afterwards it catches up on changes made during the hydrate, from 5 minutes before it started, which covers device clock skew.
- **Catch up on every start:** `readmodel_changes_since` from the last change seen, less 60 s, paged by time. Live ids are refetched; deleted ids (and live ids that came back missing) are removed. A full page all stamped at one instant can't be paged, so the copy rehydrates.
- **Realtime (593):** each ping is applied the same way; `resync` rehydrates the table (or everything). Realtime starts from the copy's last change seen, so a reconnect catches up instead of rehydrating.
- **Overlay:** `read(table)` layers this device's unsent writes (the 670 outbox, `pendingClientWrites`) on top. Own saves show at once, offline too; a pending delete hides the row.
- **Cap:** 50,000 rows per table by default. Past it, the newest rows by `synced_at` are kept and the table is marked **partial**; 673 pages older history from Supabase online.
- **Failures:** a failed task (offline, a refused fetch) is logged and marks the state `error`. What finished is kept, and the next start resumes.
- **Lifecycle** (`FinanceDataProvider`), one sequence per change so nothing races:
  1. sign-out, or a switch of user: **wipe** (entering duress only stops, never opens);
  2. open (hydrate or catch up);
  3. start realtime from the copy's last change seen.

  It's behind `system_settings/global.readModel.localCopy === true` (default **off**). Never in duress, signed out or Spendly Test. Account deletion signs out, which wipes.

**Encryption at rest:** not required by the ADR. Firestore's native persistent cache (SPENDLY-633) already keeps the same data on the device unencrypted; the copy matches it, and it is wiped on sign-out.

## Measured (indicative, desktop `node:sqlite`, 2026-11-04)

30,000 expense rows (a heavy user):
- writing in 500-row pages: **2.0 s**;
- reading them all back: **0.35 s**;
- database size: **21.7 MB**.

A phone will be several times slower, and the hydrate downloads about the same ~21 MB once (Supabase egress). The device measurement is part of the acceptance, after the release.

## Tests

- **`store.test.ts`** runs one conformance suite on **memory, SQLite (`node:sqlite`) and IndexedDB (`fake-indexeddb`)**: put/replace/get/list/count/remove/clear; eviction; meta; another uid wipes; destroy. It also checks the SQLite schema (typed columns), that a mapping change re-hydrates only that table, and that an unknown table is refused.
- **`localCopy.test.ts`:**
  - hydrate (live rows only, rows exactly as served);
  - resume from the cursor after an interruption;
  - catch-up on restart (new, changed, deleted);
  - catch-up paging past one page;
  - pings (refetch, delete, a missing live id, unknown table ignored, change notification);
  - resync;
  - the outbox overlay (another uid's entries ignored);
  - **never opened in duress or signed out**;
  - **wipe, and another user never seeing the previous one's rows**;
  - cap and partial.
- **`appCopy`'s keyset filter and quoting** are covered through the fetchers' use. `localCopyEnabled` and `realtimeEnabled`: only exactly `true`.

## Results

- `npm test`: 532 files, 7,567 tests. `npm run test:rules`: 31 files, 622 tests. `tsc` passes.
- A web export builds; the bundle has the IndexedDB store and no expo-sqlite.

## Acceptance and what's left (after the epic reaches main)

- **A native build** with expo-sqlite (the Expense release; prebuild picks up the module).
- Turn on `readModel.localCopy` (and `readModel.realtime`).
- **Airplane-mode drill:** every migrated screen shows the last data plus its own new saves. This needs 673's read store and the screens (596–599).
- A cold start offline.
- Hydration time and size on a phone for a heavy user.
- Spendly Test: the copy is off in local test mode. The drill on Spendly Test needs a loopback source; it is added with 673's read store.

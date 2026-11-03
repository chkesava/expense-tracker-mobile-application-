# SPENDLY-655: Watchlist store (CRUD, reorder, default list, legacy copy)

- **Feature:** SPENDLY-624 (Investment Watchlists), story 2 of 5. See the [tracker](SPENDLY-624-watchlists.md) and [plan](SPENDLY-624-plan.md) §2.2–2.3.
- **Branch:** `feature/SPENDLY-655-watchlist-store`, cut from `feature/SPENDLY-624-watchlists` at `fc642ab3`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## What changed
| File | Change |
|---|---|
| `services/portfolio/watchlistStore.ts` (new) | Every watchlist write, all through **`commitMutations`** (the offline outbox, then the read-model notify), with **server timestamps**. |
| `firestore.rules` | **An amendment to SPENDLY-654.** On update, `createdAt` may be kept **or re-stamped with the server time** (never client-chosen). `importedLegacyAt`, once present, may be kept or re-stamped but not dropped or back-dated. This applies to lists and items. |
| `firestore/watchlists.rules.test.ts` | Updated for the amendment, plus **"store writes are accepted by the rules"**: the exact documents the store builds (`watchlistDoc`/`watchlistItemDoc` with real server timestamps) replayed op by op. |
| `services/portfolio/watchlistStore.test.ts` (new) | 19 tests. |

## Why the rules amendment
The store's "create if missing" writes are whole-document sets: the default list, the one-time legacy copy, and adding a stock. With `createdAt` strictly pinned, the **second** of two devices doing the same first run, or an offline outbox replaying after another device already wrote, would be **denied**: a permission error on a write that is actually a harmless repeat. Re-stamping with `request.time` can't be faked, so the security property (a client can't choose the time) still holds.

## Store API
| Function | What it writes |
|---|---|
| `initializeWatchlists(uid, legacy)` | **One batch:** the default list (`importedLegacyAt` when there was an old list) plus every item from `planLegacyCopy` (normalized, de-duplicated, order kept, non-Yahoo entries skipped and counted, capped at 50). **The old `users/{uid}/watchlist` documents are never written.** Running it twice writes the same documents. |
| `readLegacyWatchlist(uid)` | Reads only the old collection, for the copy. |
| `createWatchlist(uid, name, lists)` | Sets a new list `wl_<time>_<random>`. The name is trimmed and unique ignoring case, with a maximum of 20 lists. |
| `renameWatchlist(uid, id, name, lists)` | A **field update** (`name`, `updatedAt`), so `createdAt` is untouched. |
| `deleteWatchlist(uid, id)` | Reads the list's items, then **one batch** deletes the items and the list. **The default list is refused.** |
| `addToWatchlist(uid, listId, {symbol, name?}, entries, {ensureList?})` | Normalizes the symbol ("tcs" → `TCS.NS`). **Already in the list is an `exists` no-op**, however it was typed. A bad symbol or a full list (50) is refused. The item is appended at the end. `ensureList` creates the list in the same batch (the first add to the default list). |
| `removeFromWatchlist(uid, listId, symbol)` | Deletes that item. |
| `moveWatchlistItem(uid, listId, entries, id, up/down)` | `planMove` makes **one field update** (`order`, `updatedAt`), or a renumber batch when ranks collapse. At an end, it's a no-op. |

- Results come back as `{ ok: true, outcome: "acked" | "queued" | "unsafe" }` or `{ ok: false, message }`. **`queued` (offline) passes through**, so the UI can say "saved, will sync".
- **Not holdings:** a guard test checks that the store's code never mentions holdings, portfolio transactions, investment cash, accounts, expenses, incomes, the ledger, quantity or average price.

## Validation
- `watchlistStore.test.ts`: 19 tests passed. They cover the first-run batch and its idempotency, the old documents never being written, create/rename/delete (with the default list protected), the cascade, add normalization, duplicates as a no-op, limits, `ensureList`, remove, both move kinds, the offline `queued` outcome, no Firestore, and the holdings guard.
- `firestore/watchlists.rules.test.ts` on the emulator: **19 tests passed**, including the store-write replay.
- **Full `npm run test:rules`: 31 files, 620 tests passed.**
- **`npm test` (`--maxWorkers=3`): 501 files, 6,794 tests passed.**
- `npm run typecheck:shared` exited 0.
- `npx tsc -p tsconfig.json --noEmit`: the first run failed only on the `StoreResult` default type (`Record<string, never>` rejected a plain "ok" result). After changing the default to `object` it exits 0, and the store tests were re-run and pass.

## Known limits (documented, not bugs)
- If the old app adds to the **old** list *after* this device has already copied it, that later stock isn't copied. A follow-up ticket retires the legacy collection once everyone has updated.
- The 20-list and 50-item limits are enforced by the app; rules can't count documents.

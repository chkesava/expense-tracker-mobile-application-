# SPENDLY-657: Live watchlist data (`useWatchlists`)

- **Epic:** SPENDLY-624 (Investment Watchlists), story 4 of 5.
- **Branch:** `feature/SPENDLY-657-use-watchlists`, cut from `feature/SPENDLY-624-investment-watchlists`.

## What it does
`hooks/useWatchlists.ts` is the one place the app reads watchlists and calls the 655 store.

### Listeners (SPENDLY-406)
- **One listener on `users/{uid}/watchlists`.** It listens with sync state (`LISTEN_WITH_SYNC_STATE`), so the hook knows when the server has confirmed the lists.
- **One listener on the open list's `items`.** It moves when the user opens another list, and only one list's items are ever read.
- Both listeners use `useLoadFailure`, `snapshotErrorHandler` and `forgetSnapshotPath`, and **Retry** re-subscribes them.
- The hook is used only by `WatchlistTab`, which mounts only while the Watchlist sub-tab is shown. Leaving the tab stops both listeners and the quote polling.
- The uid comes from `useAuth`, so duress mode is respected.

### Which list is open (`pickOpenWatchlistId`)
- The list the user picked, while it still exists.
- Otherwise the default list, then the first list.
- With no lists yet, the default id, so the first add lands in the default list. It is created in the same batch, through `ensureList`.

### First-time setup (`shouldInitializeWatchlists`)
- Setup runs when the lists arrive **from the server** (`fromCache === false`) and there is **no default list**. It then calls `initializeWatchlists(uid, await readLegacyWatchlist(uid))`, which creates the default list and copies the old single watchlist into it, in one batch.
- **Never from the cache.** A cached snapshot can be missing the default list, and running setup from it would overwrite the user's later edits to the copied items.
- Setup runs **at most once per session**. If it fails, a message and Retry appear, and Retry allows it once more. Two devices running it at once write the same documents, which the 654 rules accept.

### Actions
- The hook offers `add`, `remove`, `move`, `create`, `rename` and `removeList`.
- Each one calls the store, and a thrown error is logged (`lib/errors`) and returned as `{ ok: false, message }` with a friendly message.
- `create` opens the new list.
- The hook writes nothing itself; every write goes through the store's `commitMutations`.

## The old single watchlist is retired
- **`usePortfolio`:** the `users/{uid}/watchlist` listener and the plain `addDoc`/`deleteDoc` writers are gone. Holdings, transactions, orders and alerts are untouched.
- **`PortfolioDashboard`:**
  - holdings quotes no longer include watchlist symbols;
  - `WatchlistTab` now receives only `currency`.
- **`WatchlistTab` keeps its look**; the redesign is SPENDLY-658. It now:
  - shows the open list from `useWatchlists`;
  - prices it with `useWatchlistQuotes` (one batched `/api/stock-quotes` request);
  - adds through the store, which normalises the symbol (`tcs` → `TCS.NS`) and reports "Already in watchlist" without writing;
  - shows load and setup errors with Retry.
- **The legacy `users/{uid}/watchlist` documents are never changed.** Old app builds can still read and write them, and those later additions don't flow into the new lists (as planned).

## Tests
`shared/utils/watchlists.test.ts` (6 new tests):
- **Open list:** the open-list choice (requested, deleted, default, first, none).
- **Setup only from server data:** setup runs from server data without a default list. It doesn't run from cache, doesn't run a second time, and doesn't run once the default exists.
- **Guards** (on code with comments stripped):
  - `usePortfolio` no longer mentions "watchlist";
  - `useWatchlists` has no direct Firestore writes and doesn't mention holdings or money.

The hook itself is not unit-tested, because vitest runs in a Node environment with no component tests. Its decisions live in the tested pure helpers. The store (655), rules (654) and quotes (656) suites still pass. See the validation results below.

## Also fixed
`services/portfolio/watchlistStore.ts` (655) now imports Firestore from the `@/lib/firestore` adapter instead of `firebase/firestore`. `main`'s SPENDLY-635 import guard, merged into the feature branch, requires this, so the native build uses the same Firestore as the rest of the app.

## Validation
- `npm run typecheck:shared`: exit 0.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx vitest run --maxWorkers=3`: **512 files, 6,866 tests passed.**
- `test:rules` was not run, because no rules changed in this story.

## Not in this story
The list picker, rename/delete UI, reorder buttons, remove confirmation, freshness labels and "Add to watchlist" from `InstrumentSheet` are all in SPENDLY-658.

## After merge
There's nothing new beyond the epic's checklist. **Firestore rules must be deployed before the release**: until they are, the tab shows the setup error with Retry, and an add is denied: online it fails at once with a message; offline it is denied when it syncs. Nothing already saved is affected.

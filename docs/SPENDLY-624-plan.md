# SPENDLY-624 plan: Investment Watchlists (multiple lists, tracking, reordering)

Tracker: [SPENDLY-624-watchlists.md](SPENDLY-624-watchlists.md). Written 2026-10-31 against `main` at `3b0a09c8`, which includes SPENDLY-622 (Markets) and SPENDLY-623 (Screener).

## 1. What exists today (audit)
| Piece | Where | Notes |
|---|---|---|
| Storage | `users/{uid}/watchlist/{autoId}` | One flat list: `{ symbol, yahooSymbol, name, exchange, instrumentType, createdAt }` |
| Rules | `firestore.rules`, the catch-all `match /{collection}/{document=**}` list | **No validation**: any field, any shape |
| Writes | `hooks/usePortfolio.ts`, `addToWatchlist` / `removeFromWatchlist` | Plain `addDoc`/`deleteDoc`. **Not** through `commitMutations`, so there's no offline outbox and no read-model notify. The duplicate check is client-only, so two devices can add the same symbol. |
| Read | `usePortfolio`, one always-on `onSnapshot` on the whole collection, mounted with the whole portfolio provider | |
| UI | `components/portfolio/WatchlistTab.tsx` (125 lines), under Stocks → Watchlist | Add (symbol and name) and remove. No lists, no ordering, no confirmation. |
| Quotes | `hooks/useMarketQuotes.ts` via `PortfolioDashboard` | **One React Query per symbol**, each polling `/api/stock` every 60 s |
| Account deletion | `netlify/functions/delete-account.ts` | `listCollections()` plus `recursiveDelete` over the user tree, so **new subcollections are covered automatically** (R5.1) |
| Read model | `docs/READ_MODEL_RULES.md` | `watchlist` isn't in the synced set (Wave 1). R2.1 says new collections aren't synced unless the story says so. **Watchlists stay unsynced.** |

## 2. Design

### 2.1 Invariants
1. Watchlists are **not holdings**. Nothing here touches holdings, cash, portfolio transactions, P&L, invested value, accounts or the ledger, and a guard test enforces it.
2. Every write goes through **`commitMutations`** (the offline outbox, then the per-write notify), stamping `createdAt` and `updatedAt` with server timestamps.
3. **Strict rules:** `isOwner`, `hasOnly`/`hasAll`, a pinned `createdAtMs`, bounded strings and numbers, and the collections kept **out** of the catch-all. They're backed by emulator rules tests and TS↔rules contract tests.
4. **Bounded reads:** one listener on the lists collection and one on the **open** list's items. Never one listener per row. Quotes come from **one batched request per list view**, never one per row.
5. Quote failures never remove or hide saved symbols. Rows show "—" with the freshness label.
6. Not synced to the read model (R2.1). Account deletion already covers the new collections (R5.1).
7. Expense only.

### 2.2 Data model (recommended: subcollection items with the symbol as the document id)
```
users/{uid}/watchlists/{listId}
  { name, isDefault, itemCount, createdAtMs, createdAt, updatedAt }
users/{uid}/watchlists/{listId}/items/{yahooSymbol}
  { symbol, yahooSymbol, name, exchange, instrumentType, order, createdAtMs, createdAt, updatedAt }
```
- **The document id is the normalized Yahoo symbol** (`normalizeStockSymbol`: `tcs` → `TCS.NS`, `^nsei` → `^NSEI`). A duplicate in the same list is therefore **impossible by construction**: adding again just returns the existing item. The rules check `itemId == yahooSymbol`.
- **`order` is a fractional rank.** Moving an item writes **one** document: its new rank sits midpoint between its neighbours. When gaps get too small, the rank is renumbered in one batch.
- **The default list** has a fixed id, `default`, with `isDefault: true`. It's created on first use and can't be deleted (it can be renamed).
- **Limits:** 20 lists, 50 items per list, names 1–40 characters (unique per user, ignoring case; enforced on the client). The rules bound sizes and types.
- **Delete a list:** a confirmation, then one batch that deletes the list and its items (50 or fewer, so it fits one batch). "Archive" isn't offered: the ticket allows "archive/delete", and a deleted list is simple and honest.

*Alternative (not recommended): one document per list with an `items` array.* Rules can't validate array elements one by one, reordering rewrites the whole array, and two devices editing the same list overwrite each other.

### 2.3 The legacy watchlist (`users/{uid}/watchlist`)
- **Recommended: copy it once into the default list and keep the old documents.**
  - On first load, if the user has no `watchlists` documents but has legacy items, the app creates `default` and copies each legacy item into `default/items/{yahooSymbol}` through `commitMutations`.
  - Because ids are deterministic, two devices importing at once is harmless.
  - The default list records `importedLegacyAt`, so the import never runs twice.
  - Legacy documents are **not deleted**: nothing is lost, and older APKs still work.
- **The legacy rule stays in the catch-all for now.** Older APKs still read and write it. Tightening or removing it is a follow-up once everyone is on the new build (per `AFTER_MERGE_CHECKLIST` order).

### 2.4 Quotes: one batched request per list view
- A new **`GET /api/stock-quotes?symbols=A,B,…`** Netlify function returns `{ quotes: [{ symbol, price, previousClose, change, changePercent, currency, asOf }], missing: [...] }`.
  - It uses Yahoo spark `range=1d` (≤ 20 symbols per call, so a full 50-item list is 3 calls), capped at 50 symbols.
  - It shares `_market.ts`, `chunk` and `isSparkPayload` from SPENDLY-622 and 643.
  - CDN cache keyed on the **sorted** symbol list: 60 s while the market is open, longer while closed.
- **Client:** `fetchStockQuotes(symbols)` plus `useWatchlistQuotes(list)`. That's one React Query per list, polling every 60 s only while the screen is focused and the market is open, with an offline snapshot. The existing per-symbol `useMarketQuotes` for holdings is unchanged.
- **Index symbols** (`^NSEI`) and stocks both work. A symbol Yahoo doesn't know is returned in `missing`, and the row stays with "Price unavailable".

### 2.5 UI (the Stocks → Watchlist tab gets the new component)
- **A list picker:** horizontal chips of list names with counts, plus "New list". The menu offers rename and delete (delete has a confirmation; the default list can't be deleted).
- **Add stock:**
  - a symbol input, normalised live ("TCS → TCS.NS");
  - if the symbol is already in the list, it says "Already in this list" and scrolls to it;
  - the name is optional, taken from the quote when available.
- **Rows:** ticker, name, ₹ price, absolute and % change, and a freshness label ("as of 15:31 IST", "Delayed", "Offline"). Tap opens `InstrumentSheet` (chart). ↑/↓ buttons reorder (accessible and works on web), and a remove button asks for confirmation.
- **Empty states:** no lists ("Create your first watchlist"), an empty list ("Add a stock to start tracking it"), and quotes unavailable (the rows stay, with a banner and Retry).
- **"Add to watchlist"** from the Markets and Screener stock sheet (`InstrumentSheet`), with a list chooser. This fills the gap SPENDLY-646 left.

## 3. Stories (proposed subtasks of SPENDLY-624)
1. **Data model and rules:**
   - `shared/types/watchlist.ts`;
   - `shared/utils/watchlists.ts`: symbol normalisation, ids, fractional order and renumbering, limits, name rules, and the legacy-to-default mapping;
   - strict `firestore.rules` for `watchlists` and `items`;
   - emulator rules tests and TS↔rules contract tests.
   - The legacy rule is unchanged.
2. **Watchlist store** (`services/portfolio/watchlistStore.ts`):
   - create, rename and delete a list (with item cascade);
   - add, remove and move an item;
   - ensure the default list exists;
   - the idempotent legacy import.
   
   All through `commitMutations`, with server timestamps. Tests cover CRUD, duplicates, limits, offline outbox ops and the import.
3. **Batch quotes:** the `/api/stock-quotes` function (registered in the bundler, redirects, deploy smoke test and dev API), `fetchStockQuotes`, the `useWatchlistQuotes` hook and a snapshot. Tests.
4. **Live data hook:** `useWatchlists`, with a lists listener and an open-list items listener, using `useLoadFailure`, `snapshotErrorHandler` and `forgetSnapshotPath`, mounted only when the Watchlist tab is shown (SPENDLY-406). It also handles retry behaviour. The old `usePortfolio` watchlist listener and writers are removed. Tests.
5. **UI:** the new watchlist tab (picker, add, rows, reorder, remove, confirmations, states) and "Add to watchlist" in `InstrumentSheet`. View-model tests, plus the read-only/holdings guard. Reviewed by you on Expo web.

## 4. Validation
For each story: `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit`, a `git diff --stat` against the feature branch, and **`npm run test:rules`** (stories 1 and 2 change the rules; it needs port 8080 free).

## 5. After merge (preview)
1. **Deploy Firestore rules *first*.** The current rules deny `watchlists`, so the new app can't save until they're live. This is additive and old builds aren't affected.
2. **Deploy Web (Netlify)**, for `/api/stock-quotes`, and the 622/623 functions if they aren't live yet.
3. **Release — Expense.**

## 6. Risks
| Risk | Mitigation |
|---|---|
| The rules deploy is forgotten, so saves are denied | The after-merge checklist and PR put it **first**. The app shows a save error with the outbox retry, and saved data is never lost. |
| Two devices edit the same list | Per-item documents and deterministic ids. Order uses fractional ranks, so a move is a single document write. |
| Old APKs keep writing the legacy `watchlist` | It's left untouched and readable. The import runs once, and later legacy additions don't appear in the new lists. That's documented, and a follow-up ticket retires the legacy collection. |
| Yahoo is unknown for a symbol | It's returned in `missing`. The row stays, showing "Price unavailable". |

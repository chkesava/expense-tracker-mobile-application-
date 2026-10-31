# SPENDLY-654: Watchlist data model and strict Firestore rules

- **Feature:** SPENDLY-624 (Investment Watchlists), story 1 of 5. See the [tracker](SPENDLY-624-watchlists.md) and [plan](SPENDLY-624-plan.md) §2.1–2.3.
- **Branch:** `feature/SPENDLY-654-watchlist-model-rules`, cut from `feature/SPENDLY-624-watchlists` at `0a84c6b5`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## What changed
| File | Change |
|---|---|
| `shared/types/watchlist.ts` (new) | `Watchlist`, `WatchlistEntry`, `DEFAULT_WATCHLIST_ID = "default"` and `WATCHLIST_LIMITS` (20 lists, 50 items, names 40 characters, item names 120, symbols 25, `order` within ±1e12). |
| `shared/utils/watchlists.ts` (new) | Pure helpers (see below). |
| `firestore.rules` | Adds `watchlistWellFormed`, `watchlistItemWellFormed`, and the `watchlists/{listId}` and `items/{itemId}` matches. These are **validated collections, not the catch-all**. The legacy `watchlist` catch-all entry is **unchanged**. |
| Tests | `watchlists.test.ts` (22, new), `watchlists.rules.contract.test.ts` (6, new) and `firestore/watchlists.rules.test.ts` (15 emulator tests, new). |

### Pure helpers (`shared/utils/watchlists.ts`)
- **Symbols:** `normalizeWatchSymbol` ("tcs" → "TCS.NS", "^nsei" → "^NSEI"; `MF:` keys and junk give null), `displaySymbol` and `exchangeFor`.
- **Names and limits:** `checkWatchlistName` (trimmed, 1–40 characters, unique ignoring case), `canCreateWatchlist`, `canAddToWatchlist` and `cleanItemName`.
- **Document shapes:** `watchlistDoc` and `watchlistItemDoc`. The store passes the server-timestamp sentinel in, so `shared/` stays Firebase-free.
- **Reading:** `watchlistFromDoc`, `watchlistEntryFromDoc` and `sortWatchlists` (the default list first).
- **Ordering:**
  - `appendOrder` (rank step 1024) and `sortEntries`.
  - `planMove`: moving up or down is normally **one write** (the midpoint between the new neighbours). When the gap is too small to split, the whole list is renumbered in one batch.
- **Legacy copy:** `planLegacyCopy` copies the old flat list into the default list. It normalizes symbols, de-duplicates, keeps the original order, skips non-Yahoo entries (e.g. mutual funds) and counts them, and caps at 50. Planning twice gives the same documents.

## Rules
| | List `users/{uid}/watchlists/{listId}` | Item `…/items/{itemId}` |
|---|---|---|
| Who | owner (and duress twin) only | owner (and duress twin) only |
| Fields (`hasOnly`) | `name`, `isDefault`, `createdAt`, `updatedAt`, `importedLegacyAt` (optional) | `symbol`, `yahooSymbol`, `name`, `exchange`, `instrumentType`, `order`, `createdAt`, `updatedAt` (all required) |
| Checks | id `^[A-Za-z0-9_-]{1,40}$`; name 1–40; `isDefault == (listId == 'default')` | **`itemId == yahooSymbol`** and `^[A-Z0-9^][A-Z0-9.&_^-]{0,24}$`; symbol ≤ 25; name 1–120; `exchange` and `instrumentType` enums; `order` within ±1e12 |
| Times | `createdAt == request.time` on create, **pinned** on update; `updatedAt == request.time` always | same |
| Extra | `importedLegacyAt` can be set once, then never changed. **The default list can't be deleted.** | Create needs the list to exist after the write (`existsAfter`), so a list and its items can be made in one batch |

- **No money, quantity or account fields** are allowed, and a test proves it.
- Item ids **are** the symbol, so a list can't hold a symbol twice.
- `createdAt` is a **server timestamp** pinned by the rules, rather than the client-side `createdAtMs` used by `merchantOverrides`. It can't be faked, and it follows READ_MODEL_RULES R1.2.
- **Not synced to the read model** (R2.1).
- **Account deletion** already removes every subcollection (`listCollections` + `recursiveDelete`), which covers the watchlists (R5.1).
- **Legacy `users/{uid}/watchlist`:** still in the catch-all and writable by the owner, so older APKs keep working (tested).

## Validation
- `watchlists.test.ts` and `watchlists.rules.contract.test.ts`: 28 tests passed.
- `firestore/watchlists.rules.test.ts` on the emulator: **15 tests passed**.
- **Full `npm run test:rules`: 31 files passed**, including every existing rules test, so the new rules break nothing.
- **`npm test` (`--maxWorkers=3`): 500 files, 6,775 tests passed.**
- `npm run typecheck:shared` exited 0.
- `npx tsc -p tsconfig.json --noEmit`: the first run failed only on a type annotation in the new rules test (the rules-testing handle isn't the modular `Firestore` type). After the fix it exits 0, and the 15 emulator tests were re-run and pass.

## Deploy note (for the PR)
These rules must be **deployed before** the app that writes watchlists ships. The current production rules deny `watchlists`. The change is additive: nothing existing changes.

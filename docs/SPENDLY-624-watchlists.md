# SPENDLY-624: Investment Watchlists (multiple lists, stock tracking, reordering)

- **Jira:** SPENDLY-624 (Feature). Stories are Subtasks SPENDLY-654 to 658.
- **Feature branch:** `feature/SPENDLY-624-watchlists`, cut from `origin/main` at `3b0a09c8` on 2026-10-31.
- **Worktree:** `C:\dev\worktrees\spendly-624`
- **Plan:** [SPENDLY-624-plan.md](SPENDLY-624-plan.md)
- **State:** all five stories (654-658) merged into the feature branch, plus the SPENDLY-661 web form fix (cherry-picked into 658). `main` merged in. PR to `main` opened 2026-11-01 at the user's request.

## Overview
Today's single, unvalidated watchlist becomes **multiple named watchlists** with a default list:
- add and remove stocks, with duplicates impossible by design;
- reordering;
- live prices from one batched request per list;
- tap a stock to open its chart;
- "Add to watchlist" from the Markets and Screener stock sheets.

Lists live in Firestore under strict, tested rules and sync through the offline outbox. Watchlists never touch holdings, P&L or the ledger.

## Story tracker
| # | Story | Jira | Branch | State |
|---|---|---|---|---|
| 1 | Data model and strict Firestore rules (+ emulator and contract tests) | SPENDLY-654 | `feature/SPENDLY-654-watchlist-model-rules` | Merged into feature branch |
| 2 | Watchlist store: CRUD, reorder, default list, legacy import (via `commitMutations`) | SPENDLY-655 | `feature/SPENDLY-655-watchlist-store` | Merged into feature branch |
| 3 | Batch quotes: `/api/stock-quotes` and `useWatchlistQuotes` | SPENDLY-656 | `feature/SPENDLY-656-stock-quotes` | Merged into feature branch |
| 4 | Live data hook `useWatchlists` (bounded listeners) and removal of the old writers | SPENDLY-657 | `feature/SPENDLY-657-use-watchlists` | Merged into feature branch |
| 5 | Watchlist UI, plus "Add to watchlist" from the stock sheet | SPENDLY-658 | `feature/SPENDLY-658-watchlist-ui` | Merged into feature branch (user reviewed on Expo web) |

## Decisions
- **2026-10-31, audit:**
  - The existing `watchlist` is a flat, unvalidated catch-all collection, written without the outbox.
  - Quotes are polled one symbol at a time.
  - Account deletion already covers new subcollections.
  - Watchlists stay out of the read model (R2.1).
- **2026-10-31, the user chose all the recommendations:**
  - **Items are stored as documents keyed by symbol** (`watchlists/{listId}/items/{SYMBOL}`).
  - **The old watchlist is copied into the default list**, and the old documents are kept.
  - **Reordering uses up/down buttons.**
  - The stories are created in Jira as subtasks 654 to 658.
- **2026-10-31, SPENDLY-655 rules amendment:** `createdAt` (and `importedLegacyAt`) may be kept **or re-stamped with the server time** on update, never client-chosen. This stops a repeated "create if missing" (two devices, or an offline replay) from being denied.
- **2026-10-31, SPENDLY-656 (corrected):** price comes from the **1-day** spark. A stock's previous close is its 1-day `chartPreviousClose`. An index's previous close is the daily close before the latest trade's session (5-day spark), never `chartPreviousClose`, which was two sessions stale on 30 Oct. A 5-day series for stocks was rejected because it was missing M&M's latest close. The same index bug on `main` was fixed by **SPENDLY-659** (PR #249, merged).
- **2026-10-31, SPENDLY-657:**
  - First-time setup (default list + legacy copy) runs **only on a server-confirmed snapshot** without a default list, once per session. A cached snapshot could be missing the default list and would overwrite later edits.
  - `WatchlistTab` keeps its look but now reads the new lists and the batched quotes. The old `usePortfolio` listener and writers are removed. The redesign stays in 658.
- **2026-11-01, SPENDLY-661 (Bug):** on web, the Add Holding and Buy/Sell form fields lost focus on click: a `Keyboard.dismiss` wrapper blurred the focused input. This was found during the 658 review and is on `main` too. The fix, `lib/keyboardDismiss.ts` (native-only), was cherry-picked into 658 as `aa8795b5`, so it reaches `main` with this epic. Its own branch `fix/SPENDLY-661-web-form-input-blur` is not needed after that.

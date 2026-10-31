# SPENDLY-624: Investment Watchlists (multiple lists, stock tracking, reordering)

- **Jira:** SPENDLY-624 (Feature). Stories are Subtasks SPENDLY-654 to 658.
- **Feature branch:** `feature/SPENDLY-624-watchlists`, cut from `origin/main` at `3b0a09c8` on 2026-10-31.
- **Worktree:** `C:\dev\worktrees\spendly-624`
- **Plan:** [SPENDLY-624-plan.md](SPENDLY-624-plan.md)
- **State:** 654 and 655 merged into the feature branch. 656 (batch quotes) in progress.

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
| 3 | Batch quotes: `/api/stock-quotes` and `useWatchlistQuotes` | SPENDLY-656 | `feature/SPENDLY-656-stock-quotes` | In progress |
| 4 | Live data hook `useWatchlists` (bounded listeners) and removal of the old writers | SPENDLY-657 | | Not started |
| 5 | Watchlist UI, plus "Add to watchlist" from the stock sheet | SPENDLY-658 | | Not started |

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

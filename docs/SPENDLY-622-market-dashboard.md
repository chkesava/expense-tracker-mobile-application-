# SPENDLY-622: Investing Market Dashboard (indices, market movers, daily overview)

- **Jira:** SPENDLY-622 (Feature). It's a Feature, so Jira won't take Stories under it; the five stories are Subtasks SPENDLY-642 to 646.
- **Epic branch:** `feature/SPENDLY-622-market-dashboard`, cut from `origin/main` at `ed57efe2` on 2026-10-30
- **Worktree:** `C:\dev\worktrees\spendly-622`
- **Plan:** [SPENDLY-622-plan.md](SPENDLY-622-plan.md)
- **State:** Story 1 (SPENDLY-642) in progress.

## Overview
The dashboard is a Groww-style market overview inside the Expense app's Investments hub. It shows:

- **Benchmark indices:** NIFTY 50, SENSEX and NIFTY BANK.
- **Market status:** whether the market is open or closed, with an explicit "as of" time.
- **Gainers and losers:** among a documented, fixed universe of stocks.
- **Entry points:** to the watchlist and stock tools that already exist.

The data comes through a new Netlify function. The app never calls Yahoo itself. The data is never written to Firestore, and nothing on this screen reads or writes user data.

### Related tickets (context only, not in scope)
| Ticket | Relation |
|---|---|
| SPENDLY-558 | Done. Built the stock-history function, CDN caching and `StockChartCard`; this work reuses all of them. |
| SPENDLY-522 | Done. Moved `/api/stock` into this repo; this work reuses `_market.ts` and `marketQuotes.ts`. |
| SPENDLY-623 Screener, 624 Watchlists, 628 News | Future features. The dashboard gets entry points to them only once they exist. |
| SPENDLY-629 Sector heatmap | Future. Would reuse this function's batch-quote helper. |
| SPENDLY-630 Streaming | Future. Until it lands, this dashboard is poll-based and must never say "live". |
| SPENDLY-631 NIFTY benchmark | Future. Would reuse this work's index normaliser. |

## Story tracker
| # | Story (proposed) | Jira | Branch | State |
|---|---|---|---|---|
| 1 | Market-data audit and `/api/market-overview` for indices and market status | SPENDLY-642 | `feature/SPENDLY-642-market-overview-api` | In progress |
| 2 | NIFTY 50 gainers and losers (spark batch, coverage gate) | SPENDLY-643 | | Not started |
| 3 | Client service, hook and offline last-good snapshot | SPENDLY-644 | | Not started |
| 4 | Markets tab UI and its states | SPENDLY-645 | | Not started |
| 5 | Read-only instrument sheet (tap an index or mover to see its chart) | SPENDLY-646 | | Not started |

## Decisions
- **2026-10-30, audit result:** Yahoo's batch quote endpoint (`v7/finance/quote`) returns 401 without a crumb, so it can't be used. Yahoo's predefined `day_gainers` screener ignores `region=IN` and returns US stocks, so it isn't a valid source for Indian movers. The plan therefore computes movers itself, over a pinned list of NIFTY 50 stocks (see plan §2).
- **2026-10-30, "most active" is hidden in v1:** spark returns no volume. Getting volume would take one chart call per stock (50 calls), which isn't worth it for v1. AC3 allows hiding it.

- **2026-10-30, user went with the defaults:**
  - The dashboard is a **Markets** tab in the Investments hub.
  - The stories are created in Jira as Subtasks 642 to 646.
  - The feature ships dark: until a Netlify web deploy, the tab shows "unavailable". The user decides when to deploy.

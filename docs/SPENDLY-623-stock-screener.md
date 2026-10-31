# SPENDLY-623: Stock Screener (custom filters, sorting, saved screens)

- **Jira:** SPENDLY-623 (Feature). Stories are Subtasks SPENDLY-647 to 651.
- **Feature branch:** `feature/SPENDLY-623-stock-screener`, cut from `origin/main` at `9085d8da` on 2026-10-30.
- **Worktree:** `C:\dev\worktrees\spendly-623`
- **Plan:** [SPENDLY-623-plan.md](SPENDLY-623-plan.md)
- **State:** 647–650 merged into the feature branch. 651 built and tested on its branch; awaiting UI review and merge approval.

## Overview
The screener filters and sorts **NIFTY 500** stocks on fields that have a real, keyless data source:
- price;
- daily change %;
- 52-week high and low, and the distance from each (from daily closes);
- 1-year return;
- sector (NSE's industry classification);
- NIFTY 50 membership.

Market cap, P/E and volume appear as **disabled** filters, each with the reason it's unavailable. Users can combine, reset and sort filters, open a stock's chart, and save named screens.

## Story tracker
| # | Story (proposed) | Jira | Branch | State |
|---|---|---|---|---|
| 1 | Screener universe API (NIFTY 500, spark 1-year, cache, coverage) | SPENDLY-647 | `feature/SPENDLY-647-screener-universe-api` | Merged into feature branch |
| 2 | Filter and sort engine (availability, validation, missing values, presets) | SPENDLY-648 | `feature/SPENDLY-648-screener-engine` | Merged into feature branch |
| 3 | Saved screens (on-device) | SPENDLY-649 | `feature/SPENDLY-649-saved-screens` | Merged into feature branch |
| 4 | Client service, hook and snapshot | SPENDLY-650 | `feature/SPENDLY-650-screener-client` | Merged into feature branch |
| 5 | Screener UI (route, filters, results, saved menu, states) | SPENDLY-651 | `feature/SPENDLY-651-screener-ui` | Built, tested; awaiting UI review and merge approval |

## Decisions
- **2026-10-30, audit:** market cap and P/E have no keyless source; Yahoo v7, v10 and v1 all return 401. Volume needs one call per stock. All three are unavailable in v1 and shown disabled. Price, change, 52-week figures and 1-year return come from batched spark calls (25 per refresh). Sector comes from NSE's official NIFTY 500 file.
- **2026-10-30, the user chose all the recommendations:**
  - Saved screens are kept **on the device** (AsyncStorage), so there's no Firestore, rules or read-model work.
  - The universe is **NIFTY 500**.
  - The screener is a new **`/screener` route** opened from the Markets tab.
  - The stories are created in Jira as subtasks 647 to 651.

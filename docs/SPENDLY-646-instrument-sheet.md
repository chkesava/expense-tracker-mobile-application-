# SPENDLY-646: Read-only instrument sheet

- **Feature:** SPENDLY-622 (Investing Market Dashboard), story 5 of 5. See the [tracker](SPENDLY-622-market-dashboard.md) and [plan](SPENDLY-622-plan.md) §2.7.
- **Branch:** `feature/SPENDLY-646-instrument-sheet`, cut from `feature/SPENDLY-622-market-dashboard` at `20b8d797`.
- **State:** Built and tested; waiting for the user's UI review and approval to merge.

## What changed
| File | Change |
|---|---|
| `components/markets/InstrumentSheet.tsx` (new) | A full-screen, read-only sheet in the same pattern as `HoldingDetailModal`. It has a back header, then the name and subtitle, the headline figure and its move, the day range for an index, the price history chart and a footnote. |
| `components/markets/MarketParts.tsx`, `MarketsDashboard.tsx` | Index cards and mover rows can now be tapped (mover rows gain a chevron) and open the sheet. |
| `components/portfolio/stockChart/StockChartCard.tsx` | Adds an optional `priceUnit` prop (`"currency"` by default, or `"points"`). In points mode the readout, the accessibility summary and the tooltip show levels without ₹, and ghost mode doesn't mask them. Holding charts are unchanged. |
| `shared/utils/stockHistory.ts` | `isIndianListing` now recognises `^NSEI`, `^BSESN` and `^NSEBANK`, so index charts use the NSE session for cache lifetimes and polling. This was the leftover from 642. |
| `shared/utils/marketsView.ts` | Adds `Instrument`, `instrumentChartSymbol`, `instrumentPriceUnit` and `instrumentHeader`. |
| Tests | `marketsView.test.ts` gains 4 tests (25 in total), `stockHistory.test.ts` gains 1 and `marketDataService.test.ts` gains 1 (index URL `symbol=%5ENSEI`). `stockHistoryFirebaseFree.test.ts` adds the sheet to the Firebase guard, plus a new **read-only guard**: the Markets components may not use `usePortfolio()`, `PortfolioDataProvider`, `@/services/portfolio`, `addToWatchlist` or `MockTradeModal`. |

## Behaviour
- **Header figures** come from data the tab already has, so opening the sheet costs no request. The chart then loads from `/api/stock-history` through the existing cache.
- **Index:** the title is the index name, with "Index · as of 15:31 IST", the level in points and "+354.30 (+1.56%)". The chart is in points.
- **Stock:** the title is the company name, with "M&M · NSE · NIFTY 50", the ₹ price and the %. The chart is in rupees, like a holding's.
- **No buy or sell, and no watchlist write.** "Add to watchlist" waits for SPENDLY-624.

## Validation
- Focused: `marketsView` 25, `marketDataService` 21, `stockHistory` 18 and the guards 23 tests passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- **Full `npm test` was not fully green.** It failed twice, each time only on wall-clock performance assertions in modules this story doesn't touch:
  - First run: 2 of 6,601 tests failed.
  - Re-run: 1 failure, `feeDetection` "handles a large history quickly".
  - The modules involved (`feeDetection`, `feePatterns`, `whatIf.qa`, `decisionJournal.qa`, `merchantNormalize`) import none of the market code. Run on their own they pass: 5 files, 152 tests.
  - Every other test passed.
- Live check: the bundled `stock-history` returned `^NSEI` 1D with 76 bars and 1M with 21. The 1D cache lifetime is `s-maxage=1800` while the market is closed, which confirms indices now follow the NSE session.
- Visual review: pending (local Expo web with `scripts/dev-market-api.js`; see the SPENDLY-645 doc).

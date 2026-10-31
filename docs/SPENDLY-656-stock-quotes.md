# SPENDLY-656: Batched watchlist quotes (`/api/stock-quotes`)

- **Feature:** SPENDLY-624 (Investment Watchlists), story 3 of 5. See the [tracker](SPENDLY-624-watchlists.md) and [plan](SPENDLY-624-plan.md) §2.4.
- **Branch:** `feature/SPENDLY-656-stock-quotes`, cut from `feature/SPENDLY-624-watchlists` at `33deae08`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## What changed
| File | Change |
|---|---|
| `shared/types/market.ts` | `BatchQuoteDTO` and `StockQuotesDTO` (with `quotes`, `missing` and `failed`). |
| `shared/utils/stockQuotes.ts` (new) | Pure helpers: `parseQuoteSymbols` / `quoteSymbolsParam` (normalized, de-duplicated, **sorted**, at most 50), `quoteFromDailySpark`, `currencyFor`, `buildStockQuotes` and `isStockQuotes`. For the app: `quoteRows` and `quotesLabel`. |
| `shared/utils/screenerUniverse.ts` | `screenerStatus` accepts anything with `asOf`. The label logic moves into **`dailyCloseLabel`**, which the screener and the quotes share. Screener behaviour is unchanged (its tests pass). |
| `shared/utils/marketMovers.ts` | `yahooSparkUrl` also accepts `"5d"`. |
| `netlify/functions/stock-quotes.ts` (new) | `GET /api/stock-quotes?symbols=…`. |
| `services/marketDataService.ts` | Adds `fetchStockQuotes(symbols)`: one request per set, **sorted**, so a list in any order hits the same CDN entry. There's no request for an empty list. |
| `lib/stockQuoteCache.ts` (new) | The last known quote **per symbol** on the device (at most 200, newest wins). A stock in two lists shares one copy. |
| `hooks/useWatchlistQuotes.ts` (new) | One query per list. It polls every 60 s only while the market is open and the screen is focused. |
| Registration | The bundler, `_redirects`, the `web-deploy.yml` smoke step and `scripts/dev-market-api.js`, plus the Firebase-free guard. |
| Tests | `stockQuotes.test.ts` (13), `stock-quotes.test.ts` (8), `stockQuoteCache.test.ts` (5) and 3 in `marketDataService.test.ts`. |

## How the price and change are worked out
- The **last two daily closes** of a 5-day spark series, for stocks and indices alike.
- **Why not Yahoo's `chartPreviousClose`:** on 30 Oct 2026 it gave Indian **indices** the close from **two sessions earlier**. NIFTY 50 would have read +1.56% instead of +0.51%, SENSEX +1.66% instead of +0.42%, and NIFTY BANK +0.77% instead of **−0.41%**. Stocks were correct.
- **Fallback for BSE listings:** Yahoo returns only the latest point for `.BO` symbols, even over 5 days. For a **stock** with a single close, `chartPreviousClose` is used; it matched the real previous close for every stock checked. **Never for an index:** an index with one close shows its price and no change.
- **Index levels are points:** `isIndex` tells the UI not to show a currency. `currency` is "INR" for `.NS`/`.BO` and Indian indices, otherwise null (unknown).
- **Rounding:** derived figures are rounded to 4 decimals.

## Endpoint behaviour
- **Input:** 1–50 symbols, normalized ("tcs" → `TCS.NS`, "^nsei" → `^NSEI`), de-duplicated and sorted. Anything invalid returns 400 without calling Yahoo.
- **Batching:** batches of 20 or fewer (so 3 calls for a full list), all run in parallel.
- **`missing`:** symbols Yahoo doesn't know. A batch where Yahoo knows **none** of the symbols comes back as a 404 "No data found", which is treated as all missing, **not** a failure.
- **`failed`:** symbols in a batch that errored. The response is still 200 with what priced, and a 60 s CDN lifetime.
- **Cache:**
  - The durable CDN cache uses `Netlify-Vary: query=symbols`. It keeps a copy fresh for 60 s while open, and up to 15 min while closed (never past the next open).
  - A memory copy per symbol set (up to 100 sets) serves fresh hits, dedupes concurrent requests, and stands in when Yahoo fails (24 h, marked `stale`).
  - If everything fails with nothing cached, the response is 502 with `no-store`.
- **Logs:** counts only, never symbols.

## App side
- **One row per symbol, always** (`quoteRows`). A quote failure can never remove a stock from a watchlist:
  - live price, if it came back;
  - otherwise the device's saved copy ("saved");
  - otherwise "unknown" (Yahoo doesn't know it) or "unavailable".
- **Label** (`quotesLabel` via `dailyCloseLabel`): "Market closed · closing prices of 30 Oct", "Market open · prices as of 11:30 IST", "Delayed · …", "Offline · showing prices from 30 Oct, 16:00 IST". With no answer at all, it's built from the saved quotes. It never says "live".

## Validation
- Focused: `stockQuotes`, `stock-quotes`, `stockQuoteCache`, `marketDataService`, `screenerUniverse`, the guards and the bundling check: 118 tests passed. `stockQuotes` (13) was re-run after the BSE fallback.
- **Live** (bundled handler, 31 Oct 2026, market closed): 7 symbols in 763 ms; `NOTAREAL.NS` came back `missing`.
  - TCS +0.99%.
  - NIFTY 50 **+116.35 (+0.51%)**, SENSEX **+308.49 (+0.42%)**, NIFTY BANK **−222.70 (−0.41%)**. All three match the real 29→30 Oct closes.
  - AAPL −1.23% with no currency.
- Live recheck after the BSE fallback: INFY.BO 1182 (previous close 1143.45, +3.37%), RELIANCE.BO −0.44%; NIFTY 50 still +0.51%.
- **`npm test` (`--maxWorkers=3`): 504 files, 6,827 tests passed.** `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- `test:rules` was not run, because no rules changed in this story.

## Found while building this (not fixed here)
**The SPENDLY-622 Markets tab index cards use `chartPreviousClose` and would show the wrong daily change for indices.** It's on `main` but not deployed. It needs its own bug ticket, and the fix must land before the next Netlify web deploy.

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
> **Corrected after merge** (branch `feature/SPENDLY-656-quote-source-fix`). The first version used the last two closes of a 5-day series for everything. A live check then found that **Yahoo's 5-day series can miss the latest session's close**: M&M on 30 Oct was `[…, 2890, null]`. That would have priced M&M at the previous day's close (+0.70% instead of −1.72%). The rules below replace it.

| | Price and time | Previous close |
|---|---|---|
| **Stock** | newest close of the **1-day** spark | the 1-day `chartPreviousClose` (it matched the real previous close for every stock checked, including BSE listings, where Yahoo returns a single point) |
| **Index** (`^…`) | newest close of the **1-day** spark | **the daily close before the latest trade's session**, from a 5-day spark (`previousSessionClose`, the same rule as SPENDLY-659). **Never `chartPreviousClose`**: on 30 Oct it was two sessions old (NIFTY 50 +1.56% instead of +0.51%, NIFTY BANK +0.77% instead of −0.41%). No daily history means a price with no change. |

- The extra 5-day call is made only when a batch contains an index, and only for those symbols. If that call fails, the index still shows its price with no change; it isn't marked failed.
- Index levels are points: `isIndex` tells the UI not to show a currency. `currency` is "INR" for `.NS`/`.BO` and Indian indices, otherwise null.
- Derived figures are rounded to 4 decimals.

## Endpoint behaviour
- **Input:** 1–50 symbols, normalized ("tcs" → `TCS.NS`, "^nsei" → `^NSEI`), de-duplicated and sorted. Anything invalid returns 400 without calling Yahoo.
- **Batching:** batches of 20 or fewer (so 3 calls for a full list), all run in parallel, plus one 5-day call per batch that contains an index.
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

## Correction validation (`feature/SPENDLY-656-quote-source-fix`)
- `stockQuotes.test.ts` and `stock-quotes.test.ts`: 25 tests passed. They cover the M&M missing-close case, indices from the daily series (never `chartPreviousClose`), BSE single points, the 5-day call only when there's an index, and an index priced without a change when its 5-day call fails.
- **Live** (31 Oct): TCS +0.99%, **M&M −1.72%** (was stale under the old rule), INFY.BO +3.37%, NIFTY 50 +0.51%, SENSEX +0.42%, NIFTY BANK −0.41%. `NOTAREAL.NS` came back missing, in 719 ms.
- **`npm test`: 504 files, 6,831 tests passed.** `typecheck:shared` and `tsc` both exited 0.


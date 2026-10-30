# SPENDLY-622 plan: Investing Market Dashboard

Tracker: [SPENDLY-622-market-dashboard.md](SPENDLY-622-market-dashboard.md). This plan was written 2026-10-30 against `main` at `ed57efe2`.

## 1. What exists today (audit)

### Code
| Piece | File | Relevance |
|---|---|---|
| Quote function | `netlify/functions/stock.ts` | Calls Yahoo v8 `chart`, one symbol per call, reading only `meta`. |
| Function plumbing | `netlify/functions/_market.ts` | Has `json`/`fail`/`query`, `upstreamGet`/`upstreamGetWithTimeout` (timeout plus one transport retry) and `Cache-Control: public, max-age=60`. |
| Quote shaping | `shared/utils/marketQuotes.ts` | Has `normalizeStockSymbol` and `stockQuoteFromChartMeta`. |
| History function and cache | `netlify/functions/stock-history.ts`, `_historyCache.ts` | Durable CDN cache (`Netlify-CDN-Cache-Control`, `Netlify-Vary`), a memory LRU that serves a stale copy when Yahoo fails, and ETags. **This is the pattern to copy.** |
| Market hours | `shared/utils/stockHistory.ts` `isIndianMarketOpen` | NSE 09:15–15:30 IST on weekdays only. It has no holiday calendar. |
| Client service | `services/marketDataService.ts` | Has `getBaseUrl`, `fetchJson` (throws on transport errors and 5xx, returns `null` on 404) and `MarketDataError`. |
| Quote hook | `hooks/useMarketQuotes.ts` | React Query with a 60 s stale time, paused when the screen isn't focused. |
| Local series cache | `lib/stockHistoryCache.ts` | Uses AsyncStorage and falls back to memory only. **Pattern for the offline snapshot.** |
| Chart | `components/portfolio/stockChart/StockChartCard.tsx` | Takes `symbol` only, so it works for any symbol, held or not. |
| Investments hub | `app/(app)/investments.tsx`, `INVESTMENT_HUB_TAB_IDS` in `shared/config/navigation.ts` | Tabs are investments, portfolio (Stocks), sip and epf. |
| Watchlist and alerts | `components/portfolio/WatchlistTab.tsx`, `AlertsTab.tsx`, under `PortfolioDashboard` sub-tabs | These already exist. They're Firestore-backed, and this feature doesn't touch them. |
| Symbol "search" | `marketDataService.searchSymbols` | An exact-ticker lookup through `/api/stock`, not a real search. |
| Bundling, routing and smoke test | `scripts/bundle-netlify-fns.js` (`FUNCTIONS`), `scripts/build-web.js` (`_redirects`), `.github/workflows/web-deploy.yml` | A new function has to be added in all three places, or it's never deployed. |

### Provider probe (2026-10-30, live, from this machine)
| Request | Result | Use |
|---|---|---|
| `v8/finance/chart/^NSEI`, `^BSESN` and `^NSEBANK` (`range=1d&interval=1d`) | **200**. `meta` includes `regularMarketPrice`, `chartPreviousClose`, `regularMarketTime`, `currency` (INR), `exchangeName` (NSI), `currentTradingPeriod.regular{start,end}`, `regularMarketDayHigh/Low`, `fiftyTwoWeekHigh/Low` and `exchangeTimezoneName` | **Indices and market status** |
| `v8/finance/spark?symbols=…` (20 symbols) | **200**. Each symbol has `chartPreviousClose`, `close[]` and `timestamp[]`. No volume and no name. | **Movers** |
| `v8/finance/spark` with 25 symbols | **400**: "Number of symbols needs to be less than or equal to 20" | NIFTY 50 needs 3 batches |
| `v7/finance/quote` | **401 Unauthorized** (needs a crumb) | Not usable |
| `v1/finance/screener/predefined/saved?scrIds=day_gainers&region=IN` | 200, but **US stocks** (REGN…). It ignores the region. | **Not a valid source** for Indian movers |

**Bug found:** `normalizeStockSymbol("^NSEI")` returns `"^NSEI.NS"` because a bare symbol gets `.NS` appended. As a result, `/api/stock` and `/api/stock-history` can't serve indices today. The fix: a symbol starting with `^` is passed through unchanged. Holdings never start with `^`, so existing callers aren't affected. Holding symbols are unchanged; only symbols that start with `^` behave differently.

### What can't be verified (and so won't be shown)
- **A real-time status.** Yahoo's data for NSE may be delayed, so the UI says "as of HH:MM IST" and never says "live".
- **Exchange-wide gainers, losers or most-active stocks.** There is no provider for them. The app shows movers only within the documented NIFTY 50 universe, labelled as such.
- **Most active.** Spark returns no volume. Hidden in v1.
- **The holiday calendar.** Not available. Market status is inferred from data recency instead (§2.3).

## 2. Design

### 2.1 Invariants
1. No Firestore reads or writes for market data. No listener is mounted. `docs/READ_MODEL_RULES.md` doesn't apply, because this isn't user data.
2. Portfolio holdings, valuation, XIRR, cash, SIP and trades are unchanged, and so are `/api/stock` and `/api/stock-history` responses for every symbol that doesn't start with `^`.
3. Every displayed figure is a provider value or a direct computation from one, such as change = price − previousClose. Nothing is interpolated, and nothing is filled in when a value is missing.
4. Every item carries its own `asOf` and `currency`. The whole payload also carries `fetchedAt` and `stale`.
5. Expense only. Nutrition and Ganesh are untouched.
6. The app never calls Yahoo directly.

### 2.2 Endpoint: `GET /api/market-overview`
There are no query parameters, so there's one cache key. A single response serves the whole screen:

```ts
interface MarketOverviewDTO {
  success: true;
  schemaVersion: 1;
  provider: "yahoo";
  fetchedAt: string;            // server fetch time (ISO)
  stale: boolean;               // served last-good copy after an upstream failure
  status: MarketStatusDTO;
  indices: IndexQuoteDTO[];     // only indices that returned a valid price
  movers: MoversDTO;            // { available: false, reason } when gated
}
interface IndexQuoteDTO {
  symbol: "^NSEI" | "^BSESN" | "^NSEBANK"; name: string; currency: string;
  price: number; previousClose: number; change: number; changePercent: number;
  dayHigh: number | null; dayLow: number | null; asOf: string;
}
interface MarketStatusDTO {
  state: "open" | "closed" | "unknown";
  sessionStart: string | null; sessionEnd: string | null; // today's regular session
  lastTradeAt: string | null;                             // newest index regularMarketTime
}
type MoversDTO =
  | { available: true; universe: "NIFTY50"; universeAsOf: string; coverage: number;
      gainers: MoverDTO[]; losers: MoverDTO[]; asOf: string }
  | { available: false; reason: "LOW_COVERAGE" | "UPSTREAM" | "DISABLED" };
interface MoverDTO { symbol: string; name: string; price: number; previousClose: number;
  change: number; changePercent: number; asOf: string; currency: "INR" }
```

The error body has the same shape as `StockHistoryErrorDTO`, with `success: false` plus a `code` and a `message`.

**Caching** follows `stock-history.ts`:
- A durable CDN cache. The fresh lifetime is 60 s while the market is open and 15 min while it's closed. Past that, Netlify serves the stale copy while it revalidates.
- A memory copy of the last good response. When Yahoo fails, it's served with `stale: true` for up to 24 h.
- Errors are never cached as data, and never stored in Firestore.

**Cost per cache miss:** 3 chart calls plus 3 spark calls, all run in parallel, with a short timeout so the whole request fits inside Netlify's 10 s limit.

### 2.3 Market status (pure, in `shared/utils/marketOverview.ts`)
- `open`: now falls inside `currentTradingPeriod.regular` **and** the newest index `regularMarketTime` is at or after that session's start. That second check is evidence the session actually traded today.
- `closed`: any other case with valid data. This covers weekends, holidays and after hours. If the session window is today and nothing has traded, it's a holiday, and the UI says "Closed · last close <date>".
- `unknown`: no index returned usable data.
- The status is worked out again **on the client** against the device clock, so a cached "open" doesn't outlive the session end.

### 2.4 Movers (pure)
- **Universe:** `shared/data/nifty50.ts`, a pinned list of symbols and display names with a `NIFTY50_AS_OF` date. Spark returns no names, so the names come from this list. The list needs a manual update after each semi-annual NSE rebalance, and the UI shows "Among NIFTY 50 stocks".
- **Computation:** `changePercent = (last close − chartPreviousClose) / chartPreviousClose × 100`, using the newest non-null close. A symbol with a missing or zero previous close is dropped.
- **Coverage gate:** if fewer than 80% of the universe priced, the result is `available: false, reason: "LOW_COVERAGE"`. That stops "top gainers" from being drawn from a partial set.
- **Lists:**
  - Top 5 gainers: changePercent > 0, sorted by changePercent descending, ties broken by symbol.
  - Top 5 losers: changePercent < 0, sorted ascending.
  - A flat day can leave a list short or empty, and it stays that way. It's never padded.

### 2.5 Client
- `services/marketDataService.ts`: `fetchMarketOverview()` through `fetchJson`, which maps typed error codes to messages as `fetchStockHistory` does.
- `hooks/useMarketOverview.ts`: React Query `['market-overview']` with a 60 s stale time and polling while the screen is focused and the market is open. It doesn't poll while the market is closed.
- `lib/marketOverviewCache.ts`: a single AsyncStorage item holding the last good DTO. It's shown immediately on launch and when offline, marked stale. It's never shown as fresh.
- `shared/utils/marketOverview.ts` (pure):
  - `freshnessLabel(dto, now)`, which returns "As of 15:30 IST · Closed", "Updated 2 min ago" or "Offline · showing 10:05".
  - `classifyFreshness`, which returns fresh, stale or expired. "Expired" means data older than one session, which is shown dimmed with a warning.

### 2.6 UI: a new **Markets** tab in the Investments hub
The tab is added to `INVESTMENT_HUB_TAB_IDS` and gets an `investments.tsx` tab entry. It's reachable through `?tab=markets`. The screen has, from top to bottom:

1. **Status strip.** A pill showing the market state (Open, Closed or Unknown) and the freshness label.
2. **Index cards.** Three cards in a horizontal row that wraps on wide screens. Each shows the name, price, change and change % coloured with `usePortfolioColors().pnl`, the day range and its own "as of" time. An index that's missing is left out. If all three are missing, a module-level unavailable state is shown instead.
3. **Movers.** A Gainers/Losers segmented control, a caption "Among NIFTY 50 stocks", and rows (not cards) showing symbol, name, price and change %. When the data isn't available, an informative card explains why.
4. **Shortcuts.** Rows linking to "Your watchlist" (Stocks tab, watchlist sub-tab) and "Price alerts". There's no screener or news entry until 623 and 628 exist.

| State | Behaviour |
|---|---|
| Loading with no snapshot | A skeleton for each module |
| Loading with a snapshot | The snapshot plus a "Refreshing…" label |
| Offline | The snapshot with an "Offline · as of …" banner, or an empty state plus Retry when there's no snapshot |
| Upstream error | Module-level unavailable cards plus Retry. The other modules still render. |
| Stale (`stale: true`) | An amber "Delayed: provider unavailable, showing data from …" label |

The screen uses existing components: `PageShell`, `Card`, the segmented control, `EmptyState` (check the name in `components/common`), theme tokens and lucide icons.

### 2.7 Tap-through (Story 5)
Tapping an index or a mover opens a read-only sheet with `StockChartCard` for that symbol, plus the quote row. That requires the `^` normaliser fix from Story 1 so `/api/stock-history` accepts indices. The sheet has no buy/sell button and no Firestore access. "Add to watchlist" waits for SPENDLY-624.

## 3. Stories

### Story 1: Market-data audit and `/api/market-overview` (indices and status)
- **Files:**
  - `shared/utils/marketQuotes.ts`: the `^` passthrough, plus tests.
  - `shared/types/market.ts`: the DTOs.
  - `shared/utils/marketOverview.ts` (new): index normalisation and status, plus tests.
  - `netlify/functions/market-overview.ts` (new), with `movers: { available: false, reason: "DISABLED" }` for now.
  - `netlify/functions/market-overview.test.ts` (new).
  - Registration in `bundle-netlify-fns.js`, the `build-web.js` `_redirects` and the smoke test in `web-deploy.yml`.
  - This doc's audit table.
- **Tests:**
  - Normalisation of real `meta` fixtures (the open, closed and holiday cases).
  - Each status branch.
  - One index missing, all missing, a 429, a timeout, stale-if-error, and the cache headers.
  - `/api/stock` and `stock-history` unchanged for `.NS` symbols.

### Story 2: NIFTY 50 gainers and losers
- **Files:**
  - `shared/data/nifty50.ts` (new).
  - `shared/utils/marketMovers.ts` (new): the spark normaliser, ranking and coverage gate, plus tests.
  - The function fills in `movers`.
- **Tests:**
  - Ranking and tie-breaks.
  - Nulls and zero previous closes dropped.
  - The coverage gate at 79% and 80%.
  - A flat day.
  - Batching into groups of 20 or fewer.
  - One batch failing (the coverage gate handles it).

### Story 3: Client service, hook and offline snapshot
- **Files:** `services/marketDataService.ts`, `hooks/useMarketOverview.ts` (new) and `lib/marketOverviewCache.ts` (new), plus tests. Freshness helpers go in `shared/utils/marketOverview.ts`.
- **Tests:** freshness labels across IST boundaries, client-side status recomputation, snapshot read/write and storage-failure fallback, and the error-code-to-message mapping.

### Story 4: Markets tab UI
- **Files:**
  - `shared/config/navigation.ts` (the tab id, plus its test).
  - `app/(app)/investments.tsx`.
  - `components/markets/` (new): `MarketsDashboard`, `MarketStatusStrip`, `IndexCard`, `MoversList` and `MarketShortcuts`.
- **Tests:** rendering for each state (loading, snapshot, offline, error, stale, unavailable movers), and the tab's deep link.
- **Review:** the user reviews this on local Expo web with demo data, without screenshots.

### Story 5: Read-only instrument sheet
- **Files:** `components/markets/InstrumentSheet.tsx` (new), which reuses `StockChartCard`.
- **Tests:** an index symbol reaches the history endpoint correctly, and the sheet has no Firestore imports (a guard test).

**Order:** 1, 2, 3, 4, 5. Stories 2 and 3 can swap, because both depend only on the DTO from Story 1.

## 4. Validation (every story)
`npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit` and `git diff --stat feature/SPENDLY-622-market-dashboard`. No rules change is expected, so there's no `test:rules` run.

## 5. Risks
| Risk | Mitigation |
|---|---|
| Yahoo changes or blocks the unofficial endpoints | Stale-if-error, per-module unavailable states and typed error codes. The provider sits behind one function, so it can be swapped. |
| The NIFTY 50 list goes stale | `NIFTY50_AS_OF` is shown in the docs, and a test fails if it's more than 7 months old. That reminder test is optional; the user decides. |
| Netlify credits are low, and the endpoint only goes live after a web deploy | It ships dark: the tab shows "unavailable" until the function is deployed. The user decides when to deploy. SPENDLY-621 (Cloudflare Pages) wouldn't serve Netlify functions. |
| Function time limit (10 s) with 6 upstream calls | Calls run in parallel with a short timeout, and the CDN coalesces concurrent misses. |
| Users reading index values as real-time | The screen always shows "as of" and never says "live". It mentions possible delay. |

# SPENDLY-558: Historical stock charts (line + candlestick) with multi-range caching

- **Epic:** SPENDLY-531 (Premium redesign, Midnight Emerald)
- **Branch:** `feature/SPENDLY-558-stock-history-charts`, cut from `feature/SPENDLY-531-premium-redesign` at `2fc27ad`
- **State:** Done. Merged straight to `main` via `57553e0` on 2026-10-19, at the user's request, skipping the epic branch. On merged `main`, `npm test` passed (375 files, 5,633 tests), and `typecheck:shared` and `tsc` both exited 0. Still needed: a manual **web-deploy** run for `/api/stock-history`, a CDN `Cache-Status` check, and device QA. See "As built" at the end.

## Where it fits
SPENDLY-558 is not in the Phase 6 plan (548–557). It is a new feature story under the epic, and it touches only the market-data path and the holding detail screen. It does not depend on 548 (form foundations) or 557 (date picker), and none of the Phase 6 stories depend on it.

## What exists today
| Piece | File | Notes |
|---|---|---|
| Quote function | `netlify/functions/stock.ts` | Yahoo v8 `chart?range=1d&interval=1d`; reads only `meta` |
| Function plumbing | `netlify/functions/_market.ts` | `json`/`fail`/`query`, `upstreamGet` (15 s timeout, one retry on transport failure only), `Cache-Control: public, max-age=60` |
| Symbol + quote shaping | `shared/utils/marketQuotes.ts` | `normalizeStockSymbol` (`.NS` for bare tickers), `stockQuoteFromChartMeta` |
| Function tests | `netlify/functions/market.test.ts` | vitest, mocks `fetch` |
| Function bundling | `scripts/bundle-netlify-fns.js` (`FUNCTIONS` list) | |
| Routing | `scripts/build-web.js` `_redirects` | `/api/stock` etc. must sit above the `/*` catch-all |
| Deploy smoke test | `.github/workflows/web-deploy.yml` | `require()`s each bundled function |
| Client service | `services/marketDataService.ts` | `getBaseUrl`, `fetchJson` (throws on transport/5xx, `null` on 404), `MarketDataError` |
| Quote hook | `hooks/useMarketQuotes.ts` | React Query, `['market-quote', symbol, type]`, 60 s stale/poll, paused when unfocused |
| Query defaults | `app/_layout.tsx` | `staleTime` 60 s, retry ≤ 2 with backoff; no persister |
| Detail screen | `components/portfolio/HoldingDetailModal.tsx` (658 lines) | Full-screen modal from `HoldingsList`; identity + quote row, metrics card, trades, Buy/Sell bar |
| Chart precedent | `components/portfolio/PortfolioCharts.tsx` | Hand-drawn `react-native-svg` + reanimated; no chart library in `package.json` |
| Colours | `components/portfolio/portfolioColors.ts` | `usePortfolioColors().pnl(...)`, `hairline`, `card`, `border` |

No shared cache service is configured: there is no `@netlify/blobs`, Redis or KV dependency. No React Query persister exists either.

## Invariants
1. `/api/stock` and its response shape do not change. `useMarketQuotes`, SIP execution and portfolio valuation keep working unchanged.
2. **No Firestore reads or writes for market history.** The chart takes its data from the endpoint and the cache only. It uses the `holding` prop that `HoldingDetailModal` already receives and never mounts a new listener.
3. No change to portfolio accounting, trades, holdings, XIRR or transaction persistence.
4. Candles always come from real OHLC values. A record with a null open, high, low or close is not drawn as a candle, and candles are never built from close-only data.
5. The quote and the history are separate queries with separate freshness rules.
6. Changes stay inside Expense: Nutrition and Ganesh are untouched.

## Design

### 1. Shared contract and pure logic (`shared/`, no React Native imports)
**`shared/types/market.ts`** (extended):
- `StockHistoryRange = '1D'|'1W'|'1M'|'3M'|'6M'|'1Y'|'5Y'|'ALL'`
- `StockCandle = { t: number /* epoch ms */; o: number|null; h: number|null; l: number|null; c: number|null; v: number|null }`
- `StockHistoryDTO = { success: true; schemaVersion: 1; provider: 'yahoo'; symbol; range; interval; timezone; exchangeTimezone; currency; previousClose: number|null; asOf: string; fetchedAt: string; stale: boolean; candles: StockCandle[] }`
- `StockHistoryError = { success: false; code: 'BAD_REQUEST'|'NOT_FOUND'|'NO_DATA'|'THROTTLED'|'TIMEOUT'|'UPSTREAM'|'MALFORMED'; message }`

**`shared/utils/stockHistory.ts`** (new, pure, with tests):
- `RANGE_CONFIG`: the provider mapping, the TTL and the label format per range:

  | Range | Yahoo range / interval | Fresh TTL (default) | SWR window | Axis format |
  |---|---|---|---|---|
  | 1D | `1d` / `5m` | 60 s | 5 min | `HH:mm` IST |
  | 1W | `5d` / `15m` | 3 min | 15 min | `EEE HH:mm` |
  | 1M | `1mo` / `1d` | 30 min | 6 h | `d MMM` |
  | 3M | `3mo` / `1d` | 6 h | 24 h | `d MMM` |
  | 6M | `6mo` / `1d` | 6 h | 24 h | `MMM` |
  | 1Y | `1y` / `1d` | 12 h | 48 h | `MMM yy` |
  | 5Y | `5y` / `1wk` | 24 h | 7 d | `yyyy` |
  | ALL | `max` / `1mo` | 24 h | 7 d | `yyyy` |

  The ALL range's real coverage is checked against Yahoo during implementation and recorded here. Intraday TTLs stretch to the long-range value outside NSE hours (09:15–15:30 IST, Mon–Fri); there is no holiday calendar, so holidays rely on the short TTL until the market-hours check catches up. TTLs can be overridden per range from `STOCK_HISTORY_TTL_<RANGE>` env vars on the function, clamped to sane bounds.
- `parseHistoryRange(raw)`: an allowlist. Unknown values give `null`, which the function turns into a 400.
- `normalizeYahooChart(payload, symbol, range)` → `StockHistoryDTO | {code}`. It zips `timestamp[]` with `indicators.quote[0]`, drops non-finite or duplicate timestamps, sorts ascending, keeps null OHLCV as `null`, rejects a candle where `h < l`, and returns `NO_DATA` when no usable close is left. It also appends a live last point from `meta.regularMarketPrice` only if it is newer than the last candle (on line charts only; it is never added as a candle).
- `historyCacheKey({ provider, schemaVersion, symbol, range, interval, adjusted })`: one deterministic key. Chart type is **not** part of the key.
- `downsampleForLine(candles, maxPoints)` (min/max bucket, so spikes survive) and `formatAxisLabel(ms, range, tz)` (with `Intl` and an `Asia/Kolkata` fallback).

### 2. Endpoint: `netlify/functions/stock-history.ts`
`GET /api/stock-history?symbol=KPITTECH.NS&range=1W`. There is no `chartType` parameter, because one OHLCV payload serves both chart types. That satisfies "chart type does not duplicate the upstream request" by construction.
- Validates the symbol with `normalizeStockSymbol` plus a character allowlist (`^[A-Z0-9.^&_-]{1,20}$`) and validates the range with `parseHistoryRange`. It calls `encodeURIComponent` on the provider path. Any other query parameter is ignored.
- Calls a provider module, `netlify/functions/_stockHistoryProvider.ts` (`fetchYahooHistory(symbol, range)`). All Yahoo specifics live there, so a supported provider can replace it later.
- Reuses `upstreamGet` (timeout + a single transport retry, no fan-out). It maps Yahoo 404 → `NOT_FOUND` 404, 429 → `THROTTLED` 429 (with `Retry-After`), timeout → `TIMEOUT` 504, other errors → `UPSTREAM` 502, and bad JSON → `MALFORMED` 502.
- `_market.ts` gains `jsonWithHeaders(status, payload, headers)` so this function can set its own cache headers. The existing `json()` keeps `max-age=60` for the quote functions, so quote behaviour does not change.
- It logs one privacy-safe structured line per request: `{fn, symbol, range, outcome: hit|miss|stale|error, upstreamMs, points, status}`. No IPs, user IDs, tokens or URLs with keys are logged.

### 3. Server/shared cache (two layers, no new service)
**Layer A, shared across users and instances: the Netlify CDN with Durable Cache.** The function returns:
```
Cache-Control: public, max-age=0, must-revalidate                     (browsers/app always revalidate via the CDN)
Netlify-CDN-Cache-Control: public, durable, s-maxage=<ttl>, stale-while-revalidate=<swr>
Netlify-Vary: query=symbol|range
ETag: "<hash of key + last candle t + candle count>"
```
- The `durable` directive stores the response in Netlify's shared durable cache, which every edge node and every function instance reads. Identical requests from different users therefore hit one cache entry, and the CDN coalesces concurrent misses for the same key. That is the stampede protection.
- `Netlify-Vary: query=symbol|range` keys the cache only on those two parameters. Adding `&chartType=` or any other junk parameter cannot create new entries or bypass the cache.
- `stale-while-revalidate` returns cached data immediately and refreshes in the background.
- Error responses carry `Netlify-CDN-Cache-Control: no-store`, so errors are never cached as data. `NO_DATA`/`NOT_FOUND` get a short 60 s negative cache.
- **Known limit:** this needs the site to stay on Netlify, and the client must send canonical `symbol` and `range` values (it will). Verify `durable` on the live site after deploy by checking the `Cache-Status` response header.

**Layer B, per instance, for stale-if-error and deduplication:** an in-memory bounded LRU in the function module (100 entries, about 50 KB each at most, so under ~5 MB):
- In-flight `Map<key, Promise>` deduplicates concurrent upstream calls inside one warm instance.
- If the upstream fails and the LRU holds a last-known-good entry within `swr + 24h`, the function returns it with `stale: true`, `Warning`-style metadata and a short CDN TTL (60 s), so it retries soon. This is documented as **per-instance only**, not global.

**Not chosen (for now):** Netlify Blobs (`@netlify/blobs`) would give a truly global stale-if-error store, but it is a new dependency, needs `connectLambda` with the v1 handler signature, and adds a write per miss. It can come later behind the same provider interface if the CDN layer proves insufficient. Firestore is never used.

### 4. Client
**`services/marketDataService.ts`:** `fetchStockHistory(symbol, range, { signal })` reuses `getBaseUrl` and `fetchJson`. It parses the typed error body so the UI can tell `THROTTLED`, `TIMEOUT`, `NO_DATA` and network failures apart (adds `code` to `MarketDataError`).

**`hooks/useStockHistory.ts`** (new): a React Query hook, because React Query is already adopted for quotes and this avoids a second cache framework.
- `queryKey: ['stock-history', 1 /*schema*/, symbol, range]`. Chart type is not in the key.
- `staleTime` and `gcTime` come from `RANGE_CONFIG` (for example, 1D is 60 s stale; 5Y is 24 h stale with a 30 min gc).
- `placeholderData: keepPreviousData` keeps the last chart on screen while a new range loads.
- `signal` cancels superseded requests. React Query already deduplicates concurrent identical keys.
- `enabled: visible && isFocused && instrumentType is stock|etf`. There is no `refetchInterval` except on 1D during market hours (60 s), and that pauses when unfocused, matching `useMarketQuotes`.
- `refetchOnWindowFocus` and `refetchOnMount` only refetch when the data is stale, which is the default behaviour given a `staleTime`.

**Local persisted cache: `lib/stockHistoryCache.ts`** (new), an AsyncStorage store using the same conventions as `services/recurring/recurringStore.ts`:
- One index key, `spendly.stockHistory.v1.index` (the LRU order), plus one entry per cache key. It holds at most **20 entries**, and each entry is the downsampled payload (≤ 400 candles). Total size stays under ~1 MB.
- The hook sets `initialData` from this store (with `initialDataUpdatedAt = fetchedAt`), so a cached chart renders instantly and React Query refetches only when it is stale. A successful fetch writes back to the store and evicts the least recently used entry.
- A bump of `schemaVersion` drops all old entries. Every read is wrapped in try/catch, and corrupt JSON counts as a miss.

**Diagnostics:** dev-only counters (hit, miss, stale served, points) go through `lib/errors.ts` logging, with failures reported through `friendlyErrorMessage`. No user data is logged.

### 5. Chart UI (inside `HoldingDetailModal`, Expense-only)
New components in `components/portfolio/stockChart/`:
- `StockChartCard.tsx` is the container. It holds the range chips, the Line/Candles segmented toggle, the chart, the state banner and the "Delayed · as of 14:32 IST" freshness note (it never says "Live").
- `LineChart.tsx` is an SVG path with an area gradient, coloured with `colors.pnl(lastClose - firstClose)`. It draws a dashed previous-close baseline on 1D, shows high/low labels, and breaks the line at null closes rather than interpolating.
- `CandleChart.tsx` draws SVG candles: a wick from high to low and a body from open to close. Bull candles use the success token and bear candles the destructive token. Records with any null OHLC are skipped. An optional volume strip (20% height) is shown if it fits the design review. Candle width comes from the plot width divided by the number of candles, with a minimum of 1 px.
- `useChartScrub` is an optional crosshair on press-and-drag using `react-native-gesture-handler` `Pan` with `activeOffsetX`, so vertical scrolling of the modal and the back gesture still work. The header price shows the scrubbed point. This is a stretch goal and can be cut if it risks gesture conflicts.
- The x-axis is gapless (points are evenly spaced by index rather than by time), so weekends, holidays and overnight gaps don't leave empty space. Axis labels come from `formatAxisLabel` in IST.
- All transforms (downsampling, scales, path strings) are memoised on `[data, width, chartType]`.
- **States:** a skeleton shimmer on the first load; an empty state ("No trading data for this period"); a provider error with Retry; a throttled state ("Prices are busy, try again shortly"); a stale banner when a fetch fails over cached data. Each sits inside the card so the rest of the screen is unaffected.
- **Accessibility:** the chips and toggle use `accessibilityRole="tab"` with `accessibilityState={{selected}}`, have targets of at least 44 pt, and the chart has an `accessibilityLabel` summary ("KPITTECH, 1 month, from ₹1,200 to ₹1,310, up 9.2%").
- **Placement:** the card goes directly under the identity/quote row and above the metrics card. The header and quote row keep using the existing quote data. The existing Buy/Sell bar is unchanged.
- **Ghost mode:** prices on the chart axis are market prices, not the user's money, but the privacy convention in this epic hides amounts. The axis price labels and the scrub price use `Amount ghostable`/masking where ghost mode is on; the chart line itself stays visible.
- **Scope:** only stock and ETF holdings get the chart. Mutual funds and crypto keep the current screen, because `/api/stock-history` is Yahoo equity-only. Watchlist detail is out of scope unless asked.
- **Reference screenshots:** the "premium dark brokerage" screenshots mentioned in the ticket aren't attached to Jira or the repo. The UI follows Midnight Emerald tokens until they are supplied.

## Files likely to change
**New**
- `shared/utils/stockHistory.ts` + `shared/utils/stockHistory.test.ts`
- `netlify/functions/stock-history.ts`, `netlify/functions/_stockHistoryProvider.ts`, `netlify/functions/_historyCache.ts` (LRU + in-flight)
- `netlify/functions/stock-history.test.ts`
- `hooks/useStockHistory.ts` (+ test), `lib/stockHistoryCache.ts` (+ test)
- `components/portfolio/stockChart/{StockChartCard,LineChart,CandleChart,chartScales}.tsx|ts` (+ a scales test)

**Modified**
- `shared/types/market.ts`: history types
- `netlify/functions/_market.ts`: `jsonWithHeaders` (additive)
- `services/marketDataService.ts` (+ test): `fetchStockHistory`, `MarketDataError.code`
- `components/portfolio/HoldingDetailModal.tsx`: mounts `StockChartCard`
- `scripts/bundle-netlify-fns.js`: add `stock-history`
- `scripts/build-web.js`: `/api/stock-history` redirect above the catch-all
- `.github/workflows/web-deploy.yml`: load smoke test for `stock-history.js`
- `docs/SPENDLY-531-premium-redesign.md`: tracker row

No `firestore.rules`, index, ledger, or `shared/features/portfolio` accounting changes.

## Tests (AC 9)
- **Mapping and validation:** every range maps to the expected Yahoo range and interval; an unknown range gives 400; symbols are normalised (`kpittech` → `KPITTECH.NS`, `AAPL` stays as is) and junk characters are rejected.
- **Normalisation:** multi-point intraday fixtures give more than one candle for 1D and 1W (that is the "not a single daily candle" proof); nulls are preserved; bad timestamps and duplicates are dropped; `h<l` is rejected; an empty result gives `NO_DATA`.
- **Function:** headers (durable s-maxage per range, `Netlify-Vary`, `no-store` on errors); 404/429/timeout/malformed mapping; LRU hit/miss/expiry; stale-if-error returns `stale: true`; concurrent calls for one key make one upstream `fetch` (in-flight dedupe); the chart type parameter doesn't change the key.
- **Client:** `fetchStockHistory` error codes; the `stockHistoryCache` LRU eviction, version bump and corrupt-entry handling; `useStockHistory` uses `initialData` from storage, makes no fetch when fresh, and makes one fetch for concurrent identical keys.
- **UI:** the chart scales and candle geometry (bull/bear, null skip); `StockChartCard` covers the loading, empty, error, stale and throttled states, plus selected-state accessibility.
- **Firestore:** a test asserts that `useStockHistory` and `StockChartCard` import nothing from `firebase/firestore` or `lib/firebase` (AC 4).
- **Regression:** the existing `market.test.ts` and `marketDataService.test.ts` pass unchanged (AC 10).

## Validation
```
npx vitest run shared/utils/stockHistory.test.ts netlify/functions/stock-history.test.ts netlify/functions/market.test.ts services/marketDataService.test.ts
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
node scripts/bundle-netlify-fns.js && node --no-experimental-require-module -e "require('./netlify/functions-dist/stock-history.js')"
git diff --stat feature/SPENDLY-531-premium-redesign
```
Android: run a `npx expo export --platform android` bundle check. Device QA uses Spendly Test on the emulator per `docs/LOCAL_TEST_MODE.md`; the history endpoint is public market data, so it needs no Firebase.

## Risks and open questions
1. **Shared cache choice:** the recommendation is Netlify Durable CDN cache plus a per-instance LRU (no new dependency). Netlify Blobs is the fallback if a truly global stale-if-error store is needed.
2. **Yahoo is unofficial:** it can rate-limit or change shape at any time. The provider module isolates it, and the CDN cache keeps upstream volume to roughly one request per symbol, range and TTL across all users.
3. **ALL coverage:** `range=max&interval=1mo` returns listing-to-date monthly bars for most NSE names; this gets confirmed with live calls and recorded here.
4. **Deployment:** the new function only works after a web deploy. Native builds already in the field call `/api/stock-history` on `EXPO_PUBLIC_SHARE_URL`. Until that deploy, the chart shows its error state, and nothing else breaks.
5. **Reference screenshots** are not available. The UI follows Midnight Emerald tokens until they are supplied.
6. **Gesture conflicts** from the scrub crosshair in the full-screen modal on Android: the crosshair is optional and is cut if it can't be made conflict-free.

## As built (2026-10-18)
The shared cache follows the approved choice: Netlify durable CDN plus a per-instance LRU. Differences from the plan:

- **Files:**
  - The chart maths lives in `shared/utils/stockChartGeometry.ts`, so it is tested without a renderer.
  - One `StockChartPlot.tsx` draws both modes; there are no separate `LineChart`/`CandleChart`/`chartScales` files.
  - Test fixtures live in `shared/utils/stockHistory.fixtures.ts`.
- **Scrub:** the crosshair uses React Native's touch responder, not gesture-handler `Pan`. An RN `Modal` on Android would need its own `GestureHandlerRootView`. The responder hands vertical drags back to the ScrollView (`onResponderTerminationRequest`).
- **Range switching:** chip taps are debounced by 200 ms before a request goes out. The previous chart for the same stock stays on screen, dimmed, while the next range loads (`placeholderData`).
- **Timeouts:** the upstream timeout is 4 s, with one retry (`upstreamGetWithTimeout`), so both attempts fit in Netlify's 10 s limit. `/api/stock` keeps its 15 s timeout.
- **Currency:** chart prices are formatted in the series currency (`dto.currency`), not the display currency. They are market prices.
- **UI tests:** vitest runs in Node with no React Native renderer, so the UI states are covered through `chartViewState`, `historyErrorCopy` and the geometry tests.

### Provider coverage (checked live on 2026-10-18, a Sunday)
| Range | Bars (KPITTECH.NS) | Interval returned |
|---|---|---|
| 1D | 74 | 5m |
| 1W | 125 | 15m |
| 1M | 22 | 1d |
| 3M | 65 | 1d |
| 6M | 127 | 1d |
| 1Y | 248 | 1d |
| 5Y | 262 | 1wk |
| ALL | 392 | 1wk |

For `range=max`, Yahoo chooses the bar size itself. It returns 1wk for KPITTECH (listed 2019), 1mo for RELIANCE.NS (371 bars back to 1995), and 3mo for AAPL (169 bars back to 1984). The response reports the interval it actually returned. Every bar in these samples had full OHLC. Yahoo answers an unknown ticker with HTTP 404, which maps to `NOT_FOUND`.

### Validation run
- **Focused tests:** `npx vitest run shared/utils/stockHistory.test.ts shared/utils/stockChartGeometry.test.ts lib/stockHistory netlify/functions services/marketDataService.test.ts` → 7 files, 88 tests passed.
- **Full suite:** `npm test` → 374 files, 5,622 tests passed.
- **Typechecks:** `npm run typecheck:shared` → exit 0. `npx tsc -p tsconfig.json --noEmit` → exit 0.
- **Bundle:** `node scripts/bundle-netlify-fns.js`, then `require('./netlify/functions-dist/stock-history.js')` → loaded (15.8 kB).
- **Android bundle:** `npx expo export --platform android` → exit 0 (Hermes bundle, 16 MB). This checks the JS bundle only; no native build was needed, since no dependency was added.
- **Live handler:** the bundled handler, called against Yahoo for all eight ranges, returned the bar counts in the table above. A repeat request was an instance-cache hit (1 ms). An unknown ticker gave 404 `NOT_FOUND`.

### Left open
- **Deploy:** `/api/stock-history` only exists after the next web deploy (`web-deploy.yml`). Until then the chart shows its error state, and nothing else is affected.
- **CDN check:** after that deploy, confirm the durable cache is working: a second request should show `Cache-Status: "Netlify Durable"; hit`.
- **Device QA:** run it on Spendly Test. Check scrolling and scrubbing in the full-screen modal on Android, and small phones.
- **Reference screenshots:** still not supplied, so the visual matches the Midnight Emerald tokens.

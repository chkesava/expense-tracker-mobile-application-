# SPENDLY-623 plan: Stock Screener (custom filters, sorting, saved screens)

Tracker: [SPENDLY-623-stock-screener.md](SPENDLY-623-stock-screener.md). Written 2026-10-30 against `main` at `9085d8da`, which includes the SPENDLY-622 market dashboard.

## 1. Provider audit (live, 2026-10-30)

| Field the ticket names | Keyless source | Result | v1 |
|---|---|---|---|
| Price, daily change | Yahoo `v8/finance/spark` (≤ 20 symbols per call) | ✅ `close[]`, `chartPreviousClose` | **Supported** |
| 52-week high / low | spark `range=1y&interval=1d`: 246 daily closes per stock, 20 stocks in 0.43 s (93 KB) | ✅ computed from **daily closes** | **Supported**, labelled "52-week range (closing prices)". It can differ slightly from intraday highs and lows. |
| 1-year return (bonus) | the same 1-year closes | ✅ | Supported, labelled |
| Volume | `v8/finance/chart` meta (`regularMarketVolume`) | ✅ but **one call per stock**. Spark ignores `indicators=volume`. | **Unavailable.** 500 calls per refresh breaks the ticket's "avoid one request per stock" rule. |
| Market capitalisation | `v7/finance/quote`, `v10/quoteSummary`, `v1/finance/screener` | ❌ **401** (`Invalid Crumb` / `Unauthorized`) | **Unavailable**, shown disabled with the reason |
| P/E | the same endpoints | ❌ **401** | **Unavailable**, shown disabled |
| Sector | NSE Indices `ind_nifty500list.csv` (official), `Industry` column | ✅ 21 sectors, e.g. Financial Services 98, Capital Goods 70, Healthcare 44 | **Supported** (NSE's industry classification) |

**Not used:**
- Yahoo's website screener, or getting a cookie and crumb to unlock v7, v10 or v1. That would be working around auth, which the ticket rules out.
- Scraping NSE's live pages.

**Universe:** NIFTY 500, from NSE's official constituent file. The screen always says "Among NIFTY 500 stocks" and never implies the whole NSE/BSE market.

## 2. What exists to reuse (from SPENDLY-622)
- `netlify/functions/_market.ts`: `upstreamGetWithTimeout`, `jsonWithHeaders`.
- The `market-overview.ts` pattern: CDN `s-maxage` lifetimes that depend on market state, a memory last-good copy, stale-if-error, in-flight dedupe and ETag.
- `shared/utils/marketMovers.ts`: `chunk` (≤ 20), `yahooSparkUrl`, `isSparkPayload`, newest non-null close.
- `shared/utils/marketOverview.ts`: `marketStateAt`, `formatIstTime`, freshness helpers.
- `shared/data/nifty50.ts`: the pattern for a pinned list generated from NSE's CSV.
- `lib/marketOverviewCache.ts` and `hooks/useMarketOverview.ts`: the snapshot and hook pattern.
- `components/markets/InstrumentSheet.tsx`: the read-only stock detail with chart. It's reused for "open a stock" from the results.
- `scripts/dev-market-api.js`: local review.

## 3. Design

### 3.1 Invariants
1. No Firestore reads or writes of market data. The app never calls Yahoo directly.
2. Every filter is enabled only when its field has a documented source. Market cap, P/E and volume are shown **disabled** with "Not available from our data source". They never return empty or misleading results.
3. A stock with a missing value is **excluded** from a range filter on that field, and the result says so ("12 stocks have no 52-week data"). Missing values sort last.
4. The universe is always named. A partly priced universe is labelled with its coverage, e.g. "482 of 500 priced".
5. Portfolio, holdings and calculations are unchanged. Expense only.

### 3.2 Endpoint: `GET /api/screener-universe`
- **One payload:** `{ success, schemaVersion, universe: "NIFTY500", universeAsOf, fetchedAt, stale, status, coverage, rows: ScreenerRow[] }`.
- **`ScreenerRow`:** `{ symbol, name, sector, inNifty50, price, previousClose, change, changePercent, high52, low52, pctFromHigh52, pctAboveLow52, return1y, asOf }`. Numbers are `null` when missing.
- **Cost:** 25 spark calls (`range=1y`), with at most 6 in flight, a short timeout and one retry. That fits in Netlify's 10 s limit (one call takes about 0.4 s).
- **Cache:**
  - 5 min fresh while the market is open, and up to 6 h while it's closed, never past the next open.
  - Stale-if-error with a memory copy for 24 h.
  - About 75 KB per response.
- **Coverage gate:** below 80% priced, the endpoint returns `available: false` with a reason, and the UI says it can't screen fairly right now.

### 3.3 Pure engine: `shared/utils/screener.ts`
- **`SCREENER_FIELDS`:** each field has an id, a label, a unit (₹, %, text), a `source` note and `available: boolean` plus a reason. Market cap, P/E and volume are present with `available: false`.
- **Filter kinds:** a numeric range (min and/or max), sector multi-select, and "NIFTY 50 only".
- **Validation:** numbers must be finite, and min ≤ max. Ranges are clamped to the field's bounds.
- **Matching:** filters combine with AND. `applyScreen(rows, screen)` returns `{ rows, excludedForMissing: Record<field, n> }`.
- **Sort:** by any available field, ascending or descending. Missing values go last, ties break by symbol.
- **Paging:** client-side pages of 50, in a FlashList.
- **Presets:** "Near 52-week high", "Top gainers today", "Beaten down (≥30% below 52-week high)" and "By sector". They're just saved screens shipped in code.

### 3.4 Saved screens (decision needed: local is recommended)
- **Option A (recommended for v1):** keep them on the device in AsyncStorage (`spendly.screener.savedScreens.v1`). That's at most 10 screens with names of 1–40 characters, versioned and validated on read. Corrupt data falls back to an empty list. They survive app restarts, as AC6 requires, and need no rules deploy or read-model work.
- **Option B:** sync them in Firestore at `users/{uid}/screenerScreens/{id}`. That needs strict rules with emulator and contract tests, `createdAt`/`updatedAt` stamps, `commitMutations`, plus a read-model migration, mapping, RLS and purge per `docs/READ_MODEL_RULES.md`, then a rules deploy.

### 3.5 UI
- A new route `/screener` (Expense only), registered in the three places: Stack.Screen, `SUB_SCREEN_*` and `RESTORABLE_ROUTES`. It's linked from the Markets tab's "Your stocks" card as "Stock screener".
- **Top:** the universe and freshness line, e.g. "Among NIFTY 500 stocks · 497 priced · Market closed · as of 15:31 IST".
- **Below that:**
  - a horizontally scrolling chip bar of active filters (tap to edit, × to remove), plus "Filters", "Sort" and "Reset";
  - a "Saved" menu to save, load, rename or delete screens.
- **Filter sheet:**
  - one section per field; unavailable fields are greyed out with their reason;
  - min/max inputs with inline validation;
  - a sector multi-select;
  - a "NIFTY 50 only" toggle.
- **Results:** rows showing ticker, name, sector, ₹ price, change %, plus the value of the field being sorted on. A results count is shown, and tapping a row opens `InstrumentSheet`.
- **States:**
  - loading (skeleton);
  - no matches, with "Clear filters";
  - offline with a saved snapshot;
  - upstream error with Retry;
  - stale and expired;
  - universe unavailable (low coverage).

## 4. Stories (proposed subtasks of SPENDLY-623)
1. **Screener universe API:** `shared/data/nifty500.ts` (from NSE's CSV: symbol, name, industry, NIFTY 50 flag), the pure row builder (52-week figures and 1-year return from closes), `/api/screener-universe` with cache, coverage and stale-if-error, and the bundler, redirect, smoke and dev-API registrations. Plus tests.
2. **Filter and sort engine:** `shared/utils/screener.ts` with field availability, validation, AND matching, missing-value handling, sort, paging and presets. Plus tests for combinations, sorting, missing values and validation.
3. **Saved screens:** storage (Option A or B per the decision), a schema guard and limits. Plus tests.
4. **Client:** `fetchScreenerUniverse`, `useScreenerUniverse`, and an on-device snapshot. Plus tests.
5. **Screener UI:** the route, filter sheet, chips, sort, results, saved-screens menu, states, the Markets tab entry and stock detail through `InstrumentSheet`. Plus view-model tests. The user reviews it on Expo web.

## 5. Validation
For each story, run `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit` and a `git diff --stat` against the feature branch. Run `test:rules` only if Option B is chosen. The dev API gets `screener-universe` for local review.

## 6. Risks
| Risk | Mitigation |
|---|---|
| Yahoo throttles 25 calls per refresh | Long CDN lifetimes, at most 6 calls in flight, stale-if-error, and the coverage gate |
| 52-week figures from closes differ from intraday | Labelled "closing prices" in the UI and the docs |
| The NIFTY 500 list goes stale | `universeAsOf` is shown, and the header gives regeneration steps (as with `nifty50.ts`). It shares the NSE rebalance schedule. |
| Users want market cap, P/E or volume | Shown as disabled with the reason. A future ticket can add a licensed fundamentals provider (relates to SPENDLY-626). |
| Netlify credits | The function ships dark until the user's web deploy. Until then the screener shows an unavailable state. |

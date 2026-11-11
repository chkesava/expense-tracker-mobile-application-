# SPENDLY-751: Investments: Add a global transaction History tab for all past stock and ETF trades

**Type:** Feature. **Epic:** SPENDLY-119 (Investments & Portfolio Management). **Branch:** `feature/SPENDLY-751-portfolio-transaction-history` (from `main`).

## Problem
In Investments → Stocks/Portfolio (`PortfolioDashboard.tsx`), users could view active holdings, a watchlist, mock orders, price alerts, and analytics charts, but there was no global trade history view.

Although every executed BUY, SELL, and portfolio adjustment is recorded in the `portfolioTransactions` collection, transaction history was only accessible through the per-holding detail modal (`HoldingDetailModal.tsx`). Consequently:
- If a stock or ETF was fully sold or removed from active holdings, its trade history was no longer accessible anywhere in the app.
- Investors had no single chronological ledger to review past trading activity, total charges, or net cash impact across all instruments.

## Solution & Architecture

1. **Sub-Tab Navigation (`shared/config/navigation.ts`, `app/(app)/investments.tsx`):**
   - Extended `PORTFOLIO_SUB_TAB_IDS` with `"history"`:
     `["holdings", "history", "watchlist", "orders", "alerts", "charts"]`.
   - Updated `parsePortfolioSubTab` to recognize `"history"`.
   - Supports deep links and direct routing via `/investments?tab=portfolio&sub=history`.

2. **Pure Domain Logic & Selectors (`shared/features/portfolio/utils/portfolioHistory.ts`):**
   - `filterAndSortPortfolioHistory()`:
     - Automatically excludes pending and cancelled orders (`orderStatus !== "cancelled" && orderStatus !== "pending"`).
     - Resolves instrument names and types against active holdings, with graceful fallback to `tx.symbol` and standard asset heuristics (e.g. `*BEES` -> ETF/Gold) for deleted or fully-sold holdings.
     - Filters by search query (symbol and instrument name, case-insensitive).
     - Filters by transaction type (`All types`, `Buy`, `Sell`, `Adjustments`).
     - Filters by asset category (`All assets`, `Stocks`, `ETFs`, `Mutual Funds`, `Crypto`, `Gold`).
     - Filters by date range (`All time`, `This month`, `Custom date` range).
     - Sorts by `date_desc`, `date_asc`, `amount_desc`, `amount_asc` with deterministic tie-breaking.
     - Computes `gross`, `fees`, and `net` cash impact (total cost for BUY, net proceeds for SELL).
   - `generatePortfolioHistoryCsv()`:
     - Pure RFC-4180 CSV export guarded against spreadsheet formula injection via `csvField` and `csvNumber` from `shared/utils/csv`.
     - Includes Date, Symbol, Name, Type, Instrument, Quantity, Price, Gross Value, Fees, Net Amount, Currency, Broker, Notes, Status, and ID.

3. **Presentation & Virtualized List (`components/portfolio/PortfolioHistoryTab.tsx`, `PortfolioHistoryRow.tsx`):**
   - High-performance `FlashList` with item virtualization, receiving `listHeader` as `ListHeaderComponent` so the summary card and sub-tab chips scroll naturally without nested `ScrollView` warnings.
   - Responsive design:
     - Mobile layout: compact card with symbol, instrument dot, type badge, broker, date, units @ price, fees, and net proceeds/cost.
     - Desktop / tablet layout (`width >= 720`): clean multi-column table row with `PortfolioHistoryTableHeader`.
   - Filter toolbar with `SearchBar`, horizontal swipe boundaries for filter chips, custom DateField pickers, and reset filters button.
   - Cross-platform CSV export: browser download on web (`Blob` + `URL.createObjectURL`), native `Share.share` on mobile.

## Invariants Kept
- **Read-model architecture:** Reuses `usePortfolio()` without adding redundant Firestore or Supabase subscriptions. Works transparently in `firestore`, `shadow`, or `supabase` read modes.
- **Spark plan limits:** Zero extra Firestore reads or queries.
- **Financial correctness & integrity:** Does not fabricate or mutate financial records. Excludes cancelled and pending orders by default.
- **Multi-app safety:** Scoped strictly to the Expense app's portfolio feature. Nutrition and Ganesh Seva are untouched.

## Automated Tests
- `shared/config/navigation.test.ts`: Verifies `"history"` sub-tab inclusion and parsing.
- `shared/features/portfolio/utils/portfolioHistory.test.ts`: 20 unit tests covering:
  - Resolution of metadata from holdings (by holdingId, profileId, and symbol).
  - Resilient fallback for fully sold or deleted holdings.
  - Exclusion of pending and cancelled orders.
  - Filtering by transaction type, instrument, search query, this month, and custom date bounds.
  - Sorting by date and amount with deterministic tie-breakers.
  - Fee calculation and net cash impact for BUY/SELL.
  - Formula injection defense in CSV generation.

## Manual Testing Guide
1. **Open History Sub-Tab:**
   - In Spendly, navigate to **Investments** → **Stocks**.
   - Tap the **History** chip (second tab, between Holdings and Watchlist).
   - Alternatively, navigate to `/investments?tab=portfolio&sub=history`.
2. **Review Global History:**
   - Confirm BUY, SELL, and ADJUSTMENT rows are displayed chronologically (newest first).
   - Verify that stocks that were fully sold or removed from current holdings still show up in the History tab.
3. **Filter and Search:**
   - Type in the search bar: verify real-time filtering by symbol or company name.
   - Tap "Buy" / "Sell" / "Adjustments": verify transaction type filtering.
   - Tap "ETFs" / "Stocks": verify asset category filtering.
   - Select "This month" or "Custom date": verify transactions outside the range are excluded.
   - Tap "Reset filters": verify filters return to default state.
4. **Sort:**
   - Toggle "Newest", "Oldest", "Amount ↓", and "Amount ↑". Confirm correct ordering.
5. **CSV Export:**
   - Tap "CSV": verify generated CSV file opens (web) or triggers the system share sheet (mobile).
6. **Responsive Layout:**
   - Test on mobile view (compact cards).
   - Test on desktop/tablet view (`>= 720px` width) (table header and dense row layout).

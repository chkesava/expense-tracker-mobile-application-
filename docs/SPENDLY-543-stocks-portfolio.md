# SPENDLY-543: Phase 4b, Investments: Stocks portfolio

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-543-stocks-portfolio`.

This story covers the Stocks tab:
- `PortfolioDashboard` and `PortfolioSummaryCard` (the hero);
- `HoldingsList`, `HoldingCard` and `HoldingDetailModal`;
- `PortfolioCharts` and `TradingChargesCard`;
- the Watchlist, Alerts and Orders tabs.

It is UI only. Valuation (`buildHoldingsWithMetrics`, `buildPortfolioSummary`), XIRR, trade charges, quotes and every write path are unchanged. The trade/add/adjust/cash/import/recalibrate modals and onboarding are Phase 6.

## Changes
- **One colour source.** The new `components/portfolio/portfolioColors.ts` (`usePortfolioColors`) replaces the `accountScreenTheme` imports in five files and three diverging copies of the instrument palette. It provides:
  - instrument colours, from a data-viz ramp (stock = theme info);
  - a P&L tone from the theme's success/destructive tokens;
  - card, border, inset and hairline surfaces;
  - buy, sell, adjust and live/stale colours.
- **Hero.** `PortfolioSummaryCard` sits on the shared `HeroSection variant="deep"` (the dashboard's net-worth surface), replacing the fixed green card, glow and rings.
  - It shows "Stock portfolio · N holdings", the split hero figure, and today's change as a signed `FinancialAmount` with its percent.
  - Invested, Overall P&L, Cash balance (still opens Manage cash) and Holdings are unchanged in order.
  - The movers carry a "Today's movers" label.
- **Holding card.** Token surfaces, instrument dot and live dot. Signed P&L and today's change use `FinancialAmount` instead of `Amount prefix`.
- **List chrome.**
  - The sub-tabs and the instrument filters are outline `Chip` tabs, replacing `CARD_ORANGE` pills with `#111827` text.
  - Sort, CSV and "Add holding" use the theme accent.
  - The loading state is `DashboardSkeleton`.
- **Holding detail.**
  - Token card, dividers and avatar tint.
  - Buy and Sell use `success`/`destructive` with their foreground tokens, instead of `#00B386`/`#FF5A3D` with white text.
  - Order-history type colours come from the same tokens.
- **Watchlist / Alerts / Orders / Charts:**
  - the day change, alert status, pending status and sparkline colours come from theme tokens;
  - the percent sign is formatted properly;
  - the watchlist remove and alert pause/delete buttons have accessibility labels.

## Bugs fixed
- **Nested buttons on web.** Each holding card's "⋮" menu was a `<button>` inside the card `<button>`, which is invalid HTML and logged two console errors per load. The menu is now a sibling, positioned over a spacer, so the layout is unchanged.
- **Signs lost in ghost mode.** P&L and day changes used `Amount prefix="+₹"`, and `Amount` drops its prefix when hidden, so gains and losses both became "••••••". `FinancialAmount` keeps "+••••••" / "-••••••". This affected the hero, the holding cards, the detail rows and the quote change.
- **"+" replaced the currency symbol.** An adjustment's "Cost base" used `prefix="+"`, so it showed "+2,710" with no ₹.
- **Ghost-mode leaks.** Five order-history amounts in the holding detail (price, value, charges, net) and the trading-charges accessibility label ignored ghost mode.
- **"-0.00%".** The old `signedPercent` could print "-0.00%"; the shared `formatSignedPercent` never does.

## Not done
- **Gain/loss colouring wasn't seen on web.** The local emulator has no live quotes ("stock quote request failed"), so every P&L showed ₹0. It uses the same `FinancialAmount sign/tone="auto"` path that showed "−₹3,400 loss" correctly in SPENDLY-542.
- Alert thresholds still show the raw number without a currency (the tab has no currency prop).
- The Charts sub-tab only had its sparkline colour changed.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean; `npx vitest run` passed 5,538.
- **Web, local test mode** (seeded emulator with 3 holdings):
  - **Midnight Emerald 390 dp, Light 390 dp, Midnight Emerald 320 dp:** Stocks, holding detail, Watchlist, Orders and Alerts have 0 console errors (down from 2 nested-button errors), `scrollWidth` equals viewport width, there are no raw ISO dates, and there are no "+-" strings.
  - **Ghost mode:** 0 visible ₹ amounts on Stocks (138 hidden), holding detail (31), Watchlist, Orders and Alerts.
- Android and iOS have not been built.

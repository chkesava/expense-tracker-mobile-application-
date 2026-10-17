# SPENDLY-539: Phase 3b, Insights: Yearly analytics

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-539-insights-yearly`.

This story covers the Insights Yearly tab: `YearlyAnalyticsView` and `components/analytics/yearly/*` (annual overview, 12-month income vs spend, biggest transaction, insight tiles).

It is UI only. No calculation, hook, query or listener changed.

## Changes
- **Theme palette.** Every file in scope now uses the `useInsightSurface()` / `useInsightAccents()` hooks from 538 instead of `insightSurface(isDark)` / `insightAccents(isDark)`.
- **Red only means bad.**
  - Total Spent, Peak Spend, the Spend bars and the Highest Spend tile use `spend` (info) instead of pink or red.
  - Red stays on:
    - negative net savings;
    - a negative savings rate;
    - falling income;
    - an overview delta that moved the wrong way.
- **Hardcoded colours removed:**
  - The insight tiles take a theme colour (`tint`, previously an `"r, g, b"` string `tintRgb`) applied with `withAlpha`.
  - The income-vs-spend highlights derive their tint from the same colour as their text.
  - The biggest-transaction card's gold (`CARD_ORANGE` / `#B45309` and fixed rgba gradients) is now the theme `warning` highlight, over the theme card surface.

## Bugs fixed
- **Raw ISO date:** the biggest-transaction card showed "2026-08-16". It now follows the user's date format ("16 Aug 2026").

## Not done
- "Monthly Avg" and "Avg Monthly Spend" divide by 12 even mid-year. That is calculation, so it is out of scope for a UI story.
- Search & Lab and AI Advisor (540), Merchants and Fees (541). `insightSurface` / `insightAccents` remain only for the search components and `FilterSheetModal`.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean. `npx vitest run` passed 5,522.
  - No pure logic was added, so there are no new tests.
- **Web, local test mode** (seeded emulator, themes picked in Appearance), Yearly tab:
  - **Midnight Emerald 390 dp, Light 390 dp, Midnight Emerald 320 dp:** 0 console errors, `scrollWidth` equals viewport width, no raw ISO dates. The overview, chart, distribution, biggest transaction and tiles all render.
  - **Ghost mode (in-app navigation):** 0 visible ₹ amounts, 204 hidden.
- Android and iOS have not been built.

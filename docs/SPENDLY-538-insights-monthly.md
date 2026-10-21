# SPENDLY-538: Phase 3a, Insights shell and Monthly analytics

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-538-insights-monthly`.

This story covers the Insights hub shell (`app/(app)/insights.tsx`), the Analytics (monthly) tab (`MonthlyAnalyticsView` and `components/analytics/monthly/*`) and the shared analytics pieces (`AnalyticsCard`, `CategoryDistributionCard`, `PeriodSelector`).

It is UI only. No calculation, hook, query or listener changed.

## Changes
- **Theme-driven palette.** `insightsTheme.ts` gains `useInsightSurface()` and `useInsightAccents()`, which build on the theme tokens (`card`, `outlineVariant`, `surfaces.tile`/`wash`/`divider`).
  - The fixed green/pink/amber/violet palette becomes semantic accents:
    - `positive` = success
    - `spend` = info
    - `negative` = destructive
    - `highlight` = warning
    - `accent` = primary
  - Every screen and card in scope now uses the hooks. The old `insightSurface(isDark)` and `insightAccents(isDark)` stay for the Yearly and Search views until 539 and 540.
- **Red only means bad.** Spending (expense column, daily run-rate, day-of-week bars, weekday share, outliers, category totals) uses `spend` instead of pink. Red stays on the over-pace figure, negative net and the overspending alert.
- **Hardcoded hex/rgba removed:**
  - alert-card tones and tints;
  - header, export and tab icons;
  - the danger-tone card border;
  - outlier rows;
  - the period badge;
  - the category "others" slice;
  - the FAB icon.
- **Narrow screens:** `adjustsFontSizeToFit` is native-only, so on web at 320 dp the cash-flow figures truncated ("₹98,…"). Below 360 dp they now step down a size. This was also broken on main.

## Bugs fixed
- **Ghost-mode leak:** the Cash Flow "Budget: ₹55,000" meta was a plain formatted string. It now uses a ghostable `Amount`.
- **Raw ISO date:** high-ticket outlier rows showed "2026-10-03". They now follow the user's date format.

## Not done
- Yearly (539), Search & Lab and AI Advisor (540), Merchants and Fees (541).
- `DecisionsEntryCard` and `FeeInsightsEntryCard` already use the theme and were left alone.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean. `npx vitest run` passed 5,522.
  - No pure logic was added, so there are no new tests.
- **Web, local test mode** (seeded emulator). Themes were picked through Appearance, because the seeded user's synced `dark` theme overrides localStorage:
  - **Midnight Emerald 390 dp, Light 390 dp, Midnight Emerald 320 dp:** 0 console errors, `scrollWidth` equals viewport width, no raw ISO dates.
  - **Ghost mode (in-app navigation):** 0 visible ₹ amounts, 278 hidden.
- Android and iOS have not been built.

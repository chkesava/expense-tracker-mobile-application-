# SPENDLY-532: Phase 1 dashboard redesign (Midnight Emerald)

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-532-dashboard-redesign`, cut from `feature/SPENDLY-531-premium-redesign`.

This story is UI only. It changes no financial calculation, Firestore write path, listener or rule.

## What changed

| Area | Change | Files |
|---|---|---|
| Theme | New `midnight-emerald` preset with its own palette (`#080D0D` background, `#101A18` card, `#35E889` accent, `#78B8FF` info, `#FF7777` negative). It owns its accent, so the accent picker is replaced by a note while it's active. The light and dark presets are unchanged. | `theme/tokens.ts`, `theme/ThemeProvider.tsx`, `components/settings/sections/AppearanceSection.tsx`, `components/settings/PersonalizationPreviewCard.tsx` |
| Primitives | `HeroSection` gains a `deep` variant: the card surface with a faint accent wash, an accent hairline and normal ink. It's theme-derived, so it reads in every theme. There's also a `useHeroInk(variant)` helper. `TrendText` shows a muted "No change" for a 0% delta instead of a green ↑. | `components/dashboard/primitives.tsx` |
| Header | Greeting, title and month chip as before. The decorative wallet mark is replaced by the amount-privacy toggle (ghost mode), which moved here from Safe to Spend. Branding, search, inbox and profile stay in the global app bar and aren't repeated. | `DashboardWelcome.tsx` |
| Net-worth hero | Total net worth, assets and liabilities. All three are fields of the one `useUnifiedNetWorth({ progressive: true })` summary. The value counts up only when it changes (`startFromZero={false}`). The partial-balance (SPENDLY-413) and "Updating valuations…" notes are kept. | `NetWorthWidget.tsx` |
| Account cards | One card per kind of money in that same summary: bank & cash (always shown), credit cards, deposits, stocks, EPF (marked "Simulated" while unreconciled), money lent, loans and overdrafts. Each card shows only when its value is > 0, and opens its existing hub tab. Investment cards aren't tappable when the investments hub is off. Owed amounts carry a minus sign and an "Owed" caption, never colour alone. | `NetWorthWidget.tsx`, `shared/utils/dashboardAccountCards.ts` (+ test) |
| Income & expenses | Was "Quick Insights". It shows month income, spent, net cash flow with savings rate, month-over-month trends, and a six-month paired bar chart (the existing `BarChart`, lazily mounted). The chart data comes from the `useDashboardCashFlow` summaries the screen already subscribed to. When the month's summary doc is missing or its listener errors, the figures read "—" with an explanation instead of ₹0. | `QuickInsightsWidget.tsx`, `app/(app)/dashboard.tsx` |
| Quick actions | Four tiles: Expense, Income, Transfer, Pay card. They call the same modal openers as the add sheet (`setAddTransactionKind` + `setIsAddExpenseOpen`, `setIsTransferOpen`, `setIsDebtPaymentOpen`), so there's no new write path. A rail below holds "All actions" (the add sheet) plus the two shortcuts that aren't bottom-nav tabs (Split bills, Recurring). The Money and Insights chips were dropped because both are bottom-nav tabs. | `QuickAddWidget.tsx` |
| Safe to Spend | Moved onto the standard `Section` surface, so the net-worth card is the screen's one hero. Content and status vocabulary are unchanged. | `SafeToSpendWidget.tsx` |
| Recent activity | Category emoji glyph, date in the user's date format, account name (from the accounts already loaded), and a signed amount. "View all" now always shows when there are rows, because the feed is a limit-5 query and its old `length > 5` check could never be true. | `RecentActivityWidget.tsx` |
| Currency | New `signedCurrencyPrefix()`. `Amount`'s `prefix` *replaces* the symbol, so a bare `"-"` rendered "-112". The old Liabilities line had this bug too. | `shared/utils/formatCurrency.ts` (+ test) |

### Order
The net-worth hero (`overview`) and quick actions (`quickAdd`) are pinned first when they're enabled. Income & expenses follows them. Everything else keeps the user's saved order. The above-fold, not-lazy set is `overview`, `quickAdd` and `focus`.

## Data and read impact
- **No new listeners or queries.** The hero uses the same `useUnifiedNetWorth({ progressive: true })` call the old Net Worth card used. Secondary sources (cards, loans, stocks, EPF) still attach after startup idle.
- **The net-worth hooks mount slightly earlier.** The hero is no longer behind `LazyMount`. The old card was lazily mounted roughly 200 ms after first paint at its default position, so the same listeners now attach sooner. Read counts are the same.
- **No full-history query.** Recent activity is still `useRecentExpenses(5)`. The cash-flow chart uses the six materialized `financialSummaries/dashboard_*` docs.
- **The cash-flow gate is gone.** `cashFlow` used to be computed only when `overview` was in the order. It's now computed always, from the listener that was already always mounted.

## Validation
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run typecheck:shared`: clean.
- `npm test`: 360 files, 5,500 tests passed. New tests:
  - `theme/midnightEmerald.test.ts`: WCAG AA on every text/surface pair, accent ownership, and light/dark untouched.
  - `shared/utils/dashboardAccountCards.test.ts`
  - `signedCurrencyPrefix` cases.
  - `lib/navContrast.test.ts` now also covers the new theme, through `THEME_NAMES`.
- `npm run test:rules`: not run, because no rules changed.
- **Web, in local test mode** (`EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`, demo project, seeded emulator; never production):
  - Captured headless Chromium screenshots at 390 px and 320 px wide.
  - Checked Midnight Emerald, Light, the picker, the populated chart, and the missing-summary state.
  - A baseline on `main` code shows the same net-worth figures (₹2,05,220, liquid ₹0, no liabilities), so those come from the seed data, not the redesign.
- **Android / iOS:** not built or run on a device in this story. Device QA is still open (Spendly Test, `docs/LOCAL_TEST_MODE.md`).

## Findings (not fixed here; outside a UI-only story)
- **P2: the seed has no monthly summaries.** `scripts/seed-emulator.js` writes no `financialSummaries/dashboard_*` docs. On a fresh emulator, Safe to Spend, Monthly Budget and Category Budgets show ₹0 spent next to 128 seeded expenses. Income & expenses now says "aren't ready yet" instead, but the budget widgets still read the missing doc as zero.
- **P3: duplicate summary listeners.** The dashboard listens to `dashboard_<month>` and `dashboard_<prev>` separately, and also to the six-month range that already contains both. That's two redundant doc listeners.
- **P3: unused imports.** `app/(app)/dashboard.tsx` imports `cashFlowByMonth`, `oldestTrustedCashFlowMonth`, `trimToTrustedCashFlow` and `isInMonth` without using them. They pre-date this story.
- **P3: dev-only error on web.** It reports "Cannot manually set color scheme, as dark mode is type 'media'". `components/ui/gluestack-ui-provider` calls `setColorScheme` while `tailwind.config.js` uses `darkMode: 'media'`. Pre-existing.
- **P3: decorative overflow on web.** The `AuraBackground` blob extends about 60 px past the viewport. Pre-existing and invisible.

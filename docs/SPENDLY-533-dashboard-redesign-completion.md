# SPENDLY-533: Phase 1b, finishing the dashboard redesign

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-533-dashboard-redesign-completion`, cut from the epic after SPENDLY-532 merged.

This story picks up everything SPENDLY-532 left undone on the dashboard. It is UI only: no financial calculation, write path or rule changes, and no new listeners.

## Shared foundations (new)
| Piece | What it is |
|---|---|
| `components/dashboard/FinancialAmount.tsx` | Every dashboard amount goes through it. It sets the sign (`none`/`auto`/`minus`/`plus`, keeping the ₹ symbol), the tone, one size scale (`hero`…`xs`), fit-to-width, ghost mode, and an optional count that runs only when the value changes. |
| `components/dashboard/ProgressIndicator.tsx` | One progress row: a caption, a bar that grows when its value changes (instantly under reduced motion), and a status word (`good`/`watch`/`over`) so the status never rests on colour alone. |
| `components/dashboard/DashboardSkeleton.tsx` | Placeholders shaped like the cards they replace (`hero`, `cards`, `section`, `progress`). The net-worth card and recent activity use them. |
| `components/dashboard/DashboardEntrance.tsx` | A short fade with an 8 dp rise, staggered by position and capped at 225 ms. It runs once on mount. It's built from plain shared values, because Reanimated `entering` layout animations drew cards over their neighbours on web. |
| `theme/motion.ts` | Adds `entrance`, `entranceDelay`, `valueMotion` and `useMotionReduced()`, so animation timings live in one place. |

## Widgets redesigned on those foundations
- **Spending** (`TopCategoriesWidget`): category glyph, amount, share of the total, and a bar per category. There's a total row and a "Details" link to `/insights`.
- **Monthly Budget and Category Budgets** (`BudgetAlertsWidget`):
  - Monthly Budget: a progress bar whose status comes from `budget.status` and `budgetStatusMessage`, so it matches Safe to Spend, plus Spent, Remaining, Projected and Daily limit figures.
  - Category Budgets: one row per budget with spent / limit and "On track", "Close to limit" or "Over limit". They use the same data as before.
- **Financial Goals:** name, "By <date>" in the user's date format, saved of target, and a progress bar with "In progress" or "Goal reached".
- **Upcoming** (`SubscriptionsWidget`): the 7-day and monthly totals as real amounts instead of "INR 51,172" strings, then rows with a glyph, name, kind, signed amount and the due wording.
- **Smart Insights:** severity glyph plus a severity word on each row.
- **Financial Health:** an XP progress bar, a streak row, and badge chips with an earned check mark and screen-reader state.
- **Setup checklist:** "n of m" progress plus step rows with 48 dp targets. Same show/hide rules.
- **Recent activity:** expenses and incomes together, newest first. Incomes carry a "+", a green arrow and an "Income" caption, and can be opened for editing (the same `setEditingIncome` pair the ledger uses).

## Bottom navigation
- **Routes, tabs, haptics and the keyboard hide are unchanged.**
- **The active-tab lens follows the theme.** Midnight Emerald gets an emerald lens (`EMERALD_LENS`); every other theme keeps the SPENDLY-172 blue/purple lens exactly. `lib/navContrast.test.ts` now models each theme's own lens, still for every theme × accent.
- **Reduced motion:** the lens slide and the keyboard hide jump instead of animating.

## Reduced motion
These all respect the OS setting:
- the card entrance;
- `AnimatedCounter` (the number just changes);
- the `BarChart` grow and its tooltip fade;
- `ProgressIndicator` bars;
- the `Skeleton` pulse (a still placeholder instead);
- the nav lens and keyboard hide.

## Bugs fixed on the way
- **Soft-deleted rows on the dashboard.** Deletes only set `deletedAt`, and the limit-5 recent feed didn't filter them, so deleted expenses could show in Recent activity and be counted by Smart Insights. The dashboard now filters them with `activeLedgerRows`, and `mergeRecentActivity` drops deleted incomes as well.
- **Spending breakdown double-count.** Summaries store both `category` and `category::subcategory` keys, and the breakdown summed all of them, which doubled the total and listed subcategories as categories. `topCategoryShares` uses parent keys only, so the total now equals the month's spend (₹31,693 = ₹31,693 in QA). Budgets still read the `::` keys on purpose.
- **Ghost mode leak.** The breakdown subtitle printed the raw total even with amounts hidden. It now goes through `FinancialAmount`.
- **Screen readers.** `AnimatedCounter` used to announce "Amount 205220"; it now reads the formatted settled value.

## Removed
`components/dashboard/CircularProgress.tsx` and `components/onboarding/SetupStepItem.tsx`. Nothing imported them after the redesign; I checked every product.

## Data and read impact
- **No new listeners or queries.** Recent incomes come from the incomes `FinanceDataProvider` already loads app-wide.
- **Navigation:** two new links, both to existing routes: Spending → `/insights`, and Category Budgets "Manage" → `/settings/money` (shown only when there's no monthly budget card).

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean.
- `npm test`: 5,510 passed. New tests:
  - `shared/utils/recentActivity.test.ts`
  - `topCategoryShares` cases in `dashboardWidgets.test.ts`
  - theme-lens checks, with the nav contrast suite now modelling each theme's lens
- **Web, local test mode** against a freshly seeded emulator:
  - Checked Midnight Emerald and Light at 390 dp, and Midnight Emerald at 320 dp, with entrances on and with reduced motion emulated.
  - 0 page errors and 0 error-level console messages; page width equals viewport width.
  - A QA income added to the emulator showed as "+₹1,250" at the top of Recent activity.
- Android and iOS have not been built. Device QA is still open.

## Charts: SVG tap warnings fixed (follow-up)
`DonutChart` (Insights, category distribution) and `SpendingCurveChart` (Insights daily spending, account balance trend) put `onPress` on SVG shapes. On web, react-native-svg passes the responder props to DOM nodes, which logged "Unknown event handler property" errors. Neither chart is on the dashboard, but both are now fixed the same way as `BarChart`:
- **Donut:** the existing full-size centre Pressable is now the chart's one tap target.
  - A tap on the ring selects that slice; anywhere else clears the selection.
  - `donutSliceAt` maps the touch to a slice using distance from the centre plus the angle, clockwise from 12 o'clock, exactly as the slices are drawn.
  - The centre content is `pointerEvents="none"`, so the touch always measures from the chart's own box.
  - This also fixes a latent native bug: that `absoluteFill` overlay sat over the ring, so ring taps likely only ever cleared the selection.
  - The legend stays the accessible way to pick a slice.
- **Curve:** one Pressable over the plot selects the nearest day (`nearestPointIndex`), replacing 2–6 px dots that were no real touch target.
- **`pressPoint`:** native gives `locationX/Y`, but on web a Pressable's `onPress` gets the DOM click event with `offsetX/Y`. `pressPoint` reads whichever is present. Without it every web tap read as `NaN`.
- **Reduced motion:** both charts' zoom and fade entrances now respect it.
- **Tests:** `shared/utils/chartHitTest.test.ts`, 7 cases.
- **Verified on web** (emulator): on Insights and an account page there were 0 errors before and after taps. A tap on the ring at 12 o'clock selected "Food & Groceries ₹16,122, 51% of total", a centre tap cleared it, and a curve tap selected day 26. `npm test`: 5,517 passed.

## Known follow-ups
- **Missing goal target.** A goal with no target is treated as a target of 1 (pre-existing), so it would read "of ₹1".
- **Upcoming 7-day total.** It now always shows, as ₹0 when nothing is due; before, the subtitle hid it at zero.

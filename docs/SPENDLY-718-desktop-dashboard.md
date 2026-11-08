# SPENDLY-718 — Desktop dashboard redesign (web, ≥ 1280px)

Standalone Feature. Branch `feature/SPENDLY-718-desktop-dashboard`, cut from `main`.

Related work:
- SPENDLY-532: dashboard redesign.
- SPENDLY-566: Visual First and the mountain hero.
- SPENDLY-559: responsive web grid.
- SPENDLY-717: mobile web spacing, on main (PR #278). This branch is rebased onto it: phones keep 717's "Show more" split and Smart Insights placement, and `renderMoreItems` takes the Smart Insights position as a parameter.

Reference: `design/references/spendly-desktop-dashboard-reference.png` (1672 × 941). Its warm cream and orange are the existing **Sunset Orange** palette; the implementation only uses theme tokens.

## Root cause (measured)
Playwright on `main` against the emulator demo user (`docs/SPENDLY-718/before-*.jpg`):

| Viewport | Content x | Content width | Dead gutter each side |
|---|---|---|---|
| 1920 | 448 | 1256 | 216 |
| 1600 | 288 | 1256 | 56 |
| 1440 | 244 | 1184 | 0 |

There were five causes:
1. **Page cap.** `contentMaxWidthOf("expanded")` is 1280, but a 1920 monitor leaves a 1688px page column beside the 232px sidebar.
2. **Phone rows stretched to full width.** Net worth, quick actions (four 64px orbs with `space-between`), Spending Overview and Recent Transactions each filled the whole ~1256px row. The legend's percentages sat 900px from their labels.
3. **Blind masonry for everything else.** The remaining cards were dealt round-robin into three ~409px columns, which left ragged column bottoms.
4. **No two-pane top.** The 300px hero, the net-worth card and the banners stacked vertically, so only net worth and quick actions showed in the first 1080px.
5. **Bare sidebar.** It had no brand, no profile area and no appearance entry.

## What changed
At web ≥ 1280 the dashboard uses a desktop composition. It is built from the same hooks, the same widget components and the same handlers as the phone layout.

```
Sidebar 232 | compact header 196 (greeting · search · inbox · profile · today)
            | Net Worth (56%)            | Total Assets | Total Liabilities
            |                            | Quick actions
            | Spending Overview          | Income vs Expenses      (1:1 from 1440, 56:44 below)
            | Upcoming | Recent Transactions | Monthly Budget      (equal, stretched)
            | More cards (Category Budgets, Smart Insights, Safe to Spend, goals, …) in the existing grid
```

Below 1280 on web, and on all native, the existing tree renders unchanged. One exception: the desktop sidebar also shows from 1024 to 1279, so it gains its brand and footer there.

| File | Change |
|---|---|
| `shared/utils/responsiveLayout.ts` | `isDesktopDashboard` (web ≥ 1280) and a `dashboard` width variant capped at 1680 |
| `shared/utils/dashboardDesktop.ts` | Pure slotting (`planDesktopDashboard`), gap, analytics split, and the totals' change and tone |
| `hooks/useResponsiveLayout.ts` | Exposes `desktopDashboard`. `useContentWidthStyle` takes any variant |
| `app/(app)/dashboard.tsx` | Desktop branch. Shared pieces (notices, error, spending, recent, More items) are used by both branches |
| `components/dashboard/desktop/DesktopDashboardLayout.tsx` | Slot-only rows with no hooks or data. Equal-height cells; a missing slot re-flexes its row |
| `components/dashboard/hero/DashboardHero.tsx` | `desktop` variant: a 196px band with search field, inbox, profile and a today chip. No brand, since the sidebar has it |
| `components/layout/AppBarActions.tsx` | `searchField`: a wide search field with the same destination as the icon |
| `components/dashboard/NetWorthWidget.tsx` | `desktop` variant: the hero beside Assets and Liabilities, with quick actions as `aside`. One period state drives all three |
| `components/dashboard/NetWorthGlassCard.tsx` | `desktop` variant: segmented 1W–1Y control, a chart that fills the card, no footer. Controlled period. `trendWhen` exported |
| `components/dashboard/NetWorthTotalCard.tsx` | New. Total Assets and Total Liabilities with the period change |
| `components/dashboard/QuickAddWidget.tsx` | `panel` variant: a titled card with "View all", which opens the add sheet |
| `components/dashboard/SpendingOverviewCard.tsx` | `wide`: legend table with name, % and amount, and the three links in one row |
| `components/dashboard/QuickInsightsWidget.tsx` | `wide`: titled "Income vs Expenses", with the figures in a column beside a taller chart |
| `components/dashboard/BudgetAlertsWidget.tsx` | `part` (`all`/`primary`/`rest`), so the desktop lower row holds one budget card and Category Budgets move to the grid |
| `components/dashboard/primitives.tsx` | `Section fill`, so a card stretches to its row's height |
| `SubscriptionsWidget`, `RecentActivityWidget` | `fill` passthrough |
| `components/navigation/DesktopSidebar.tsx` | Brand on top. Footer: current palette (opens Settings › Appearance) and a profile row (opens the existing side drawer) |

### Decisions
- **Nav labels unchanged.** The user's decision was to keep the existing labels; the web build already renders "Dashboard" and "Analytics" through translations.
- **Totals' change.** It is `latest − baseline` of the stored `assets` and `liabilities` on the two snapshots that `netWorthTrend` already picks. No new calculation; the change and the net-worth line always describe one period.
  - Assets going up is shown as good, and liabilities going up as bad.
  - An arrow and a signed figure always come with the colour.
- **Budget split.** The desktop lower row shows Monthly Budget. Category Budgets are their own grid card, so the row isn't stretched to ~650px. With no monthly target, Category Budgets take the row slot instead. Nothing is hidden.
- **Theme selector.** The sidebar links to the existing palette picker rather than adding a second picker.

## Invariants kept
- **No data path changed.**
  - No new Firestore or Supabase read, listener or write.
  - `useUnifiedNetWorth` and `useDashboardCashFlow` stay mounted once, in the screen.
  - `useNetWorthHistory` and the recorder stay mounted once, in `NetWorthWidget`.
  - The read-model guards are unaffected.
- **No financial calculation changed.** Every figure is an existing summary field or `netWorthTrend` output.
- **Handlers and routes unchanged:**
  - Quick actions: expense and income open `AddTransactionModal`, transfer opens the transfer form, budget opens `/settings/money`.
  - "View all" opens `AddActionSheet`.
  - The totals open `/ledger?tab=accounts`.
  - Search opens `/ledger`.
- **Privacy mode** hides the totals, their change, the legend amounts and every existing figure.

## Verification
Local review, Expo web against the Firebase emulator (demo user), Playwright 1.x (scratchpad, not a repo dependency). Screenshots are in `docs/SPENDLY-718/`.

**Measured after (x, width):**

| Viewport | Net worth | Totals card | Quick actions | Analytics | Lower cards | Page scrollWidth |
|---|---|---|---|---|---|---|
| 1920 | 260, 903 | 345 | 709 | 806 + 806 | 3 × 531 | 1920 |
| 1600 | 256, 728 | 276 | 572 | 650 + 650 | 3 × 427 | 1600 |
| 1440 | 256, 641 | 244 | 503 | 572 + 572 | 3 × 376 | 1440 |
| 1280 | 256, 551 | 208 | 433 | 551 + 433 | 3 × 323 | 1280 |

- **Horizontal overflow:** none at 1920, 1600, 1440 or 1280.
  - At 1024 and 390, a few elements reach past the viewport inside horizontally scrolling content. `main` has the same counts (6 and 3), so this is pre-existing, and the page itself never scrolls sideways.
  - `main` also had such elements at 1440 and 1280, which the new layout removes.
- **Regression:** 1024, 768 and 390 match `main` (`before-390.jpg` / `after-390.jpg`). The only differences are emulator data that changed between runs, and the sidebar's new brand and footer at 1024.
- **Interactions (Playwright):**
  - Period segment selection, with `aria-checked`.
  - Privacy on and off.
  - Expense quick action opens Add Transaction; "View all" opens the Add sheet.
  - Total Assets opens accounts; Recent "See all" opens transactions.
  - Sidebar: Money, Appearance, and the profile drawer.
  - The search field opens `/ledger`.
  - Live resize 1279 ↔ 1280 switches layouts without a reload.
- **Palettes at 1920:** Midnight Slate, Forest and Cocoa; Ocean Blue, Sunset Orange, Rose Elegance and Midnight Sage. All correct; the run restored Midnight Slate.

**Commands:**

| Command | Result |
|---|---|
| `npx vitest run shared/utils/responsiveLayout.test.ts shared/utils/dashboardDesktop.test.ts shared/utils/dashboardWidgets.test.ts lib/dashboardEntrance.contract.test.ts shared/config/navigation.test.ts shared/utils/netWorthHistory.test.ts` | 107 / 107 pass, after the rebase onto main with SPENDLY-717 |
| `npm test` | 8237 / 8238 pass, after the rebase. The 1 failure is `cloudflare/push-trigger/trigger.test.ts` (PUSH_REMINDERS_ENABLED contract). It fails identically on `main` and is untouched here |
| `npm run typecheck:shared` | Exit 0, after the rebase |
| `npx tsc -p tsconfig.json --noEmit` | Exit 0, no errors, after the rebase |
| `npm run build:web:expense` | Exit 0 with production config (`.env.local` moved aside, so the emulator host is not inlined): 19.85 MB `expense` bundle |
| Lint | No lint script is configured |

## Limitations
- **Ultrawide.** Above ~1930px the content is capped at 1680 and centred, so the hero spans 1680 rather than the full window.
- **Search.** The header's search field opens the ledger, as the icon did. Spendly has no global search yet; **SPENDLY-721** (follow-up) builds it, with Ctrl/⌘K.
- **Sparse history.** With fewer than 3 saved net-worth days, the hero shows the existing "Trend appears after…" note and the totals say "No change history yet". The emulator demo user has 1 day, so the screenshots show that state.
- **Device and browser coverage.** No native device QA was needed, since the native tree is unchanged. Browser checks were Chromium only.

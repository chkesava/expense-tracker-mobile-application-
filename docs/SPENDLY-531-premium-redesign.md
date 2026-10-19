# SPENDLY-531: Spendly Premium Redesign (Midnight Emerald)

A phased premium-fintech redesign of the Expense app. It is UI only: no financial calculations, Firestore write paths, listeners or rules change. Ganesh Seva and Nutrition are out of scope.

Epic branch: `feature/SPENDLY-531-premium-redesign`, cut from `main`. Phase 1 (the dashboard) was merged to `main` in `85a83c0` on 2026-10-16. The epic stays open for later phases.

## Phases
| Phase | Screens | Stories | State |
|---|---|---|---|
| 1. Dashboard | Dashboard | SPENDLY-532, SPENDLY-533 | Done; on `main` (`85a83c0`) |
| 2. Money | Ledger hub and its sections, account / transaction / card-bill detail | SPENDLY-534 to SPENDLY-537 | Done; on `main` (`b0dc4de`) |
| 3. Analytics | Insights (monthly, yearly, search & lab, AI advisor), merchants, fees | SPENDLY-538 to SPENDLY-541 | Done; on `main` (`d6c9e4b`) |
| 4. Investments | Investments hub (deposits, portfolio, SIPs, EPF), EPF detail | SPENDLY-542 to SPENDLY-544 | Done; on `main` (`d6c9e4b`) |
| 5. Planning | Goal optimizer, financial calendar, runway, what-if, decisions | SPENDLY-545 to SPENDLY-547 | Done; on `main` (`742060d`) |
| 6. Vaults, settings and forms | Vaults/splits, settings, add-transaction and other forms, onboarding | SPENDLY-548 to SPENDLY-557 (see Phase 6 plan) | In progress: 557 (date picker) done on `main` |

## Stories
| Story | Title | Branch | State |
|---|---|---|---|
| SPENDLY-532 | Phase 1: dashboard redesign | `feature/SPENDLY-532-dashboard-redesign` | Done. On `main` via `85a83c0` (2026-10-16). Android/iOS device QA open. |
| SPENDLY-533 | Phase 1b: finish the dashboard (remaining widgets, nav lens, shared components, motion) | `feature/SPENDLY-533-dashboard-redesign-completion` | Done. On `main` via `85a83c0` (2026-10-16). Android/iOS device QA open. |
| SPENDLY-534 | Phase 2a: Money hub and Activity (header, section tabs, period summary, activity list) | `feature/SPENDLY-534-money-hub-activity` | Done. On `main` via `b0dc4de` (2026-10-17). |
| SPENDLY-535 | Phase 2b: Accounts and cards | `feature/SPENDLY-535-money-accounts-cards` | Done. On `main` via `b0dc4de` (2026-10-17). |
| SPENDLY-536 | Phase 2c: Debt, owed and recurring | `feature/SPENDLY-536-money-debt-owed-recurring` | Done. On `main` via `b0dc4de` (2026-10-17). |
| SPENDLY-537 | Phase 2d: Detail screens | `feature/SPENDLY-537-money-detail-screens` | Done. On `main` via `b0dc4de` (2026-10-17). |
| SPENDLY-538 | Phase 3a: Insights shell and Monthly analytics | `feature/SPENDLY-538-insights-monthly` | Done. On `main` via `d6c9e4b` (2026-10-17) ([doc](SPENDLY-538-insights-monthly.md)) |
| SPENDLY-539 | Phase 3b: Yearly analytics | `feature/SPENDLY-539-insights-yearly` | Done. On `main` via `d6c9e4b` (2026-10-17) ([doc](SPENDLY-539-insights-yearly.md)) |
| SPENDLY-540 | Phase 3c: Search & Lab and AI Advisor | `feature/SPENDLY-540-insights-search-advisor` | Done. On `main` via `d6c9e4b` (2026-10-17) ([doc](SPENDLY-540-insights-search-advisor.md)) |
| SPENDLY-541 | Phase 3d: Merchants and Fees | `feature/SPENDLY-541-merchants-fees` | Done. On `main` via `d6c9e4b` (2026-10-17) ([doc](SPENDLY-541-merchants-fees.md)) |
| SPENDLY-542 | Phase 4a: Investments hub, Deposits and Virtual SIPs | `feature/SPENDLY-542-investments-hub-deposits-sips` | Done. On `main` via `d6c9e4b` (2026-10-17) ([doc](SPENDLY-542-investments-hub-deposits-sips.md)) |
| SPENDLY-543 | Phase 4b: Stocks portfolio | `feature/SPENDLY-543-stocks-portfolio` | Done. On `main` via `d6c9e4b` (2026-10-17) ([doc](SPENDLY-543-stocks-portfolio.md)) |
| SPENDLY-544 | Phase 4c: EPF | `feature/SPENDLY-544-epf` | Done. On `main` via `d6c9e4b` (2026-10-17) ([doc](SPENDLY-544-epf.md)) |
| SPENDLY-545 | Phase 5a: Calendar and Runway | `feature/SPENDLY-545-calendar-runway` | Done. On `main` via `742060d` (2026-10-17) ([doc](SPENDLY-545-calendar-runway.md)) |
| SPENDLY-546 | Phase 5b: What-If and Goal optimizer | `feature/SPENDLY-546-what-if-optimizer` | Done. On `main` via `742060d` (2026-10-17) ([doc](SPENDLY-546-what-if-optimizer.md)) |
| SPENDLY-547 | Phase 5c: Money Decisions | `feature/SPENDLY-547-money-decisions` | Done. On `main` via `742060d` (2026-10-17) ([doc](SPENDLY-547-money-decisions.md)) |
| SPENDLY-557 | Phase 6: Date picker for every date field | `feature/SPENDLY-557-date-picker` (from `main`) | Done. Merged straight to `main` via `922f119` (2026-10-18, at the user's request) ([doc](SPENDLY-557-date-picker.md)) |
| SPENDLY-558 | Historical stock charts (line + candlestick) with multi-range caching | `feature/SPENDLY-558-stock-history-charts` | Done. Merged straight to `main` via `57553e0` (2026-10-19), at the user's request, so it skipped the epic branch. Still needed: a manual web deploy for `/api/stock-history`, a CDN `Cache-Status` check and device QA ([doc](SPENDLY-558-stock-history-charts.md)) |
| SPENDLY-559 | Responsive Expense screens: sidebar at ≥1024, capped page content, dashboard grid, dialog sheets on wide web | `feature/SPENDLY-559-responsive-web` | Done. Merged straight to `main` via `61ceb04` (2026-10-19, at the user's request). Native device QA open ([doc](SPENDLY-559-responsive-web.md)) |
| SPENDLY-560 | Bug: exact price tooltip on stock chart points (hover, tap, keyboard; line and candle) | `feature/SPENDLY-560-stock-chart-tooltip` | Done. Merged straight to `main` via `c2b9347` (2026-10-19, at the user's request). Native device QA open ([doc](SPENDLY-560-stock-chart-tooltip.md)) |
| SPENDLY-548 | Phase 6a: Form foundations (Input theme font, SearchBar focus ring, form sheet pattern) | `feature/SPENDLY-548-form-foundations` | Merged into the epic; not on `main` yet ([doc](SPENDLY-548-form-foundations.md)) |

## Phase 4 plan: Investments (2026-10-17)
The Investments hub is `app/(app)/investments.tsx`, with four tabs: Investments (deposits), Stocks, Virtual SIPs and EPF. There is also the EPF establishment screen `app/(app)/epf/[establishmentId].tsx`. Together that is about 13.5k lines.

Phase 4 is UI only, like Phases 1–3:
- no calculation, valuation, XIRR, interest, EPF-ledger or write-path changes;
- add/edit/trade/transfer forms stay for Phase 6;
- forms that leak amounts in ghost mode still get that bug fixed here, as was done for the fee review sheet.

**What the survey found:**
- **Fixed colours:** the Stocks components (`HoldingCard`, `HoldingDetailModal`, `PortfolioSummaryCard`, `PortfolioDashboard`, `HoldingsList`) and `InvestmentCard` have most of the fixed hex/rgba colours. Five Stocks files still import `accountScreenTheme`.
- **Ghost-mode leaks:**
  - EPF formats every amount as a string with local `formatAmount` helpers (11 sites), so almost all of EPF ignores ghost mode. Only `EpfPortfolioCard` is ghostable.
  - Virtual SIPs (`SipSummaryCard`, `SipVirtualPositions`, `SipHistoryList`: 11 `Amount`s) and deposits (`InvestmentCard`, `InvestmentsList`, `InvestmentDetailModal`) render `Amount` without `ghostable`.
- **Hub:** the tab icons use `success` instead of the theme accent.

| Story | Scope | Main fixes |
|---|---|---|
| SPENDLY-542 (4a): Hub, Deposits and Virtual SIPs | Hub header and tabs; `InvestmentsList`, `InvestmentCard`, `InvestmentDetailModal`; `SipDashboard`, `SipSummaryCard`, `SipVirtualPositions`, `SipHistoryList` | Theme accent on the tabs; deposits and SIP summaries on `Section`/`DataRow`/`FinancialAmount`; ghost leaks; hex removed; maturity and SIP dates formatted |
| SPENDLY-543 (4b): Stocks portfolio | `PortfolioDashboard`, `PortfolioSummaryCard` (hero), `PortfolioCharts`, `HoldingsList`, `HoldingCard`, `HoldingDetailModal`, `TradingChargesCard`, Watchlist/Alerts/Orders tabs | Off `accountScreenTheme`; gain/loss as signed amounts with words, not colour alone; red only for losses; the remaining ghost leaks |
| SPENDLY-544 (4c): EPF | `EpfDashboard`, profile/portfolio/establishment/current-month cards, `EpfBalanceTab`, contribution history and rows, transfers list and detail, `epf/[establishmentId]` | `useGhostMoney` for every EPF amount string (and the privacy fix in the EPF sheets); dates; foundations for the cards and rows |

Out of scope for Phase 4 (left for Phase 6): `CreateInvestmentModal`, `AddHoldingModal`, `HoldingAdjustmentModal`, `ManageStockCashModal`, `MockTradeModal`, `CsvImportModal`, `PortfolioRecalibrationModal`, `OnboardingFlow`, `SipPlanFormModal`, `SipNotificationsModal` and the EPF form modals/sheets.


## Phase 5 plan: Planning (2026-10-17)
Phase 5 covers about 4.5k lines across five areas:
- the financial calendar (`app/(app)/calendar`, `components/calendar`);
- runway (`app/(app)/runway`, `components/runway`);
- what-if (`app/(app)/what-if`, `components/whatIf`);
- the goal-funding optimizer (`app/(app)/goals/optimizer.tsx`, `components/goals`);
- Money Decisions (`app/(app)/decisions`, `components/decisions`).

The goals list itself is under Settings, so it belongs to Phase 6.

Like Phases 1–4, Phase 5 is UI only:
- no calendar, runway, what-if, optimizer or decision calculation or write-path changes;
- the editor sheets and forms (`ReminderEditorSheet`, `WhatIfChangeSheet`, `GoalPlanInputsSheet`, `decisions/edit.tsx`) stay for Phase 6, apart from privacy and currency bugs.

**What the survey found:**
- **Colours and building blocks.** There are almost no fixed colours (one hex in runway) and no old palette imports. The screens are mostly hand-built Views with local styles on `PageShell`/`PageHeader`; only four use `Section`.
- **Ghost mode is ignored throughout.** Amounts are formatted as strings by local `fmt`/`money` helpers on every Planning screen: the optimizer, calendar, runway and runway sources, what-if result/edit and `WhatIfResults`, and the decision outcome/alternatives/linked records. None of it masks in ghost mode.
- **Hardcoded INR.** Three decision views format with a hardcoded `"INR"` instead of the display currency: `AlternativeWorkspaceCard`, `DecisionOutcomeSection` and the expected amount in `decisions/[id]`.
- **Raw ISO dates in Decisions:** review dates, "by" dates, outcome dates, commitment target dates and the list's follow-up dates.

| Story | Scope | Main fixes |
|---|---|---|
| SPENDLY-545 (5a): Calendar and Runway | `calendar/index`, `CalendarMonthGrid` and the agenda/detail views; `runway/index`, `runway/sources`, `RunwaySourceRow` | `useGhostMoney` for every amount; month grid and agenda on the foundations; the runway headline as a hero; the one hex removed |
| SPENDLY-546 (5b): What-If and Goal optimizer | `what-if/index`, `[id]`, `WhatIfResults`; `goals/optimizer` and the goal-funding components | Ghost-aware results and comparisons; scenario cards and results on `Section`/`DataRow`/`FinancialAmount`; signed deltas |
| SPENDLY-547 (5c): Money Decisions | `decisions/index`, `[id]`, `compare`, `insights` and `components/decisions/*` | The display currency instead of `"INR"`; ghost-aware outcome/alternative/linked amounts; every decision date in the user's format; list and detail on the foundations |

Out of scope (Phase 6): `decisions/edit.tsx`, `what-if/edit.tsx` (beyond its ghost fix), and the reminder, what-if change and goal plan-input sheets. Calendar notification text is native notification content, not screen UI, so it is unchanged.


## Phase 6 plan: Vaults, settings, forms and onboarding (2026-10-17)
Phase 6 is the last and largest phase, about 37k lines:
- **Vaults and sharing:** vaults, spaces, splits, trips and the public pay links, about 11k lines.
- **Settings:** about 3.5k lines.
- **Forms:** about 45 modals and sheets, about 20k lines, including every form deferred from Phases 2–5.
- **Onboarding and sign-in:** about 2.9k lines.

Like Phases 1–5 it is UI only: no transaction, transfer, reconciliation, valuation, SIP, EPF, split/claim, settings-sync or auth write-path changes.

**What the survey found:**
- **Shared form problems:**
  - The shared `Input` renders labels in a serif font on web. It is used by 113 files, 36 of them in Ganesh Seva and Nutrition.
  - `SearchBar` shows a square focus outline on web (24 callers).
  - 33 date inputs make the user type `YYYY-MM-DD`.
- **Ghost-mode leaks:** about 70 `Amount`s render without `ghostable`, plus a few plain `formatAmount` calls. The investment forms (24), splits/trips/pay links (20) and vaults/spaces (14) have the most.
- **Old palette:** about 360 hardcoded hex/rgba colours. 10 files still import `accountScreenTheme`: settings 4, account forms 5, debt forms 1.
- **Shared with other products:** sign-in (`app/(auth)/login.tsx`, `SpendlyLogo`) is reached from the product chooser, and `Input`/`SearchBar` are used by Ganesh Seva and Nutrition. Changes there must be scoped to Expense or be improvements only.

| Story | Scope | Main work |
|---|---|---|
| SPENDLY-548 (6a): Form foundations | Shared `Input`, `SearchBar`, the form sheet pattern | Theme font for labels; focus ring; multi-app check. **First: 6e–6h depend on it.** |
| SPENDLY-557: Date picker | A shared `DateField` + picker for every Expense date field (about 38 files typing `YYYY-MM-DD` today) | Shows the user's date format, stores the same `YYYY-MM-DD`; recommended as an in-house JS picker sheet (no native dependency, works over the air). 6e–6h use it. |
| SPENDLY-549 (6b): Vaults and Spaces | `vaults.tsx`, `components/vaults/*`, `components/spaces/*` | Foundations, tokens, ghost mode |
| SPENDLY-550 (6c): Splits, Trips and public pay pages | `components/splits/*`, `trips/*`, `collect/*`, `app/split/[slug]`, `app/payment/[slug]` | Foundations, tokens; ghost mode in-app only (public pages are for the payer) |
| SPENDLY-551 (6d): Settings | Settings hub, sections, controls, notification settings | Off `accountScreenTheme`; one switch style; outline chips |
| SPENDLY-552 (6e): Add transaction and account forms | `add.tsx`, `AddTransactionModal`, `ExpenseForm`, account modals | Form pattern, date field, display-currency symbol; write paths untouched |
| SPENDLY-553 (6f): Debt, recurring and card-bill forms | Borrowings, receivables, subscriptions, card-bill modals | Form pattern, tokens, ghost mode |
| SPENDLY-554 (6g): Investment forms | Investment, portfolio, SIP and EPF modals/sheets | Form pattern; the 24 ghost leaks |
| SPENDLY-555 (6h): Planning forms | Reminder, runway settings, what-if, goal plan and decision editors | Form pattern and date field; the optimizer's ISO screen-reader date |
| SPENDLY-556 (6i): Onboarding, welcome, sign-in, delete account | `welcome`, `onboarding`, `(auth)/login`, `components/auth/*`, `delete-account` | Expense-only visual pass; Nutrition and Ganesh sign-in unchanged |

**Suggested order:** SPENDLY-557 (date picker) is done; 6a next, then 6d and 6b/6c (screens), then 6e–6h (forms), then 6i.

## Decisions
- **Midnight Emerald is a selectable preset, not a forced default.** It's in Settings → Appearance → Custom Presets. Existing users keep their theme.
- **The preset owns its accent.** The accent picker is replaced by a note while it's active.
- **Redesigned components use theme tokens only**, so they work in light, dark and Midnight Emerald.
- **One hero per screen.** On the dashboard it's net worth, using the `HeroSection` `deep` variant. Safe to Spend moved to a standard section.
- **Account cards are a pure selection** of `useUnifiedNetWorth` fields (`shared/utils/dashboardAccountCards.ts`). The UI never re-derives net worth.
- **No fabricated values.** A missing or errored monthly summary shows "—" with an explanation, not ₹0. No trends are shown without real prior-period data.
- **The web colour-scheme fix is a `patch-package` patch** (`patches/react-native-css-interop+0.2.6.patch`, applied on `postinstall`), not `darkMode: 'class'`, so the shared `Button`/`Input` keep their `dark:` variants on web. Re-check the patch on any NativeWind upgrade.
- **Dashboard amounts, progress bars, skeletons and entrances each have one component** (`FinancialAmount`, `ProgressIndicator`, `DashboardSkeleton`, `DashboardEntrance`), and timings live in `theme/motion.ts`. Every decorative animation checks `useMotionReduced()`.
- **The entrance avoids Reanimated `entering` layout animations**, which overlapped cards on web; it uses plain shared values instead.
- **The nav lens is theme-aware**, but only Midnight Emerald differs; the SPENDLY-172 lens is unchanged elsewhere.
- **Later phases reuse these foundations**: the theme preset, `HeroSection` `deep`, `Section`, the dashboard tokens, and `signedCurrencyPrefix`.
- **Stock history is cached on Netlify's durable CDN, not in a new service** (SPENDLY-558). `/api/stock-history` keys on `symbol|range` only, and there's a per-instance LRU for stale-if-error. Market history never touches Firestore. The chart is hand-drawn `react-native-svg`, with no chart library.
- **Expense web is responsive by viewport width, web-only** (SPENDLY-559). The breakpoints live in `shared/utils/responsiveLayout.ts`: compact <768, medium 768–1023, expanded ≥1024. Native always gets compact. At expanded, a left sidebar replaces the bottom nav. `PageShell` caps content (`wide` 960/1280, `readable` 720). Dashboard widgets use the `ResponsiveGrid` masonry. Spendly sheets become centred dialogs above compact, scoped to the Spendly shell so Ganesh and Nutrition are unchanged.

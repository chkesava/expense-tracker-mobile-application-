# SPENDLY-531: Spendly Premium Redesign (Midnight Emerald)

A phased premium-fintech redesign of the Expense app. It is UI only: no financial calculations, Firestore write paths, listeners or rules change. Ganesh Seva and Nutrition are out of scope.

Epic branch: `feature/SPENDLY-531-premium-redesign`, cut from `main`. Phase 1 (the dashboard) was merged to `main` in `85a83c0` on 2026-10-16. The epic stays open for later phases.

## Phases
| Phase | Screens | Stories | State |
|---|---|---|---|
| 1. Dashboard | Dashboard | SPENDLY-532, SPENDLY-533 | Done; on `main` (`85a83c0`) |
| 2. Money | Ledger hub and its sections, account / transaction / card-bill detail | SPENDLY-534 to SPENDLY-537 | Done; on `main` (`b0dc4de`) |
| 3. Analytics | Insights (monthly, yearly, search & lab, AI advisor), merchants, fees | SPENDLY-538 to SPENDLY-541 | Done on the epic, not on main |
| 4. Investments | Investments hub (deposits, portfolio, SIPs, EPF), EPF detail | SPENDLY-542 to SPENDLY-544 | In progress |
| 5. Planning | Goals, financial calendar, runway, what-if, decisions | not yet created | Planned |
| 6. Vaults, settings and forms | Vaults/splits, settings, add-transaction and other forms, onboarding | not yet created | Planned |

## Stories
| Story | Title | Branch | State |
|---|---|---|---|
| SPENDLY-532 | Phase 1: dashboard redesign | `feature/SPENDLY-532-dashboard-redesign` | Done. On `main` via `85a83c0` (2026-10-16). Android/iOS device QA open. |
| SPENDLY-533 | Phase 1b: finish the dashboard (remaining widgets, nav lens, shared components, motion) | `feature/SPENDLY-533-dashboard-redesign-completion` | Done. On `main` via `85a83c0` (2026-10-16). Android/iOS device QA open. |
| SPENDLY-534 | Phase 2a: Money hub and Activity (header, section tabs, period summary, activity list) | `feature/SPENDLY-534-money-hub-activity` | Done. On `main` via `b0dc4de` (2026-10-17). |
| SPENDLY-535 | Phase 2b: Accounts and cards | `feature/SPENDLY-535-money-accounts-cards` | Done. On `main` via `b0dc4de` (2026-10-17). |
| SPENDLY-536 | Phase 2c: Debt, owed and recurring | `feature/SPENDLY-536-money-debt-owed-recurring` | Done. On `main` via `b0dc4de` (2026-10-17). |
| SPENDLY-537 | Phase 2d: Detail screens | `feature/SPENDLY-537-money-detail-screens` | Done. On `main` via `b0dc4de` (2026-10-17). |
| SPENDLY-538 | Phase 3a: Insights shell and Monthly analytics | `feature/SPENDLY-538-insights-monthly` | Merged into the epic ([doc](SPENDLY-538-insights-monthly.md)) |
| SPENDLY-539 | Phase 3b: Yearly analytics | `feature/SPENDLY-539-insights-yearly` | Merged into the epic ([doc](SPENDLY-539-insights-yearly.md)) |
| SPENDLY-540 | Phase 3c: Search & Lab and AI Advisor | `feature/SPENDLY-540-insights-search-advisor` | Merged into the epic ([doc](SPENDLY-540-insights-search-advisor.md)) |
| SPENDLY-541 | Phase 3d: Merchants and Fees | `feature/SPENDLY-541-merchants-fees` | Merged into the epic ([doc](SPENDLY-541-merchants-fees.md)) |
| SPENDLY-542 | Phase 4a: Investments hub, Deposits and Virtual SIPs | `feature/SPENDLY-542-investments-hub-deposits-sips` | Merged into the epic ([doc](SPENDLY-542-investments-hub-deposits-sips.md)) |
| SPENDLY-543 | Phase 4b: Stocks portfolio | `feature/SPENDLY-543-stocks-portfolio` | In progress |
| SPENDLY-544 | Phase 4c: EPF | not cut yet | To do |

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

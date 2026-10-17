# SPENDLY-531: Spendly Premium Redesign (Midnight Emerald)

A phased premium-fintech redesign of the Expense app. It is UI only: no financial calculations, Firestore write paths, listeners or rules change. Ganesh Seva and Nutrition are out of scope.

Epic branch: `feature/SPENDLY-531-premium-redesign`, cut from `main`. Phase 1 (the dashboard) was merged to `main` in `85a83c0` on 2026-10-16. The epic stays open for later phases.

## Phases
| Phase | Screens | Stories | State |
|---|---|---|---|
| 1. Dashboard | Dashboard | SPENDLY-532, SPENDLY-533 | Done; on `main` (`85a83c0`) |
| 2. Money | Ledger hub and its sections, account / transaction / card-bill detail | SPENDLY-534 to SPENDLY-537 | Done; on `main` (`b0dc4de`) |
| 3. Analytics | Insights (monthly, yearly, search & lab, AI advisor), merchants, fees | SPENDLY-538 to SPENDLY-541 | In progress |
| 4. Investments | Investments hub (deposits, portfolio, SIPs, EPF), EPF detail | not yet created | Planned |
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
| SPENDLY-540 | Phase 3c: Search & Lab and AI Advisor | not cut yet | To do |
| SPENDLY-541 | Phase 3d: Merchants and Fees | not cut yet | To do |

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

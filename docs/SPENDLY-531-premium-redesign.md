# SPENDLY-531: Spendly Premium Redesign (Midnight Emerald)

A phased premium-fintech redesign of the Expense app. It is UI only: no financial calculations, Firestore write paths, listeners or rules change. Ganesh Seva and Nutrition are out of scope.

Epic branch: `feature/SPENDLY-531-premium-redesign`, cut from `main`.

| Story | Title | Branch | State |
|---|---|---|---|
| SPENDLY-532 | Phase 1: dashboard redesign | `feature/SPENDLY-532-dashboard-redesign` | Implemented and committed; awaiting approval to merge into the epic. Device QA open. |

## Decisions
- **Midnight Emerald is a selectable preset, not a forced default.** It's in Settings → Appearance → Custom Presets. Existing users keep their theme.
- **The preset owns its accent.** The accent picker is replaced by a note while it's active.
- **Redesigned components use theme tokens only**, so they work in light, dark and Midnight Emerald.
- **One hero per screen.** On the dashboard it's net worth, using the `HeroSection` `deep` variant. Safe to Spend moved to a standard section.
- **Account cards are a pure selection** of `useUnifiedNetWorth` fields (`shared/utils/dashboardAccountCards.ts`). The UI never re-derives net worth.
- **No fabricated values.** A missing or errored monthly summary shows "—" with an explanation, not ₹0. No trends are shown without real prior-period data.
- **Later phases reuse these foundations**: the theme preset, `HeroSection` `deep`, `Section`, the dashboard tokens, and `signedCurrencyPrefix`.

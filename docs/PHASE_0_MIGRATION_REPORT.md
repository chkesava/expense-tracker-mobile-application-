# Phase 0 Migration Report — Shared Contracts

> **Date:** 2026-08-04  
> **Scope:** Phase 0 only (`MOBILE_MIGRATION_PLAN.md`)  
> **Target:** `expense-tracker-mobile/shared/`  
> **Constraints honored:** No React Native UI, Firebase, Expo Router, navigation runtime, screens, or components.

## Summary

| Metric | Count |
|--------|------:|
| Files migrated (into `shared/`) | 56 |
| Unit test files ported | 8 |
| Tests passing | 38 / 38 |
| `tsc -p tsconfig.shared.json` | Pass |
| Files skipped (out of Phase 0 / non-pure) | 9 |
| Files adapted (manual changes) | 8 |

**Commands:**

```bash
npm run typecheck:shared   # tsc -p tsconfig.shared.json
npm test                   # vitest run (shared/**/*.test.ts)
```

---

## Folder layout

```
shared/
  index.ts                 # Barrel (namespaces portfolio/sip schemas & types)
  types/                   # Domain TypeScript types
  data/                    # Category taxonomy
  config/                  # Navigation constants (path IDs only)
  utils/                   # Pure / adapted helpers
  storage/memoryStorage.ts # In-memory KV (localStorage replacement)
  features/
    portfolio/{types,schemas}/
    sip/{types,schemas}/
```

---

## Files migrated

### Types (`shared/types/`)

| File | Notes |
|------|-------|
| `expense.ts` | Categories, accounts, expenses, incomes, budgets, goals, rules |
| `focus.ts` | Focus session types |
| `investment.ts` | Classic FD / interest / MF types |
| `market.ts` | Quote DTOs + `computePositionMetrics` |
| `market.test.ts` | Ported |
| `nutrition.ts` | Nutrition domain |
| `paymentRequest.ts` | Depends on `qrStyles` `QrStyleId` |
| `split.ts` | Splits |
| `stats.ts` | Gamification stats / badges |
| `subscription.ts` | Recurring defs |
| `trip.ts` | Trips |
| `user.ts` | Profile / role |
| `vault.ts` | Shared vaults |
| `vaultExpense.ts` | Vault expenses |

### Data & config

| File | Notes |
|------|-------|
| `data/categoryTaxonomy.ts` | Full taxonomy + suggest/map helpers |
| `data/categoryTaxonomy.test.ts` | Import path fixed to `./categoryTaxonomy` |
| `config/navigation.ts` | `CORE_NAV_ITEMS`, `ADMIN_NAV_ITEM`, `isNavItemActive` (web path strings retained as contracts) |

### Feature types & Zod schemas

| File | Notes |
|------|-------|
| `features/portfolio/types/index.ts` | Holdings, orders, alerts, etc. |
| `features/portfolio/schemas/index.ts` | Zod forms (onboarding, holdings, buy/sell, alerts) |
| `features/sip/types/index.ts` | SIP plans / txs / virtual portfolio |
| `features/sip/schemas/index.ts` | Zod SIP plan form |
| `features/sip/schemas/index.test.ts` | Ported |

### Utils (`shared/utils/`)

| File | Status |
|------|--------|
| `formatCurrency.ts` (+ test) | Migrated |
| `dates.ts` | Migrated |
| `accountBalance.ts` (+ test) | Migrated |
| `accountKind.ts` | Migrated |
| `billingCycle.ts` | Migrated |
| `investmentInterest.ts` (+ test) | Migrated |
| `analytics.ts` | Migrated |
| `rangeAnalytics.ts` (+ test) | Migrated |
| `monthSummary.ts` | Migrated |
| `weeklySummary.ts` | Migrated |
| `monthlyComparison.ts` | Migrated |
| `incomeSummary.ts` | Migrated |
| `insightMetrics.ts` | Migrated |
| `insights.ts` | **Adapted** — `getUsageColor` returns semantic tokens |
| `smartSummary.ts` | Migrated |
| `categoryInsights.ts` (+ test) | Migrated |
| `grouping.ts` | Migrated (unused on web; barrel alias `groupExpensesByRecency`) |
| `groupByDay.ts` | Migrated (chart rows; barrel keeps `groupByDay`) |
| `dayGrouping.ts` | Migrated (`groupExpensesByDay`) |
| `upi.ts` | **Adapted** — `isMobile` safe without `window` |
| `paymentSlug.ts` | Migrated |
| `paymentRequestUrl.ts` | **Adapted** — `EXPO_PUBLIC_APP_URL` / `VITE_PUBLIC_APP_URL` |
| `paymentRequestPath.ts` | **Adapted** — regex instead of `react-router` `matchPath` |
| `qrStyles.ts` | **Adapted** — styles pure; persistence via `memoryStorage` |
| `categoryPreferences.ts` | **Adapted** — presets pure; recent pairs via `memoryStorage` |
| `magicParser.ts` | Migrated |
| `proactiveSplits.ts` | Migrated |
| `chartColors.ts` | **Adapted** — portable `COLORS` / `chartTokens` (no DOM CSS reads) |

### Storage

| File | Notes |
|------|-------|
| `storage/memoryStorage.ts` | **New** — injectable KV for Phase 0; swap for MMKV later |

### Tooling

| File | Notes |
|------|-------|
| `vitest.config.ts` | Includes `shared/**/*.test.ts` |
| `tsconfig.shared.json` | Strict typecheck for `shared/` only |
| `package.json` | Scripts: `test`, `test:watch`, `typecheck:shared`; devDeps: `vitest`, `@types/node` |

---

## Files skipped

| Source (web) | Reason |
|--------------|--------|
| `src/utils/ensureCategoryHierarchy.ts` | Firebase Firestore — Phase 2+ |
| `src/utils/seedData.ts` | Firebase writes — Phase 2+/dev |
| `src/utils/lazyWithRetry.ts` | React `lazy` + `window.location` — UI bundler concern |
| `src/utils/scheduleIdle.ts` | `requestIdleCallback` / `window` — Phase 11+ |
| `src/utils/csvExport.ts` | Empty file on web |
| `src/utils/exportCsv.ts` | DOM download (`document.createElement`) — Phase 15+ |
| `src/utils/nutritionExport.ts` | jsPDF + DOM — Phase 22+ |
| `src/features/portfolio/schemas/index.test.ts` | Did not exist on web |
| Web-only env `.env*` | Secrets / project config — not contracts |

---

## Files needing manual review

| File | Why |
|------|-----|
| `shared/config/navigation.ts` | Still uses web URL paths (`/dashboard`, `/ledger`, …). Remap to Expo Router hrefs in Phase 5; constants are intentionally stable IDs for now. |
| `shared/utils/qrStyles.ts` | `frame` / `header` / `swatch` still hold Tailwind class strings — need RN style tokens when building payment UI (Phase 14). |
| `shared/utils/insights.ts` | `getUsageColor` API changed from Tailwind class strings → `"destructive" \| "warning" \| "success"`. Call sites must map tokens to styles. |
| `shared/utils/chartColors.ts` | DOM CSS-variable resolution removed. Theme-aware palettes should inject overrides via `chartTokens(overrides)` in Phase 1/15. |
| `shared/utils/paymentRequestUrl.ts` | Requires `EXPO_PUBLIC_APP_URL` at runtime for non-empty share URLs. |
| `shared/utils/categoryPreferences.ts` / `qrStyles.ts` | Persistence uses in-memory storage until Phase 1 wires MMKV via `setSharedStorage`. |
| `shared/utils/grouping.ts` vs `groupByDay.ts` | Duplicate export name `groupByDay` with different semantics. Barrel exposes `groupExpensesByRecency` + `groupByDay`. Prefer path imports during port. |
| `shared/index.ts` | Portfolio/SIP types exported as namespaces (`portfolioTypes`, `sipSchemas`) to avoid symbol collisions with domain `market` types. |

---

## Acceptance criteria (Phase 0)

- [x] Types compile without web-only imports (`window`, `document`, Vite `import.meta.env` as hard deps).
- [x] Pure util unit tests pass (`npm test` → 38 passed).
- [x] No Firebase, React Navigation, or UI packages required by `shared/`.
- [x] Taxonomy and `CATEGORIES` / `INCOME_SOURCES` match web sources.

---

## Explicit non-goals completed / avoided

- No screens, components, Expo Router routes, or Firebase init added under Phase 0.
- Existing Expo template (`app/`, `components/`) left untouched aside from package scripts/deps for testing.

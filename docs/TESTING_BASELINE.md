# Testing Baseline (Phase 0)

**Branch:** `docs/testing-master-plan` (from `origin/main` @ `adcace0`, app `v1.1.1` / build 31)  
**Phase:** 0 — Testing Infrastructure & Baseline Freeze  
**Date recorded:** 2026-08-11  
**Status:** Frozen for Phase 1 entry

Companion docs: `TESTING_MASTER_PLAN.md`, `TESTING_PHASE_CHECKLIST.md`, `TEST_BUG_DISCOVERY_LOG.md`.

---

## 1. Baseline commands (today)

| Command | Purpose | Phase 0 / current result |
|---------|---------|--------------------------|
| `npm test` | Vitest run (`vitest run`) | Phase 4: **42 / 211**. Phase 5: **45 / 220 PASS** |
| `npm run test:watch` | Vitest watch | Available |
| `npm run typecheck:shared` | `tsc -p tsconfig.shared.json` | **PASS after Phase 0 config fix** (was failing: missing `@/` paths + `window`) |
| `npm run typecheck` | Full app `tsc --noEmit` | **FAIL (known debt)** — see §5 |
| `npm run release:verify` | Release preflight | Not required for Phase 0 |

Do **not** point tests at production Firebase.

---

## 2. Vitest configuration (frozen)

File: `vitest.config.ts`

| Setting | Value |
|---------|--------|
| Environment | `node` |
| Include globs | `shared/**/*.test.ts`, `services/**/*.test.ts`, `lib/**/*.test.ts` |
| Alias | `@` → repo root |

**Note:** SMS (`services/sms/**`) is still absent on `main`; Phase 3 will add those tests when SMS merges.

### Baseline test inventory (22 files)

```
shared/config/navigation.test.ts
shared/data/categoryTaxonomy.test.ts
shared/features/sip/schemas/index.test.ts
shared/types/market.test.ts
shared/types/settings.test.ts
shared/utils/accountActivities.test.ts
shared/utils/accountBalance.test.ts
shared/utils/categoryHelpers.test.ts
shared/utils/categoryInsights.test.ts
shared/utils/csvExport.test.ts
shared/utils/dashboardWidgets.test.ts
shared/utils/dayGrouping.test.ts
shared/utils/formatCurrency.test.ts
shared/utils/investmentInterest.test.ts
shared/utils/magicParser.test.ts
shared/utils/paymentRequestUrl.test.ts
shared/utils/rangeAnalytics.test.ts
shared/utils/scheduleIdle.test.ts
shared/utils/splitMath.test.ts
shared/utils/subscriptionProcessor.test.ts
shared/utils/tripCalculations.test.ts
shared/utils/vaultMath.test.ts
```

---

## 3. Integration harness decision

| Approach | Decision |
|----------|----------|
| **Firebase Emulator Suite** (Auth + Firestore) | **Chosen** for Phase 5+ data-layer integration |
| Repository fakes / in-memory | Allowed for early unit/orchestration tests; prefer emulator once harness exists |
| Dedicated Firebase **test** project | Fallback only if emulator cannot cover a case |
| Production Firebase | **Forbidden** for automated tests |
| AsyncStorage / prefs | Prefer `shared/storage/memoryStorage` (or inject test double) |
| Android SMS native | Mock in node Vitest; real bridge only in Phase 8 device pack |

Rationale: Emulator keeps parity with Firestore rules/offline semantics without risking real user data or requiring production credentials in PR CI.

---

## 4. Test environment / variables strategy

| Concern | Strategy |
|---------|----------|
| Unit tests (`shared/**`) | No Firebase env required |
| Future emulator tests | Local `.env.test` or process env with emulator hosts (`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`); never commit secrets |
| App runtime `.env` | Keep for device/dev only; do not load production keys into CI unit jobs |
| PR CI | `npm ci` → `npm test` → `npm run typecheck:shared` (and later integration); **no** keystore / service-account secrets |
| Android release CI | Secrets remain on `push`/`workflow_dispatch` to `main` only (unchanged rule) |

Planned (later phases, not implemented in Phase 0): optional `npm run test:integration`, coverage script scoped to `shared/**`.

---

## 5. Known baseline issues (not fixed in Phase 0 app code)

| ID | Issue | Classification | Disposition |
|----|--------|----------------|-------------|
| BUG-008 | `npm run typecheck` fails: `StyleSheet.absoluteFillObject` in `components/common/Modal.tsx` | Potential Issue — Requires Test Verification / tooling debt | Defer fix to a dedicated bugfix (not Phase 0 money tests) |
| — | `typecheck:shared` historically missing `@/` paths and DOM `window` | Infrastructure | **Fixed in Phase 0** via `tsconfig.shared.json` |

SMS-related risks (BUG-003) apply only after SMS merges; skip on this branch.

BUG-001 (`/(tabs)` workspace route) remains open for Phase 7 verification on this codebase.

---

## 6. CI constraints (confirmed)

1. Never attach Android signing keystore or Firebase service account to `pull_request` jobs (fork exposure).
2. Keep `.github/workflows/android-release.yml` secret-bearing and non-PR.
3. Phase 9 will add a **separate** PR workflow for tests/typecheck.
4. Phase 10 will add a **pre-APK test gate** inside release without putting secrets on PRs.

---

## 7. Phase 0 unit / integration scope

| Layer | Phase 0 scope |
|-------|----------------|
| Unit | Run & freeze existing suite only; **no new product test cases** |
| Integration | Decision only (Emulator); **no harness code yet** |
| Tooling change allowed | Document baseline; fix shared tsconfig so `typecheck:shared` is usable |

---

## 8. Exit criteria checklist

- [x] Existing Vitest suite green on `docs/testing-master-plan` / latest `main`
- [x] Vitest include globs documented for `main`
- [x] Emulator-first integration decision recorded
- [x] Env / CI secret rules recorded
- [x] `typecheck:shared` made usable (paths + DOM)
- [x] Full `typecheck` debt logged (BUG-008)
- [x] SMS absence on `main` noted for Phase 3 timing

**Next:** Phase 1 — Core Calendar & Money Primitives (`dates.ts`, `billingCycle.ts`, account balance edges) after Phase 0 human sign-off in the checklist approval log.

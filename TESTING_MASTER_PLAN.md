# TESTING MASTER PLAN

**Product:** expense-tracker-mobile (Expo 57 / React Native / Firebase)  
**Planning date:** 2026-08-11  
**Scope:** Planning and analysis only — **no new test cases were implemented as part of this deliverable.**

---

## Document control


| Item                              | Value                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Intended planning baseline        | `main`                                                                              |
| Implementation branch             | `docs/testing-master-plan` ← `origin/main` @ `adcace0` (v1.1.1 / build 31)           |
| Earlier exploratory analysis      | Also inspected `feature/sms-automation` (SMS **not** merged to `main` yet)          |
| Phase 0 status                    | Complete pending human exit sign-off — see `docs/TESTING_BASELINE.md`               |
| Existing test runner              | Vitest 3.2.4 (`npm test` / `npm run test:watch`)                                    |
| Existing CI test gate             | **None** — only `.github/workflows/android-release.yml` (build + distribute)        |
| Documents in this pack            | `TESTING_MASTER_PLAN.md`, `TESTING_PHASE_CHECKLIST.md`, `TEST_BUG_DISCOVERY_LOG.md`, `docs/TESTING_BASELINE.md` |


**Baseline note:** SMS automation is planned for Phase 3/8 when that code lands on `main`. Phase 0 was executed against latest `main` (no `services/sms`).

---



## 1. Executive Summary

This is an Expo Router expense / personal-finance app with a secondary Nutrition workspace, Firebase Auth + Firestore (offline persistence), rich ledger features (accounts, subscriptions/EMI auto-post, vaults, splits, portfolio/SIP, trips), Android privacy lock / duress UID, and an in-progress SMS automation pipeline.

**Current testing posture:**

- ~26 Vitest unit files under `shared/**` and `services/sms/**`
- Node environment only; no component, hook, Firebase-emulator, or E2E suite
- Release pipeline builds/signs/distributes APK on `main` **without** running tests or typecheck

**Goal of this plan:** Establish a phased path to (1) expand pure business-logic coverage, (2) add integration coverage for money and auth paths, (3) enforce tests on PRs, (4) gate Android release APKs on mandatory suites — without changing production data isolation or signing security.

**Immediate rule until approval:** Do not implement phases, fixtures, CI jobs, or Cursor/Antigravity rule files.

---



## 2. Current Application Architecture

```text
Expo Router (file routes)
        │
        ├── Auth stack /(auth)
        ├── App shell /(app)  ← PrivacyLock, FinanceData, SMS receiver
        ├── Nutrition /(nutrition)
        └── Onboarding / Google auth bridge / OfflineBanner

Providers (Context-first)
  Network → SystemSettings → Auth → UserDoc → Workspace → Theme
  → Settings → Localization → Celebration
  App: PrivacyLock → FinanceData → Modal → SetupProgress → LedgerState → SmsReceiver

Data
  Firebase Auth + Firestore (persistentLocalCache)
  AsyncStorage (prefs, workspace, SMS prefs)
  TanStack Query (market quotes)
  Zustand listed in package.json but unused in source
```


| Concern           | Implementation                                                     |
| ----------------- | ------------------------------------------------------------------ |
| UI                | Expo Router, NativeWind, FlashList, RHF + Zod                      |
| Auth              | Email/password, Google Sign-In, web AuthSession bridge             |
| Privacy           | PIN/biometrics + duress proxy UID (`uid_duress`)                   |
| Money core        | Expenses, incomes, accounts, transfers, entries, category budgets  |
| Recurring         | Subscriptions/EMI with idle `writeBatch` auto-post                 |
| Wealth            | Investments, Portfolio + market API, SIPs                          |
| Social/shared     | Vaults, splits, payment requests / UPI                             |
| Insights          | Analytics views, CSV/JSON export, local AI advisor heuristics      |
| Android special   | SMS read/listen module, biometrics, release APK via Gradle scripts |
| Secondary product | Nutrition (Open Food Facts + meal logs; UI maturity mixed)         |


---



## 3. Complete Module Inventory

Criticality: **Critical** | **High** | **Medium** | **Low**

### 3.1 Auth & Privacy — Critical


| Field         | Detail                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Purpose       | Sign-in, session, duress isolation, category seed on login                                                                     |
| Screens       | `/(auth)/login`, `google-auth`, `PrivacyLock`                                                                                  |
| Components    | Login UI, PrivacyLock, biometric prompts                                                                                       |
| Hooks         | `useBiometrics`, `useFirstLaunch`, `useUserRole`                                                                               |
| Services/lib  | `AuthProvider`, `lib/firebase`, `lib/createAuth*`, `lib/googleAuthBridge`, `lib/privacySession`, `lib/ensureCategoryHierarchy` |
| Data          | Firebase Auth users; `users/{uid}`; duress path `users/{uid}_duress`                                                           |
| External      | Firebase Auth, Google Sign-In                                                                                                  |
| Rules / edges | Duress must never write real collections; unlock lockout counters; Google web client id required for release                   |
| Criticality   | **Critical**                                                                                                                   |




### 3.2 Core Ledger (Expenses / Incomes / Forms) — Critical


| Field       | Detail                                                                      |
| ----------- | --------------------------------------------------------------------------- |
| Purpose     | Create/edit/delete expenses & incomes; Magic Add parsing                    |
| Screens     | `/(app)/ledger`, `/(app)/add`, dashboard quick-add                          |
| Components  | `ExpenseForm`, `ExpenseList`, `AddTransactionModal`, category picker        |
| Hooks       | `useExpenses`, `useIncomes`, `useFinanceData`, `useCategorizationRules`     |
| Utils       | `magicParser`, `formatCurrency`, `dayGrouping`, `categoryHelpers`, taxonomy |
| Data        | `users/{uid}/expenses`, `incomes`                                           |
| Edges       | Validation, month keys, category hierarchy, offline pending writes          |
| Criticality | **Critical**                                                                |




### 3.3 Accounts, Balances, Transfers, Credit — Critical


| Field       | Detail                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Purpose     | Bank/card accounts, running balance, transfers, credit bill pay                                    |
| Screens     | `/(app)/accounts/[id]`, ledger accounts/cards tabs                                                 |
| Components  | AccountsList, CardsList, Transfer/PayCredit/Edit/AddEntry modals                                   |
| Hooks       | `useAccounts`, `useAccountTransfers`, `useAccountPayments`, `useAccountEntries`, `useAccountTypes` |
| Utils       | `accountBalance`, `accountKind`, `billingCycle`, account activities helpers                        |
| Edges       | Transfers not double-counted; billing cycle boundaries; external payment matching                  |
| Criticality | **Critical**                                                                                       |




### 3.4 Firebase Sync / Offline — Critical


| Field       | Detail                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------- |
| Purpose     | Live listeners, staged load, pending write visibility                                               |
| Screens     | Global `OfflineBanner`                                                                              |
| Providers   | `FinanceDataProvider`, `NetworkProvider`, `lib/syncStatusStore`                                     |
| Edges       | `fromCache` vs server; partial expense history then idle full load; multi-collection pending counts |
| Criticality | **Critical**                                                                                        |




### 3.5 Subscriptions / EMI Auto-Post — Critical


| Field              | Detail                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| Purpose            | CRUD + automatic expense/transfer creation when due                        |
| Screens/Components | Subscriptions list/edit; dashboard widget                                  |
| Hooks              | `useSubscriptions`                                                         |
| Utils              | `subscriptionProcessor` (existing tests for pure logic)                    |
| Edges              | Double-fire, timezone day boundary, `lastProcessed`, batch partial failure |
| Criticality        | **Critical**                                                               |




### 3.6 SMS Automation (Android) — High


| Field                | Detail                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Purpose              | Permission → inbox/receiver → relevance → parse → adapt → (future write)                     |
| Screens              | Settings → SmsAutomationSettings                                                             |
| Components/Providers | `SmsReceiverProvider`, settings UI                                                           |
| Hooks                | `useSmsPermission`                                                                           |
| Services             | Full `services/sms/*`, `modules/sms-reader`                                                  |
| Edges                | Parser stub; prefs off by default; review-before-add; duress block; permission merge; dedupe |
| Criticality          | **High** (release-blocker once auto-write ships)                                             |




### 3.7 Settings, System Maintenance, Releases — High


| Field       | Detail                                                        |
| ----------- | ------------------------------------------------------------- |
| Purpose     | User prefs, maintenance mode, in-app update metadata          |
| Screens     | `/(app)/settings`                                             |
| Providers   | `SettingsProvider`, `SystemSettingsProvider`, `ThemeProvider` |
| Hooks       | `useAppUpdate`                                                |
| Utils       | `mergeSettingsFromDoc` (tested)                               |
| Criticality | **High**                                                      |




### 3.8 Dashboard & Overview Math — High


| Field       | Detail                                                                |
| ----------- | --------------------------------------------------------------------- |
| Purpose     | Widgets: overview, budgets, goals, investments, gamification, focus   |
| Screens     | `/(app)/dashboard`                                                    |
| Utils       | `dashboardWidgets`, `monthSummary`, `weeklySummary`, insights metrics |
| Criticality | **High**                                                              |




### 3.9 Splits, Payment Requests, UPI — High


| Field       | Detail                                                                      |
| ----------- | --------------------------------------------------------------------------- |
| Purpose     | Bill splits; collect money; UPI/QR URLs                                     |
| Hooks       | `useSplits`, `usePaymentRequests`                                           |
| Utils       | `splitMath` (tested), `paymentRequestUrl` (tested), `upi`, proactive splits |
| Criticality | **High**                                                                    |




### 3.10 Vaults — High


| Field       | Detail                          |
| ----------- | ------------------------------- |
| Purpose     | Shared vault spend & balances   |
| Screens     | `/(app)/vaults`                 |
| Hooks       | `useVaults`, `useVaultExpenses` |
| Utils       | `vaultMath` (tested)            |
| Criticality | **High**                        |




### 3.11 Portfolio + Market Quotes — High


| Field       | Detail                                                  |
| ----------- | ------------------------------------------------------- |
| Purpose     | Holdings, orders, watchlist, P&L via market HTTP API    |
| Hooks       | `usePortfolio`, `useMarketQuotes`, `useUnifiedNetWorth` |
| Services    | `marketDataService`                                     |
| Types       | `shared/types/market` (partial tests)                   |
| Criticality | **High**                                                |




### 3.12 SIP — Medium


| Field       | Detail                                 |
| ----------- | -------------------------------------- |
| Purpose     | SIP plans, history, virtual positions  |
| Hooks       | `useSips`                              |
| Schemas     | `shared/features/sip/schemas` (tested) |
| Criticality | **Medium**                             |




### 3.13 Investments (FD/RD interest) — Medium


| Field       | Detail                        |
| ----------- | ----------------------------- |
| Hooks       | `useInvestments`              |
| Utils       | `investmentInterest` (tested) |
| Criticality | **Medium**                    |




### 3.14 Trips — Medium


| Field       | Detail                      |
| ----------- | --------------------------- |
| Hooks       | `useTrips`                  |
| Utils       | `tripCalculations` (tested) |
| Criticality | **Medium**                  |




### 3.15 Analytics, Export, AI Advisor, OCR — Medium


| Field       | Detail                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| Screens     | `/(app)/insights`                                                                       |
| Services    | `aiAdvisorService`, `ocrService`                                                        |
| Utils       | `rangeAnalytics` (tested), `csvExport` (tested), insights/grouping (partially untested) |
| Criticality | **Medium**                                                                              |




### 3.16 Categories, Budgets, Goals, Rules — Medium


| Field       | Detail                                                                               |
| ----------- | ------------------------------------------------------------------------------------ |
| Hooks       | `useCategories`, `useCategoryBudgets`, `useFinancialGoals`, `useCategorizationRules` |
| Data        | Taxonomy + user hierarchy                                                            |
| Criticality | **Medium**                                                                           |




### 3.17 Workspace / Navigation Shell — High (routing risk)


| Field       | Detail                                                   |
| ----------- | -------------------------------------------------------- |
| Purpose     | Expense vs Nutrition; default view; Android back         |
| Providers   | `WorkspaceProvider`, navigation restoration              |
| Hooks       | `useAndroidBackHandler`, `useNavigationStateRestoration` |
| Known risk  | Expense switch targets `/(tabs)` (see BUG-001)           |
| Criticality | **High**                                                 |




### 3.18 Nutrition — Low–Medium


| Field       | Detail                           |
| ----------- | -------------------------------- |
| Screens     | `(nutrition)/*`                  |
| Hooks       | `useNutrition`                   |
| Services    | `openFoodFactsService`           |
| Risk        | Mock UI vs live hook dual source |
| Criticality | **Low–Medium**                   |




### 3.19 Gamification / Focus / Celebrations — Low


| Field       | Detail                            |
| ----------- | --------------------------------- |
| Hooks       | `useGamification`, `useFocusMode` |
| Providers   | `CelebrationProvider`             |
| Criticality | **Low**                           |




### 3.20 Localization / Theme / UI chrome — Low


| Field       | Detail                                                 |
| ----------- | ------------------------------------------------------ |
| Providers   | Localization, Theme, Modal, SetupProgress, LedgerState |
| Criticality | **Low**                                                |




### Module count

**20 logical modules** inventoried above (auth, ledger, accounts, sync, subscriptions, SMS, settings/releases, dashboard, splits/UPI, vaults, portfolio, SIP, investments, trips, analytics/AI/OCR, categories/budgets/goals, workspace/nav, nutrition, engagement, presentation).

---



## 4. Complete Feature Inventory

Major feature areas (for planning / coverage mapping):

1. Authentication (email, Google, reset)
2. Privacy lock / biometrics / duress
3. Onboarding & setup wizard
4. Expense CRUD + Magic Add
5. Income CRUD
6. Accounts & cards
7. Transfers & account entries
8. Credit bill payment / cycles
9. Category hierarchy & preferences
10. Category budgets & financial goals
11. Categorization rules
12. Subscriptions & EMI auto-post
13. Dashboard widgets & pacing
14. Ledger multi-tab hub
15. Insights / analytics / Analysis Lab
16. CSV/JSON export
17. AI advisor (local)
18. Receipt OCR assist
19. Vaults & shared vault transactions
20. Splits
21. Payment requests / Collect / UPI QR
22. Investments (non-market)
23. Portfolio trading UX
24. Live market quotes
25. Unified net worth
26. SIP plans
27. Trips
28. Focus mode
29. Gamification / streaks
30. Settings & personalization
31. System maintenance / feature flags
32. In-app update / release metadata
33. Offline banner / pending sync
34. SMS automation (Android)
35. Nutrition scan / log / profile
36. App selector / workspace switch
37. Android release build & App Distribution

**Major feature areas counted for summary: 37.**

---



## 5. Testing Objectives

1. Protect **money correctness** (balances, auto-posts, splits, vaults, FX display).
2. Protect **identity & isolation** (auth, duress, Firestore path scoping).
3. Stabilize **Android SMS automation** before enabling silent writes.
4. Eliminate silent calendar-key bugs at timezone edges.
5. Catch **navigation/workspace** regressions early.
6. Gate **APK release** on automated suites that do not require signing secrets on PR forks.
7. Make test ownership part of every feature change (future Cursor/Antigravity rules).

Non-goals (near term): 100% line coverage; full Detox matrix on every commit; Firebase production data for tests.

---



## 6. Unit Testing Strategy



### Already covered (keep / extend)

Money & domain pure functions with existing Vitest files: account balance/activities, vault/split/trip math, subscription due logic, investment interest, market position metrics, magic parser, taxonomy/helpers/insights, dashboard widgets, range analytics, day grouping, currency, CSV export, payment request URLs, navigation config, settings merge, scheduleIdle, SIP schemas, SMS relevance/prefs/adapter/processor smoke.

### Required additional unit areas (do not implement yet)


| Area                                       | What                                        | Why                         | Priority       | Edge cases                                         | Deps                |
| ------------------------------------------ | ------------------------------------------- | --------------------------- | -------------- | -------------------------------------------------- | ------------------- |
| `dates.ts`                                 | Local keys, parseLocalDate, bill day clamp  | Calendar correctness        | P0             | IST midnight, Feb 29, invalid keys                 | None                |
| `billingCycle.ts`                          | Cycle windows                               | Credit correctness          | P0             | Boundary days, month length                        | dates               |
| Remaining summaries                        | month/weekly/income/smart/monthlyComparison | Dashboard totals            | P1             | Empty month, timezone                              | dates               |
| `grouping` / `insightMetrics` / `insights` | Replace or wrap ISO slice usage             | Align with dates            | P1             | UTC vs local                                       | dates               |
| `ocrService`                               | Merchant/total/tax heuristics               | Bad totals → wrong expenses | P1             | Multi-currency-looking nums, k-notation            | None                |
| `aiAdvisorService`                         | Month filter / context build                | Wrong month advice          | P2             | Empty ledger                                       | analytics utils     |
| `privacySession`                           | Duress/unlock/lockout state machine         | Security                    | P0             | Concurrent subscribe                               | None (extract pure) |
| SMS `smsParser` (when templates land)      | Bank/UPI templates                          | Future auto-expense         | P0 when active | OTP false positive, multi-currency, truncated body | Fixtures            |
| `smsDedupe`                                | Fingerprints                                | Duplicate money rows        | P0             | Same SMS redelivery                                | None                |
| `smsPipeline`                              | Orchestration pure path                     | End-to-end unit of pipeline | P1             | Empty inbox, all filtered                          | Mocks light         |
| `accountKind`                              | Kind mapping                                | Wrong account UX            | P2             | Unknown kinds                                      | None                |
| Payment slug/path                          | Routing helpers                             | Broken share links          | P2             | Encoding                                           | None                |
| `upi.ts` residual                          | VPA/URL build                               | Invalid UPI                 | P2             | Special chars                                      | None                |
| Net worth pure extract                     | Aggregate banks+credit+invest+quotes        | Undervaluation              | P1             | Null quotes                                        | Fixtures            |
| Auth error message helper                  | Mapping                                     | UX                          | P3             | Non-Error throws                                   | None                |


**Unit rules:** Prefer real fixtures over heavy mocks; test behavior and invariants; extract pure logic from hooks when hooks are thick.

---



## 7. Integration Testing Strategy

Document required workflows only (future implementation).


| Workflow                                              | Modules                          | Why                       |
| ----------------------------------------------------- | -------------------------------- | ------------------------- |
| Login → authenticated `/(app)` shell                  | Auth, Settings, FinanceData      | Entry gate                |
| Signup → category hierarchy seed                      | Auth, ensureCategoryHierarchy    | Empty category crash risk |
| Create expense → validate → Firestore → list          | Ledger, FinanceData              | Core write path           |
| Edit/delete expense                                   | Ledger                           | Mutation integrity        |
| Transfer between accounts → balances                  | Accounts                         | Money movement            |
| Credit bill pay → cycle state                         | Accounts, billingCycle           | Debt tracking             |
| Subscription due → writeBatch post → expense appears  | Subscriptions                    | Silent writes             |
| Settings change → persist → reload merge              | Settings                         | Preference durability     |
| Offline write → pending banner → reconnect            | Network, sync store, FinanceData | Durability UX             |
| Duress unlock → isolated UID → SMS blocked            | Auth, privacy, SMS               | Security                  |
| Enable SMS prefs → permission → inbound status update | SMS, Settings                    | Android path              |
| SMS parse (future) → expense draft/create             | SMS, Ledger                      | Automation                |
| Vault tx → shared balance                             | Vaults                           | Multi-party money         |
| Split settle math + persistence                       | Splits                           | Settlements               |
| Payment request URL → deep link open                  | Collect, linking                 | External money            |
| Portfolio order + quote refresh                       | Portfolio, market                | Net worth                 |
| Export CSV for month                                  | Analytics, csvExport             | Data portability          |
| Workspace Nutrition ↔ Expense                         | Workspace, router                | BUG-001                   |
| Maintenance flag → MaintenanceScreen                  | SystemSettings                   | Kill switch               |
| Release metadata → update sheet                       | useAppUpdate                     | Distribution              |


**Integration approach (recommended later):** Firebase Emulator Suite for Auth+Firestore where possible; otherwise hermetic fakes for repository interfaces. Avoid hitting production Firebase.

---



## 8. Test Pyramid

```text
                 E2E (Maestro/Detox later)
               /                         \
        Integration (emulator / fakes)
      /                                   \
   Component (optional, high-value forms)
     /
Unit (Vitest node)  ← primary investment now
```

**Recommended balance for this app:**


| Layer                      | Target share of effort | Notes                                                    |
| -------------------------- | ---------------------- | -------------------------------------------------------- |
| Unit                       | ~60–70%                | Pure money, dates, SMS parse, settings merge             |
| Integration                | ~20–25%                | Auth isolation, CRUD, subscription batch, sync pending   |
| Component                  | ~5–10%                 | ExpenseForm validation, critical modals only             |
| E2E                        | ~5%                    | Few critical journeys on Android emulator/device         |
| Android release validation | Mandatory gate         | Unit+integration+typecheck+release:verify; selective E2E |


Do **not** aim for 100% coverage. Prefer invariants over snapshot spam.

---



##  9. Bug Discovery Strategy

1. Static analysis findings logged in `TEST_BUG_DISCOVERY_LOG.md` as **Potential Issue — Requires Test Verification**.
2. Each phase’s exit includes: run suite → log failures → triage severity → fix in separate work → add regression test → mark Verified.
3. Never delete/skip tests to greenwash CI.
  ---
4. Critical money/security failures block release.

Highest-risk discovery areas: subscription auto-post, account balances, duress isolation, date keys, SMS write path, workspace routing, offline pending sync.

## 10. Testing Phases



### Phase 0 — Testing Infrastructure & Baseline Freeze


| Field             | Content                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Objective         | Inventory freeze, document runners, decide emulator vs mocks, no production Firebase in tests |
| Modules           | Tooling only                                                                                  |
| Features          | N/A                                                                                           |
| Unit scope        | Ensure existing 26 files still green; document include globs                                  |
| Integration scope | Decide Firebase Emulator vs repository fakes                                                  |
| Edge cases        | CI secret isolation (no PR signing)                                                           |
| Bug discovery     | Confirm baseline known failures if any                                                        |
| Dependencies      | None                                                                                          |
| Priority          | P0                                                                                            |
| Complexity        | Low                                                                                           |
| Entry             | Plan approved                                                                                 |
| Exit              | Baseline `npm test` documented; env strategy chosen; checklist Phase 0 done                   |
| Deliverables      | Short `docs/TESTING_BASELINE.md` optional; Vitest/scripts plan (implement later)              |




### Phase 1 — Core Calendar & Money Primitives


| Field         | Content                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| Objective     | Unit coverage for `dates`, `billingCycle`, expand account balance edges |
| Modules       | Dates, accounts math                                                    |
| Features      | Calendar keys, credit cycles, balances                                  |
| Unit          | dates, billingCycle, accountBalance edge matrix                         |
| Integration   | None required                                                           |
| Edges         | IST midnight, month ends, leap years                                    |
| Bug discovery | BUG-002, BUG-006                                                        |
| Dependencies  | Phase 0                                                                 |
| Priority      | P0                                                                      |
| Complexity    | Medium                                                                  |
| Entry         | Phase 0 exit                                                            |
| Exit          | Dates + billingCycle covered; balance edges expanded; bugs logged       |
| Deliverables  | New/extended Vitest files (when approved)                               |




### Phase 2 — Shared Business Logic Completeness


| Field         | Content                                                      |
| ------------- | ------------------------------------------------------------ |
| Objective     | Cover remaining `shared/utils` money/analytics helpers       |
| Modules       | Summaries, insights, net-worth extract, OCR, advisor filters |
| Unit          | Untested utils listed in §6                                  |
| Integration   | None                                                         |
| Edges         | Empty datasets, large lists                                  |
| Bug discovery | Analytics month mismatches                                   |
| Dependencies  | Phase 1                                                      |
| Priority      | P1                                                           |
| Complexity    | Medium                                                       |
| Entry         | Phase 1 exit                                                 |
| Exit          | Priority utils have meaningful tests                         |
| Deliverables  | Expanded unit suite                                          |




### Phase 3 — SMS Automation Unit Hardening


| Field         | Content                                                      |
| ------------- | ------------------------------------------------------------ |
| Objective     | Harden SMS pure pipeline before auto-write                   |
| Modules       | SMS services                                                 |
| Features      | Relevance, dedupe, prefs, adapter, processor gates           |
| Unit          | Expand parser fixtures when templates land; dedupe; pipeline |
| Integration   | Prefs ↔ processor ↔ status (node-level)                      |
| Edges         | Duress, review-before-add, OTP noise                         |
| Bug discovery | BUG-003                                                      |
| Dependencies  | Phase 0 (can partially parallel Phase 2)                     |
| Priority      | P0 for Android SMS roadmap                                   |
| Complexity    | High                                                         |
| Entry         | SMS modules present on target branch                         |
| Exit          | No silent write without tests; gates covered                 |
| Deliverables  | SMS fixtures strategy; tests                                 |




### Phase 4 — Auth, Privacy, Settings


| Field         | Content                                                         |
| ------------- | --------------------------------------------------------------- |
| Objective     | Isolate privacySession; settings merge edges; auth helpers      |
| Modules       | Auth, privacy, settings                                         |
| Unit          | privacySession state machine; settings edge merges              |
| Integration   | Duress UID path construction; category seed on login (emulator) |
| Edges         | Lockout, concurrent unlock, missing Google client id            |
| Bug discovery | BUG-004                                                         |
| Dependencies  | Phase 0; emulator decision                                      |
| Priority      | P0                                                              |
| Complexity    | High                                                            |
| Entry         | Phase 0 exit                                                    |
| Exit          | Duress isolation tests defined & passing                        |
| Deliverables  | Auth/privacy test pack                                          |




### Phase 5 — Data Layer Integration


| Field         | Content                                                              |
| ------------- | -------------------------------------------------------------------- |
| Objective     | Expense/account CRUD + pending sync semantics against emulator/fakes |
| Modules       | FinanceData, Network, sync store                                     |
| Unit          | syncStatusStore pure API                                             |
| Integration   | Create/edit/delete expense; offline pending; reconnect               |
| Edges         | Staged history load; listener errors                                 |
| Bug discovery | Sync races                                                           |
| Dependencies  | Phases 0–1, emulator                                                 |
| Priority      | P0                                                                   |
| Complexity    | High                                                                 |
| Entry         | Emulator or fake repos ready                                         |
| Exit          | Core ledger mutations covered                                        |
| Deliverables  | Integration harness                                                  |




### Phase 6 — Module Integrations (Money Features)


| Field         | Content                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| Objective     | Subscriptions auto-post, vaults, splits, transfers                      |
| Modules       | Subscriptions, vaults, splits, accounts                                 |
| Unit          | Remaining gap fills                                                     |
| Integration   | Due subscription idempotency; vault tx; split settle; transfer balances |
| Edges         | Double open app; timezone                                               |
| Bug discovery | BUG-005                                                                 |
| Dependencies  | Phase 5                                                                 |
| Priority      | P0                                                                      |
| Complexity    | High                                                                    |
| Entry         | Phase 5 exit                                                            |
| Exit          | Silent write paths covered                                              |
| Deliverables  | Integration suites                                                      |




### Phase 7 — Cross-Module Journeys & Navigation


| Field                  | Content                                                      |
| ---------------------- | ------------------------------------------------------------ |
| Objective              | Critical journeys + workspace routing                        |
| Modules                | Workspace, dashboard, insights export, payment links         |
| Unit                   | Navigation config still green                                |
| Integration / E2E-lite | Login → add expense → transfer → export; Nutrition ↔ Expense |
| Edges                  | BUG-001 route                                                |
| Bug discovery          | Navigation, export                                           |
| Dependencies           | Phases 4–6                                                   |
| Priority               | P1                                                           |
| Complexity             | Medium–High                                                  |
| Entry                  | Core integrations green                                      |
| Exit                   | Journeys automated or Maestro scripts drafted                |
| Deliverables           | Journey suite                                                |




### Phase 8 — Android Native & Device Validation


| Field                                           | Content                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Objective                                       | SMS permissions, receiver lifecycle, biometrics smoke, release:verify |
| Modules                                         | sms-reader module, permissions, PrivacyLock                           |
| Unit                                            | N/A native                                                            |
| Integration / Manual + automated where possible | Permission deny/grant; listen start/stop; duress disables SMS         |
| Edges                                           | Manifest merge after prebuild; OEM SMS quirks                         |
| Bug discovery                                   | BUG-003 device                                                        |
| Dependencies                                    | Phase 3                                                               |
| Priority                                        | P0 before SMS ship                                                    |
| Complexity                                      | High                                                                  |
| Entry                                           | Android emulator/device available                                     |
| Exit                                            | Device checklist passed for release candidates                        |
| Deliverables                                    | Android validation checklist + optional instrumented tests            |




### Phase 9 — Regression Pack & CI Enforcement


| Field            | Content                                                         |
| ---------------- | --------------------------------------------------------------- |
| Objective        | PR workflow with unit+integration+typecheck; no signing secrets |
| Modules          | CI                                                              |
| Features         | Quality gate                                                    |
| Unit/Integration | Full automated suite                                            |
| Edges            | Fork PRs must not get keystore                                  |
| Dependencies     | Phases 1–7 stable                                               |
| Priority         | P0                                                              |
| Complexity       | Medium                                                          |
| Entry            | Tests flaky rate acceptable                                     |
| Exit             | PR CI required for merge                                        |
| Deliverables     | `.github/workflows/pr-checks.yml` (`npm test` + both typechecks; no signing secrets) |




### Phase 10 — Android Release Gate


| Field        | Content                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| Objective    | `main` release job runs mandatory tests before APK build                                   |
| Modules      | Release pipeline                                                                           |
| Features     | Block bad APKs                                                                             |
| Mandatory    | Unit + integration + typecheck + `release:verify`; SMS device pack if SMS enabled in build |
| Optional     | Full E2E                                                                                   |
| Dependencies | Phase 9                                                                                    |
| Priority     | P0                                                                                         |
| Complexity   | Medium                                                                                     |
| Entry        | PR CI proven                                                                               |
| Exit         | Release cannot publish if tests fail                                                       |
| Deliverables | Updated android-release workflow (future)                                                  |


**Phase count: 11 (Phase 0–10).**

---



## 11. Phase Dependencies

```text
Phase 0  Testing Infrastructure & Baseline Freeze
   │
   ├───────────────┬──────────────────┐
   ▼               ▼                  ▼
Phase 1        Phase 3            Phase 4
Calendar &     SMS Unit           Auth / Privacy
Money          Hardening          / Settings
Primitives         │                  │
   │               │                  │
   ▼               │                  │
Phase 2            │                  │
Shared Logic       │                  │
Completeness       │                  │
   │               │                  │
   └───────┬───────┴────────┬─────────┘
           ▼                ▼
        Phase 5      (Phase 3 continues)
        Data Layer Integration
           │
           ▼
        Phase 6
        Module Integrations (subscriptions, vaults, splits, transfers)
           │
           ▼
        Phase 7
        Cross-Module Journeys & Navigation
           │
           ├──────────────────┐
           ▼                  ▼
        Phase 8            Phase 9
        Android Native     Regression & CI
        & Device                 │
           │                     ▼
           └──────────► Phase 10
                        Android Release Gate
```

**Recommended implementation order:**  
0 → 1 → 2 → 4 → 5 → 6 → 7 → 9 → 10, with **3 + 8** parallel as SMS readiness demands (before enabling auto-write / SMS-heavy releases).

---



## 12. Local Development Workflow

Intended future flow (adapted for this repo):

```text
Identify affected modules & existing *.test.ts
        ↓
Implement feature / fix
        ↓
Add/update unit tests (shared/utils, services/sms, extracted pure libs)
        ↓
Add/update integration tests if cross-module or Firestore path
        ↓
npm test                        # fast unit (affected + full)
npm run typecheck / typecheck:shared
        ↓
Optional: integration suite / emulator
        ↓
If Android-native change: manual device checklist / SMS matrix
        ↓
Log bugs in TEST_BUG_DISCOVERY_LOG.md
        ↓
Fix + regression test
        ↓
Commit → push → PR (CI)
```

Today’s available commands (already present; do not treat as new):

- `npm test` / `npm run test:watch`
- `npm run typecheck` / `typecheck:shared`
- `npm run release:verify` (environment/keystore/google-services/gradle checks)

---



## 13. Pull Request Workflow

Future PR requirements:

1. Description lists affected modules + test suites touched.
2. CI runs: `npm ci` → `npm test` → `npm run typecheck` → `npm run typecheck:shared`.
3. Integration suite when present.
4. No disabling tests without documented justification in PR body.
5. Bug fixes must reference `BUG-XXX` and regression test path.
6. **Never** attach signing keystore / Firebase service account to `pull_request` from forks (keep release workflow push-`main` / `workflow_dispatch` only).

---



## 14. Main Branch Workflow

On merge to `main`:

1. PR CI already green.
2. Optional main-branch job: full suite + typecheck (non-signing).
3. Android release workflow (existing) should **gain a pre-build test gate** (Phase 10) before prebuild/APK.
4. Markdown-only pushes remain ignorable for release (current `paths-ignore`).

---



## 15. Android Release Workflow

Target:

```text
Code on main
 → Mandatory automated tests (unit + integration + typecheck)
 → release:verify
 → expo prebuild
 → signed APK
 → Firebase App Distribution
 → Firestore release metadata
```

**Mandatory before APK generation (recommended):**


| Check                                                 | Required                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Vitest unit suite                                     | Yes                                                                                  |
| Integration suite (money, auth/duress, subscriptions) | Yes once exists                                                                      |
| `tsc` typecheck                                       | Yes                                                                                  |
| `release:verify`                                      | Yes (already in spirit of release scripts)                                           |
| SMS device pack                                       | Yes if build includes SMS automation enabled by default or releasing SMS feature     |
| Full E2E                                              | Strongly recommended for marketing/mandatory updates; optional for patch if risk low |
| Manual smoke: login, add expense, open account detail | Yes for major releases                                                               |


Android-specific attention: SMS permissions post-prebuild, Google Sign-In SHA-1, biometrics unlock, OfflineBanner, back handler.

---



## 16. CI/CD Strategy


| Event                                             | Run                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| Push to feature branch                            | Unit + typecheck (fast)                                               |
| PR opened / updated                               | Unit + integration + typecheck (required checks)                      |
| Merge to main                                     | Full automated suite; optionally schedule release                     |
| Android release (`workflow_dispatch` / push main) | Mandatory tests **then** build/distribute (secrets stay release-only) |


Do not put keystore secrets on `pull_request`. Keep current safety comment in `android-release.yml` when extending.

---



## 17. Coverage Strategy


| Category                                                                   | Target                                          | Rationale               |
| -------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------- |
| Financial calculations (balance, split, vault, interest, subscription due) | Very high (≥90% lines/branches of pure modules) | Money                   |
| Date/time keys & billing cycles                                            | Very high                                       | Timezone risk           |
| SMS parse/dedupe/relevance/gates                                           | Very high when parse live                       | Silent money            |
| Auth/privacy session logic                                                 | High                                            | Security                |
| Settings merge / navigation config                                         | High                                            | Boot paths              |
| Data transforms / CSV / Magic parser                                       | High                                            | Input integrity         |
| Integration workflows (ledger CRUD, auto-post)                             | Strong scenario coverage                        | Not line %              |
| UI chrome / animations                                                     | Low / selective                                 | Prefer manual/E2E smoke |
| Generated / config / styles                                                | Exclude                                         | Avoid vanity coverage   |


Track coverage later with Vitest coverage on `shared/**` and `services/sms/**` first. No vanity tests.

---



## 18. Test Data Strategy


| Kind                    | Approach                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| Test users              | Emulator accounts or disposable Firebase **test** project only        |
| Expenses / incomes      | Factories with fixed `date`/`month` keys (local calendar)             |
| Categories              | Seed from taxonomy fixtures                                           |
| Budgets / goals         | Small deterministic sets                                              |
| Accounts / transfers    | Matrix: bank, credit, empty, overdrawn                                |
| Subscriptions           | Due today / overdue / future / lastProcessed set                      |
| SMS corpus              | Anonymized template fixtures (no real PII); OTP, debit, credit, promo |
| Portfolio               | Holdings with null/stale quotes                                       |
| Invalid / empty / large | Explicit suites (0 items, 1, 10k synthetic for perf unit only)        |
| Dates                   | Table-driven IST/UTC edge cases                                       |
| Android                 | Permission denied/granted states; empty inbox                         |


**Never** point automated tests at production Firestore data.

---



## 19. Test Environment Strategy


| Option                          | Recommendation                                                                |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Vitest node for pure utils      | **Keep / expand** (current)                                                   |
| Firebase Emulator Suite         | **Preferred** for Auth+Firestore integration                                  |
| Dedicated Firebase test project | Fallback if emulator impractical for some APIs; still never production        |
| Mock Firebase comprehensively   | Only for unit of UI; prefer emulator for data layer                           |
| Local AsyncStorage memory       | Use in-memory or `shared/storage/memoryStorage` patterns                      |
| Mock Android SMS module         | Jest/Vitest mocks for reader/listener in node; device tests for real bridge   |
| Env                             | Test `.env` with emulator ports / fake keys; CI secrets separate from release |


Safest default: **Vitest + Emulator + in-memory prefs**; device farm only for SMS/biometric release gates.

---



## 20. Cursor Rules Strategy (proposed — do not apply yet)

Future Cursor project rule section should enforce:

1. New features require test impact analysis before coding.
2. New business logic → unit tests.
3. Cross-module behavior → integration tests.
4. Bug fixes → regression tests + `TEST_BUG_DISCOVERY_LOG` update.
5. Modified functionality → review existing `*.test.ts`.
6. Do not remove tests solely to pass CI.
7. Do not disable tests without explicit human justification.
8. No coverage-only meaningless tests.
9. Prefer real business behavior assertions.
10. Do not over-mock (especially money & dates).
11. Work incomplete until appropriate tests land.
12. Agents must inspect related tests before editing production code.
13. Agents must list impacted suites before implementing.
14. Agents must report missing coverage.
15. Agents must not hide/ignore failing tests.

Convert later via create-rule skill after approval.

---



## 21. Antigravity Rules Strategy (proposed — do not apply yet)

Mirror Cursor rules with Antigravity phrasing:

- Test analysis required in plan mode for features.
- Money/auth/SMS changes require matching suites.
- Release artifacts require green mandatory gates.
- Agents must update bug discovery log for verified defects.
- Forbidden: deleting assertions to silence CI; writing tests that assert implementation trivia instead of financial invariants.

---



## 22. Test Execution Matrix


| Test Type                 | Local                | Push branch          | PR                         | Main           | Android Release              |
| ------------------------- | -------------------- | -------------------- | -------------------------- | -------------- | ---------------------------- |
| Unit (Vitest)             | Yes                  | Yes                  | Yes (required)             | Yes            | Yes (mandatory)              |
| Integration               | Yes                  | Optional fast subset | Yes (required once exists) | Yes            | Yes (mandatory once exists)  |
| Component                 | Optional             | No                   | Optional                   | Optional       | Optional                     |
| E2E (Maestro/Detox)       | Optional             | No                   | Selected critical          | Selected       | Yes for major / SMS releases |
| Typecheck                 | Yes                  | Yes                  | Yes                        | Yes            | Yes                          |
| `release:verify`          | Before local release | No                   | No                         | Optional       | Yes                          |
| Android build/APK         | Optional             | No                   | No                         | Via release WF | Yes                          |
| Device SMS/biometric pack | Optional             | No                   | No                         | Optional       | Yes if SMS/privacy affected  |
| Firebase App Distribution | No                   | No                   | No                         | Release WF     | Yes                          |


---



## 23. Definition of Done (Testing Program)

The testing project is complete when:

- [ ] All modules in §3 analyzed and kept current
- [ ] Critical business logic under unit coverage targets
- [ ] Important integrations (ledger, accounts, subscriptions, duress) covered
- [ ] Critical user journeys covered (automated and/or mandatory manual)
- [ ] Bugs found during testing documented in `TEST_BUG_DISCOVERY_LOG.md`
- [ ] Fixed bugs have regression tests
- [ ] Suites are stable (low flake) locally and in CI
- [ ] Developers can run tests locally with documented commands
- [ ] PRs run automated tests as required checks
- [ ] Android release cannot publish APK if mandatory tests fail
- [ ] CI blocks invalid releases without exposing signing secrets to fork PRs
- [ ] New features require tests (Cursor + Antigravity rules active)
- [ ] Production Firebase data isolated from automated tests
- [ ] SMS automation cannot ship silent writes without parser/dedupe/duress tests + device gate

---



## 24. Risks and Recommendations


| Risk                                                               | Mitigation                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Analysis done on `feature/sms-automation`, not `main`              | Re-diff against `main` before Phase 1 coding                                             |
| CI currently builds APK with zero tests                            | Add PR CI first; then release gate                                                       |
| Thick hooks (`usePortfolio`, `useSubscriptions`) hard to unit test | Extract pure cores; integration-test the rest                                            |
| Emulator setup cost                                                | Start with pure units; introduce emulator in Phase 5                                     |
| SMS parser stub                                                    | Do not enable auto-write until Phase 3+8 exit                                            |
| Date helper dual standards                                         | Prefer consolidating on `dates.ts` (fix only after approval; currently observation only) |
| Workspace `/(tabs)`                                                | Verify ASAP with journey test (BUG-001)                                                  |
| Zustand unused                                                     | Ignore for testing until used                                                            |


**Recommendations:**

1. Approve Phase 0–1 first (fast value, low risk).
2. Treat subscription auto-post + duress as P0 integration after primitives.
3. Keep release secrets off PR workflows forever.
4. Expand Vitest `include` carefully when adding `lib/` and service tests.

---



## 25. Final Implementation Roadmap


| Order | Phase | Focus                                                 |
| ----- | ----- | ----------------------------------------------------- |
| 1     | 0     | Infrastructure / env strategy / baseline green        |
| 2     | 1     | `dates`, `billingCycle`, balance edges                |
| 3     | 2     | Remaining shared business utils                       |
| 4     | 4     | Auth/privacy/settings                                 |
| 5     | 5     | FinanceData / offline integration harness             |
| 6     | 6     | Subscriptions, vaults, splits, transfers              |
| 7     | 3     | SMS unit hardening (parallel when SMS is active work) |
| 8     | 7     | Journeys + workspace routing                          |
| 9     | 8     | Android device validation                             |
| 10    | 9     | PR CI enforcement                                     |
| 11    | 10    | Android release test gate                             |


**STOP:** No phase implementation until explicit approval.

---



## Appendix A — Existing test files (baseline)

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
services/sms/expenseAdapter.test.ts
services/sms/smsPermissions.test.ts
services/sms/smsRelevanceFilter.test.ts
services/sms/smsTransactionProcessor.test.ts
```

Vitest include: `shared/**/*.test.ts`, `services/sms/**/*.test.ts`, environment `node`.

---



## Appendix B — Repo signals checked

- Branch at analysis: `feature/sms-automation` tracking `origin/feature/sms-automation`
- `main` tip observed: merge PR #2 `fix/ledger-edit-delete`
- Diff `main...HEAD`: SMS automation and related (~5k insertions)
- `package.json` scripts: test, typecheck, release:*
- Single GitHub workflow: Android Release (no test step)
- `app.json` SMS + biometric permissions; Expo 57; version 1.1.0 / versionCode 27

---

**End of TESTING_MASTER_PLAN.md**
# Expense Tracker — Mobile Migration Analysis

> **Source:** `../expense-tracker` (Vite + React 19 SPA)  
> **Destination:** `./expense-tracker-mobile` (Expo)  
> **Scope of this document:** Read-only analysis of the existing web application only. No React Native implementation guidance beyond migration complexity ratings.  
> **Scan date:** 2026-08-04  
> **Source scale:** ~318 TypeScript/TSX files under `src/`, plus Netlify functions, Playwright e2e, and Vitest unit tests.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Application Architecture & Data Flow](#3-application-architecture--data-flow)
4. [Routes](#4-routes)
5. [Pages](#5-pages)
6. [Components](#6-components)
7. [Shared Components](#7-shared-components)
8. [Layouts](#8-layouts)
9. [Context Providers](#9-context-providers)
10. [Zustand Stores](#10-zustand-stores)
11. [React Query Hooks](#11-react-query-hooks)
12. [Firebase Services](#12-firebase-services)
13. [Firestore Collections](#13-firestore-collections)
14. [Authentication](#14-authentication)
15. [CRUD Modules](#15-crud-modules)
16. [Forms](#16-forms)
17. [Tables](#17-tables)
18. [Charts](#18-charts)
19. [Modals](#19-modals)
20. [APIs](#20-apis)
21. [Utility Functions](#21-utility-functions)
22. [Constants](#22-constants)
23. [Types](#23-types)
24. [Themes](#24-themes)
25. [Assets](#25-assets)
26. [Environment Variables](#26-environment-variables)
27. [Feature Flags](#27-feature-flags)
28. [Module-by-Module Deep Dive](#28-module-by-module-deep-dive)
29. [Migration Complexity Matrix](#29-migration-complexity-matrix)
30. [Recommended Migration Phases](#30-recommended-migration-phases)

**Complexity legend used throughout:** `Low` · `Medium` · `High` · `Very High`

---

## 1. Executive Summary

The web app is a **multi-product personal-finance SPA** built with **Vite 7**, **React 19**, **React Router 7**, **Tailwind CSS 4**, and **Firebase Auth + Firestore** (persistent IndexedDB cache). It is **not** a Next.js app and has **no Zustand**. Global state is **React Context**-heavy; **TanStack Query** is used almost exclusively for portfolio market quotes.

There are effectively **two consumer apps** in one codebase (Expense Tracker and Nutrition), selected after auth via `localStorage.selectedApp`, plus a public UPI payment-request surface and a SUPER_ADMIN admin console.

**Critical migration implications:**

| Finding | Impact on mobile |
|---------|------------------|
| No Zustand — 11+ Context providers | Map to RN providers or introduce a store later; parity first |
| Firestore realtime `onSnapshot` everywhere | Relatively portable with `@react-native-firebase` or JS SDK |
| Persistent Firestore multi-tab cache | Replace with RN-compatible persistence config |
| Google `signInWithPopup` | Replace with native Google Sign-In / Expo AuthSession |
| WebAuthn biometrics + PIN + **duress UID** (`uid_duress`) | High — platform biometrics + carefully preserve isolation model |
| Netlify Functions for stocks/MF/crypto/SIP cron | Mobile must call same deployed HTTPS endpoints (or a new BFF) |
| Hub routes use `?tab=` query params | Map cleanly to Expo Router tabs / stacked screens |
| Chart.js + Recharts | Swap for RN chart libs |
| Gemini + OCR.space keys on client (`VITE_*`) | Re-evaluate secret handling for mobile builds |
| Dual shell (expense + nutrition) | Two Expo navigators or feature groups sharing auth |
| Tailwind + CSS theme variables | Rebuild with NativeWind / StyleSheet / design tokens |

---

## 2. Technology Stack

| Layer | Web choice | Notes for mobile |
|-------|------------|------------------|
| Bundler | Vite 7 + React Compiler Babel plugin + PWA | Expo toolchain |
| UI | React 19 | Expo SDK React (align versions carefully) |
| Routing | `react-router-dom` 7 (`BrowserRouter`) | Expo Router |
| Styling | Tailwind 4, `clsx`, `tailwind-merge`, animate plugin | NativeWind or tokens |
| Backend | Firebase Auth + Firestore | Same project; Storage unused on client |
| Server | Netlify Functions (+ `firebase-admin` for SIP cron) | Keep as HTTPS API for mobile |
| Server state | `@tanstack/react-query` 5 (portfolio quotes) | Reuse for market data |
| App state | React Context (no Zustand) | Portable pattern |
| Forms | Controlled inputs + RHF/Zod (portfolio/SIP) | RHF works in RN |
| Charts | chart.js / react-chartjs-2, recharts | Replace |
| Motion | framer-motion | Reanimated / Moti |
| Icons | lucide-react | lucide-react-native |
| Toasts | sonner | toast RN libs |
| PDF / CSV | jspdf, papaparse | RN document sharing / FS |
| QR | qrcode.react, html5-qrcode | expo-camera / react-native-qrcode |
| AI | `@google/generative-ai` | Same or move server-side |
| OCR | OCR.space HTTP | Same |
| Food barcode | Open Food Facts | Same |
| Market | yahoo-finance2 / MFAPI / CoinGecko via Netlify | Same proxies |

---

## 3. Application Architecture & Data Flow

### Provider tree

**`main.tsx`:**

```
AuthProvider
  └─ SystemSettingsProvider
       └─ UserDocProvider
            └─ ThemeProvider
                 └─ FinanceDataProvider
                      └─ QueryClientProvider (portfolioQueryClient)
                           └─ App
```

**Inside `App` (BrowserRouter):**

```
SettingsProvider
  └─ ModalProvider
       └─ LedgerStateProvider
            └─ CelebrationProvider
                 └─ GamificationProvider
                      └─ SubscriptionsProvider
                           └─ Routes (public payment + AppContent)
```

### Runtime decision tree

```
/payment/:slug  → Public PaymentRequestPage (no auth shell required)
/pay/:slug      → Redirect to /payment/:slug
*               → AppContent:
                    system_settings.maintenanceMode && !admin → MaintenanceScreen
                    !user → AuthPage
                    user → PrivacyLock →
                      selectedApp null → AppSelector (expense | nutrition)
                      nutrition → NutritionApp (nested Routes)
                      expense → AppRoutes (Header + hubs + BottomNav/Dock)
```

### Data flow pattern

```
Firebase Auth (realUser)
  → optional duress: effective user.uid = realUid + "_duress"
  → users/{uid} snapshot (UserDoc / Settings / Theme)
  → system_settings/global snapshot
  → FinanceDataProvider: staged expenses (limit 200 → full) + incomes + accounts*
  → Domain hooks: own onSnapshot (splits, trips, vaults, portfolio, SIP, nutrition)
  → Writes: addDoc / updateDoc / deleteDoc / writeBatch directly from hooks/UI
  → Market prices: React Query → fetch Netlify /api/* → Yahoo / MFAPI / CoinGecko
  → AI/OCR: client env keys → Gemini / OCR.space
  → SIP cron: Netlify scheduled function + Admin SDK → sip* collections
```

**Offline:** Firestore persistent local cache + finance provider tracks pending sync conceptually via listener continuity.

---

## 4. Routes

### 4.1 Public routes

| Path | Component | Auth | Purpose | Complexity |
|------|-----------|------|---------|------------|
| `/payment/:slug` | `PaymentRequestPage` | Public read | UPI QR payment request by slug | Medium |
| `/pay/:slug` | Redirect | Public | Legacy alias | Low |

### 4.2 Auth / gate (not path-routed)

| Surface | Component | Purpose | Complexity |
|---------|-----------|---------|------------|
| Unauthenticated shell | `AuthPage` | Login / signup / forgot | Medium |
| Maintenance | `MaintenanceScreen` | Global lockout | Low |
| Privacy | `PrivacyLock` | PIN / biometric / duress | High |
| App chooser | `AppSelector` | Expense vs Nutrition | Low |

### 4.3 Expense app routes (`AppRoutes`)

| Path | Page | Purpose | Complexity |
|------|------|---------|------------|
| `/` | Navigate → `/{defaultView}` | Default usually `/dashboard` | Low |
| `/dashboard` | `Dashboard` | Home widgets / net worth / focus | High |
| `/add` | `AddExpense` | Full-page add transaction | Medium |
| `/ledger` | `LedgerHub` | Tab hub (`?tab=`) | Medium |
| `/insights` | `InsightsHub` | Analytics hub (`?tab=`) | High |
| `/vaults` | `VaultsPage` | Shared vault list | Medium |
| `/vaults/:vaultId` | `VaultDetailPage` | Vault expenses / members | Medium |
| `/accounts/:accountId` | `AccountDetailPage` | Account activity ledger | High |
| `/investments/:investmentId` | `InvestmentDetailPage` | FD/interest detail (gated) | Medium |
| `/settings` | `Settings` | Large multi-section settings | High |
| `/split/:id` | `SplitDetailPage` | Split settlement | Medium |
| `/travel/new` | `CreateTripWizard` | Multi-step trip create | Medium |
| `/travel/:tripId` | `TripDetailPage` | Trip spend / budgets | Medium |
| `/seed` | `SeedData` | DEV demo seed only | Low |
| `/admin/*` | Admin layout + pages | SUPER_ADMIN console | High |
| `*` | `NotFound` | 404 | Low |

### 4.4 Legacy redirects

| From | To |
|------|----|
| `/expenses` | `/ledger?tab=expenses` |
| `/split` | `/ledger?tab=splits` |
| `/subscriptions` | `/ledger?tab=subscriptions` |
| `/investments` | `/ledger?tab=investments` |
| `/collect` | `/ledger?tab=collect` |
| `/analytics` | `/insights?tab=analytics` |
| `/analysis` | `/insights?tab=search` |
| `/advisor`, `/ask` | `/insights?tab=advisor` |

### 4.5 Ledger hub tabs (`/ledger?tab=`)

| Tab | Embedded page | Notes |
|-----|---------------|-------|
| `expenses` | `ExpenseListPage` | Journal / audit / bulk ops |
| `splits` | `SplitPage` | Bill splits list |
| `subscriptions` | `SubscriptionsPage` | Recurring / EMI / transfers |
| `travel` | `TripsPage` | Trip list |
| `cards` | `CardsPage` | Credit cards |
| `accounts` | `AccountsPage` | Bank / other accounts |
| `investments` | `InvestmentsHubPage` (`sub=stocks`) or `InvestmentsPage` (`sub=fixed`) | Feature-flagged |
| `collect` | `PaymentRequestsPage` | Create/manage payment slugs |

### 4.6 Insights hub tabs (`/insights?tab=`)

| Tab | Content |
|-----|---------|
| `analytics` | `AnalyticsPage` |
| `yearly` | `YearlyAnalytics` |
| `search` | `AnalysisLab` |
| `advisor` | `MagicChatEntry` (advisor mode) |

### 4.7 Nutrition nested routes (`NutritionApp`)

| Path | Page |
|------|------|
| `/` | `NutritionDashboard` or redirect to `/profile` |
| `/profile` | `NutritionProfilePage` |
| `/body` | `BodyTrackingPage` |
| `/analytics` | `NutritionAnalyticsPage` |
| `/meal/:dateStr/:mealId` | `NutritionMealPage` |

### 4.8 Admin routes

| Path | Page |
|------|------|
| `/admin` | `AdminDashboard` |
| `/admin/users` | `AdminUsers` |
| `/admin/user/:userId` | `AdminUserDetail` |
| `/admin/settings` | `AdminSettings` |

**Mobile nav mapping note:** `src/config/navigation.ts` defines bottom/drawer items: Home, Ledger, Vaults, Insights (+ Settings/Admin in drawer). Navigation style is user setting `bottom` | `dock`.

---

## 5. Pages

For each page: purpose, key dependencies, business logic, data flow, Firebase, APIs, complexity.

### 5.1 Auth & shell pages

#### `AuthPage.tsx`
- **Purpose:** Email/password + Google sign-in UI; forgot-password mode.
- **Dependencies:** `useAuth`, `useSystemSettings`, form UI.
- **Business logic:** Blocks signup when `disableSignups`; Google new-user path also checks system settings then may delete the Auth user.
- **Data flow:** Form → Firebase Auth SDK → auth state → app shell.
- **Firebase:** Auth (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `sendPasswordResetEmail`, Google popup).
- **APIs:** None beyond Firebase.
- **Complexity:** Medium (native Google + secure storage for sessions).

#### `AppSelector.tsx`
- **Purpose:** Choose Expense vs Nutrition after unlock.
- **Dependencies:** localStorage `selectedApp`.
- **Business logic:** Persist product selection only.
- **Firebase / APIs:** None.
- **Complexity:** Low.

#### `Dashboard.tsx`
- **Purpose:** Primary home: reorderable widgets (focus, gamification, subscriptions, top categories, overview, investments snippet, quick add, insights, budgets, goals, recent activity).
- **Dependencies:** `useFinanceData`, `useSettings`, investments flag, many dashboard widgets.
- **Business logic:** Widget visibility/order from user settings; gated investments shortcuts.
- **Data flow:** Context listeners → aggregations in utils → cards.
- **Firebase:** Indirect via finance/gamification/focus hooks.
- **APIs:** Market quotes only if investment widgets load.
- **Complexity:** High.

#### `AddExpense.tsx`
- **Purpose:** Full-page transaction entry wrapping `ExpenseForm`.
- **Dependencies:** `ExpenseForm`, modals optional.
- **Complexity:** Medium.

#### `Settings.tsx`
- **Purpose:** Multi-tab settings: prefs, privacy PIN/duress, UPI, dashboard order, navigation style, theme, export, data wipe (DEV tools when `import.meta.env.DEV`), switch app.
- **Dependencies:** `useSettings`, `useTheme`, `useAuth`, Firestore user doc, export utils.
- **Business logic:** Merges defaults into `users/{uid}`; privacy fields; bulk collection delete for reset paths.
- **Firebase:** `users/{uid}` setDoc; collection deletes for reset; settings read via UserDoc.
- **APIs:** None core; export generates CSV/PDF client-side.
- **Complexity:** High.

#### `SeedData.tsx` (DEV)
- **Purpose:** Generate/clear demo data.
- **Dependencies:** `utils/seedData.ts`.
- **Firebase:** Writes expenses, accounts, trips, splits tagged demo.
- **Complexity:** Low (optional for mobile).

#### `NotFound.tsx`
- **Purpose:** Catch-all 404.
- **Complexity:** Low.

### 5.2 Ledger-embedded pages

#### `ExpenseListPage.tsx`
- **Purpose:** Journal of expenses/incomes; search/filter; audit mode; bulk delete/recategorize; CSV export; month filtering.
- **Dependencies:** `useFinanceData` / expenses, categories, `ExpenseList`, audit components, MonthSelector.
- **Business logic:** Batch writes; audit flag updates; lock past months when setting enabled.
- **Firebase:** `users/{uid}/expenses`, `incomes`.
- **Complexity:** High.

#### `SplitPage.tsx` / `SplitDetailPage.tsx`
- **Purpose:** List and detail of bill splits; mark paid; link expense.
- **Dependencies:** `useSplits`, UPI helpers.
- **Firebase:** Root `splits`; may write linked `expenses`.
- **Complexity:** Medium.

#### `SubscriptionsPage.tsx`
- **Purpose:** Manage subscriptions/EMI/recurring transfers; show next due.
- **Dependencies:** `useSubscriptions` (provider posts on idle).
- **Firebase:** `users/{uid}/subscriptions` (+ auto-posted expenses/transfers).
- **Complexity:** Medium–High (scheduled posting semantics).

#### `TripsPage.tsx` / `CreateTripWizard.tsx` / `TripDetailPage.tsx`
- **Purpose:** Travel budgets, category caps, spend rollup.
- **Dependencies:** `useTrips`, expenses with `tripId`.
- **Firebase:** Root `trips` + `trips/{id}/categoryBudgets`; expenses cascade on delete.
- **Complexity:** Medium.

#### `CardsPage.tsx` / `AccountsPage.tsx` / `AccountDetailPage.tsx`
- **Purpose:** Credit vs bank accounts; balance reconstruction from payments/entries/transfers/expenses/incomes; pay credit bill.
- **Dependencies:** `useFinanceData`, `accountBalance` utils, modals (`PayCreditBillModal`, `EditAccountModal`, `AddAccountEntryModal`).
- **Firebase:** `accounts`, `accountTypes`, `accountPayments`, `accountEntries`, `accountTransfers`, expenses/incomes.
- **Complexity:** High (balance math + linked delete guards).

#### `InvestmentsPage.tsx` / `InvestmentDetailPage.tsx`
- **Purpose:** Classic FD / interest savings / MF (non-portfolio) investments.
- **Dependencies:** `useInvestments`, interest math utils, create/edit investment modals.
- **Firebase:** `users/{uid}/investments` (+ optional funding expense).
- **Complexity:** Medium.

#### `PaymentRequestsPage.tsx` / `CollectPaymentPage.tsx` / `PaymentRequestPage.tsx`
- **Purpose:** Create public UPI collection links/QR; public pay page by slug.
- **Dependencies:** `usePaymentRequests`, `UpiPaymentQr`, `qrStyles`, `VITE_PUBLIC_APP_URL`.
- **Firebase:** Root `paymentRequests` (doc id = slug).
- **Complexity:** Medium (deep linking + share on mobile is natural fit).

### 5.3 Insights pages

#### `AnalyticsPage.tsx` / `YearlyAnalytics.tsx` / `AnalysisLab.tsx`
- **Purpose:** Category breakdowns, trends, yearly rollups, advanced search/lab analysis.
- **Dependencies:** Finance data + analytics utils + chart components.
- **Firebase:** Read-only via expenses/incomes listeners.
- **APIs:** None.
- **Complexity:** High (compute + charting UX).

### 5.4 Vault pages

#### `VaultsPage.tsx` / `VaultDetailPage.tsx`
- **Purpose:** Shared multi-member vaults with vault-local expenses.
- **Dependencies:** `useVaults`, `useVaultExpenses`, `useUserProfilesByIds`.
- **Firebase:** Root `vaults`, `vaults/{id}/expenses`.
- **Complexity:** Medium–High (membership rules / RLS awareness).

### 5.5 Nutrition pages

| Page | Purpose | Firebase | Complexity |
|------|---------|----------|------------|
| `NutritionApp` | Shell + nested router | — | Medium |
| `NutritionDashboard` | Daily logs, water, workouts, planner | `daily_logs`, meals | Medium |
| `NutritionProfilePage` | Profile + goals setup | `profile/nutrition`, `goals/nutrition` | Medium |
| `BodyTrackingPage` | Weight history | `weight_history` | Low–Medium |
| `NutritionAnalyticsPage` | Nutrition trends | history hooks | Medium |
| `NutritionMealPage` | Per-meal foods edit | meals subcollection | Medium |

Barcode scanning (`BarcodeScanner` + Open Food Facts) adds **High** complexity on native camera.

### 5.6 Admin pages

| Page | Purpose | Complexity |
|------|---------|------------|
| `AdminDashboard` | Aggregate charts / leaderboard | High (skip early) |
| `AdminUsers` | User list | Medium |
| `AdminUserDetail` | Per-user data peek | High |
| `AdminSettings` | Edit `system_settings/global` | Medium |

Guard: `AdminRouteGuard` requires `users.role === SUPER_ADMIN`.

---

## 6. Components

Inventory by domain. Page-specific vs reusable called out in §7.

### 6.1 Shell / navigation
`Header`, `BottomNav`, `MobileActionDock`, `SideDrawer`, `FloatingAdvisor`, `AnnouncementBanner`, `MaintenanceScreen`, `PrivacyLock`, `DeferredStartupEffects`, `AppToaster`, `MonthDrawer`, `MonthSelector`, `CelebrationOverlay`, `Avatar`.

### 6.2 Transactions & categories
`ExpenseForm`, `ExpenseList`, `CategoryManager`, `CategoryPicker`, `BulkActionBar`, `ReceiptScanner`, `MagicChatEntry`, `SplitSuggestionToast`.

### 6.3 Accounts & investments (classic)
`AddAccountEntryModal`, `EditAccountModal`, `PayCreditBillModal`, `CreateInvestmentModal`, `EditInvestmentModal`, `NetWorthCard`, `StockCard`, `MutualFundCard`, `CryptoCard`.

### 6.4 Payments / UPI
`UpiPaymentQr`, `RequestUpiPayment`, `PaymentRequestShareCard`, `QrStylePicker`.

### 6.5 Analytics / focus / story / audit / gamification
Under `components/analytics/*`, `charts/*`, `focus/*`, `story/StoryViewer`, `audit/*`, `GamificationCard`, `Heatmap`, `WeeklySummary`, `CategoryBars`.

### 6.6 Nutrition
`NutritionHeader`, `NutritionBottomNav`, `MacroRing`, `WaterWidget`, `WorkoutWidget`, `BarcodeScanner`, `planner/DynamicMealPlanner`, `planner/MealCard`.

### 6.7 Portfolio / SIP feature components
See §28 (portfolio + sip). Large surface area (~20 portfolio components, ~6 SIP components).

---

## 7. Shared Components

### 7.1 Design system — `components/ui/`
| Component | Purpose | Complexity |
|-----------|---------|------------|
| `Button` | Primary actions | Low |
| `Card` | Section container | Low |
| `Input` | Text fields | Low |
| `FormField` | Label + error wrapper | Low |
| `SegmentedTabs` | In-page tabs | Low |
| `StatTile` | Metric tile | Low |
| `AddFab` | Floating add | Low |

### 7.2 Common primitives — `components/common/`
| Component | Purpose | Complexity |
|-----------|---------|------------|
| `Modal` | Dialog shell | Medium (RN Modal / bottom sheet) |
| `ConfirmDialog` | Destructive confirms | Low–Medium |
| `Amount` | Currency display (uses system currency) | Low |
| `Badge` | Status chips | Low |
| `Skeleton` | Loading placeholders | Low |
| `EmptyState` | Empty lists | Low |
| `SearchInput` | Search field | Low |
| `Collapsible` | Expand/collapse | Low |
| `NumberTicker` | Animated numbers | Medium |

### 7.3 Layout shared — `components/layout/`
`AuraBackground`, `PageShell`, `PageHeader` — reusable chrome for hubs.

### 7.4 Cross-cutting domain shared
`ExpenseForm`, charts, Month selector drawer, toasts — used from many pages via ModalProvider.

**Reuse strategy for mobile:** Rebuild `ui` + `common` first; keep domain forms portable as pure logic + RN views.

---

## 8. Layouts

| Layout | Location | Structure | Complexity |
|--------|----------|-----------|------------|
| Expense shell | `App.tsx` `AppRoutes` | AuraBackground + Header + main + FloatingAdvisor + BottomNav or MobileActionDock + global modals | Medium |
| Nutrition shell | `NutritionApp.tsx` | AuraBackground + NutritionHeader + Routes + NutritionBottomNav | Medium |
| Admin layout | `admin/components/AdminLayout.tsx` | Sidebar + Outlet + AdminBottomNav | Medium (defer) |
| PageShell / PageHeader | `components/layout/*` | Width constraint + title + tab pills | Low–Medium |
| PrivacyLock | Wrap after auth | Full-screen gate before any product UI | High |

Safe-area padding already considered in web CSS (`env(safe-area-inset-bottom)`) — favorable for mobile.

---

## 9. Context Providers

| Provider | File | Purpose | Dependencies | Business logic | Data flow | Firebase | APIs | Complexity |
|----------|------|---------|--------------|----------------|-----------|----------|------|------------|
| `AuthProvider` | `hooks/useAuth.tsx` | Session + duress effective user | Firebase Auth | Popup Google; email; signup; reset; `uid_duress` via sessionStorage | Auth state → children | Auth + category ensure | — | High |
| `SystemSettingsProvider` | `hooks/useSystemSettings.tsx` | Global flags | Firestore | Snapshot merge with defaults | One shared listener | `system_settings/global` | — | Low |
| `UserDocProvider` | `hooks/useUserDoc.tsx` | Single user doc snapshot | Auth | Feeds settings/theme/role | `users/{realUid}` | Firestore | — | Low |
| `ThemeProvider` | `hooks/useTheme.tsx` | Theme class + persistence | UserDoc | localStorage + Firestore sync | Toggle → setDoc theme | `users/{uid}.theme` | — | Medium |
| `FinanceDataProvider` | `hooks/useFinanceData.tsx` | Core money listeners + CRUD | Auth (effective uid) | Staged expense load; account cascading delete checks; payments/entries/transfers | onSnapshot → context | users/*/expenses,incomes,accounts* | — | Very High |
| `QueryClientProvider` | `main.tsx` + portfolio queryClient | RQ client | — | staleTime 60s, retry 2 | Quotes cache | — | HTTP market | Low setup / High consumers |
| `SettingsProvider` | `hooks/useSettings.tsx` | User prefs CRUD | UserDoc | Merge DEFAULTS; seed doc if missing | setters → setDoc merge | `users/{uid}` | — | Medium |
| `ModalProvider` | `hooks/useModals.tsx` | Global add/edit expense + account entry | — | UI state only | Events → modals in AppRoutes | — | — | Low |
| `LedgerStateProvider` | `hooks/useLedgerState.tsx` | Hub filter/tab UI state | — | Client-only filters | Context | — | — | Low |
| `CelebrationProvider` | `hooks/useCelebration.tsx` | Celebration overlay triggers | — | Ephemeral UI | Events → overlay | — | — | Low |
| `GamificationProvider` | `hooks/useGamification.tsx` | Streaks / points | Auth, expenses, focus | Sync stats summary | Reads/writes `stats/summary` | Firestore | — | Medium |
| `SubscriptionsProvider` | `hooks/useSubscriptions.tsx` | Recurring defs + auto-post | Finance | Idle `processSubscriptions` posts expenses/transfers | Snapshot + writes | subscriptions + expenses/transfers | — | High |

---

## 10. Zustand Stores

**None found.**

There are no `zustand` dependencies in `package.json` and no store files. All global state is Context + local React state + Firestore listeners + (portfolio) React Query.

**Mobile note:** Do not invent Zustand in analysis-only phase; Context parity is the baseline. Introducing Zustand later is optional refactor, not a port requirement.

---

## 11. React Query Hooks

Client: `features/portfolio/hooks/queryClient.ts`.

| Hook | File | Purpose | Dependencies | Business logic | Data flow | Firebase | APIs | Complexity |
|------|------|---------|--------------|----------------|-----------|----------|------|------------|
| `useMarketSearch` | `useMarketQuotes.ts` | Symbol search | RQ | Debounced query | RQ → marketDataService → Netlify | — | `/api/stock`, mutual-funds, crypto | Medium |
| `useMarketQuotes` | `useMarketQuotes.ts` | Batch live quotes | RQ | Cache keyed by symbols | Same | — | Same | Medium |
| `useHoldingsWithMetrics` | `useMarketQuotes.ts` | Holdings + live P/L | holdings hook + quotes | Join Firestore holdings to quotes | Dual source | holdings | Market APIs | High |
| SIP quote usage | `useVirtualPortfolio.ts` | Price virtual SIP positions | RQ quotes | Valuation | Firestore positions + quotes | `virtualPortfolio` | Market APIs | High |

**Everything else** (expenses, accounts, vaults, nutrition, etc.) uses **Firestore realtime**, not React Query.

---

## 12. Firebase Services

### 12.1 Client bootstrap — `src/firebase.ts`
- Initializes Firebase app from `VITE_FIREBASE_*`.
- Exports `auth`, `db` only.
- Firestore uses `persistentLocalCache` + `persistentMultipleTabManager`.
- **No Storage, Messaging, or Analytics SDK usage in client code.**

### 12.2 Access pattern
There is **no central `services/firebase*.ts` CRUD layer**. Firebase usage is embedded in:

- Context providers (`useAuth`, `useFinanceData`, …)
- Domain hooks (`useSplits`, `useTrips`, `useVaults`, portfolio hooks, nutrition hooks, …)
- Feature repository `features/sip/repositories/sipRepository.ts`
- Admin `admin/utils/dataFetching.ts`
- Occasional direct writes from pages/components (`ExpenseForm`, `ExpenseListPage`, `Settings`)

### 12.3 Server Firebase
- `netlify/functions/sip-execute.ts` uses **firebase-admin** with `FIREBASE_SERVICE_ACCOUNT_JSON` for scheduled SIP execution.

### 12.4 Auth methods used
- Google popup (`signInWithPopup` + `GoogleAuthProvider`)
- Email/password create + sign-in
- Password reset email
- `signOut`
- Profile `updateProfile` on signup
- Duress synthetic UID (not a Firebase Auth UID — path isolation only)

**Complexity:** High overall for auth platform adaptation; Medium for Firestore CRUD portability.

---

## 13. Firestore Collections

### 13.1 Root collections

| Collection | Doc ID pattern | Type | Key fields |
|------------|----------------|------|------------|
| `users` | Auth UID | `UserProfile` + settings fields | `role`, email, displayName, settings mirrors, `theme` |
| `system_settings` | `global` | `SystemSettings` | maintenance, signups, AI, investments, currency, banner, export |
| `splits` | auto | `Split` | participants, participantIds, settled, amounts |
| `trips` | auto | `Trip` | destination, dates, budget, spent, status |
| `trips/{id}/categoryBudgets` | auto | budget rows | category, limit |
| `vaults` | auto | `SharedVault` | memberIds, ownerId, budget, currency |
| `vaults/{id}/expenses` | auto | vault expense | amount, etc. |
| `paymentRequests` | **slug** | `PaymentRequest` | amount, upiId, qrStyleId, status |

### 13.2 Under `users/{uid}/`

| Path | Purpose |
|------|---------|
| `expenses` | Core expense journal |
| `incomes` | Income journal |
| `categories` | Hierarchical categories |
| `meta/categories` | Hierarchy migration marker |
| `accounts` | Bank/credit/other |
| `accountTypes` | Account type labels |
| `accountPayments` | Credit bill payments (not expenses) |
| `accountEntries` | Manual debit/credit adjustments |
| `accountTransfers` | Internal transfers (not income/expense) |
| `subscriptions` | Recurring subscription/EMI/transfer defs |
| `categoryBudgets` | Monthly category caps |
| `financialGoals` | Savings goals |
| `categorizationRules` | Keyword → category rules |
| `investments` | FD / interest / classic MF |
| `stats/summary` | Gamification `UserStats` |
| `focus/active` | Focus session |
| `holdings` | Portfolio holdings |
| `watchlist` | Watch symbols |
| `alerts` | Price alerts |
| `portfolioTransactions` | Buy/sell/cash txs |
| `portfolioOrders` | Limit orders (mock) |
| `portfolioSnapshots` | Daily snapshots (date id) |
| `portfolioSettings/{id}` | Portfolio settings doc |
| `sipPlans` | SIP plans |
| `sipTransactions` | SIP execution txs |
| `virtualPortfolio` | Virtual SIP positions |
| `notifications` | In-app SIP/portfolio notifs |
| `daily_logs/{date}` | Nutrition day summary |
| `daily_logs/{date}/meals` | Meals |
| `profile/nutrition` | Nutrition profile |
| `goals/nutrition` | Macro goals |
| `weight_history` | Weight entries |

**Duress:** When active, all `users/{uid}` paths use `realUid + "_duress"`, isolating data from the real ledger.

---

## 14. Authentication

### Flows
1. Unauthenticated user sees `AuthPage` (login / signup / forgot).
2. Google or email/password authenticates via Firebase Auth.
3. New Google users are rejected (and deleted) if `disableSignups`.
4. On auth, `ensureCategoryHierarchy` seeds/migrates categories.
5. `SystemSettings.maintenanceMode` blocks non-admins.
6. `PrivacyLock` requires PIN if configured; optional WebAuthn biometrics (`useBiometrics`).
7. Entering **fakePin** sets `sessionStorage.app_duress` and effective UID suffix `_duress`.
8. Inactivity / app-switch lock controlled by settings.
9. Admin routes require `role === SUPER_ADMIN` via `useUserRole` + `AdminRouteGuard`.
10. Logout clears Auth session; app selection can be cleared from Settings / drawers.

### Mobile migration complexity: **High**
- Replace popup Google with native auth.
- Reimplement biometrics with Expo LocalAuthentication (WebAuthn credential storage differs).
- Preserve duress isolation semantics exactly (security-sensitive).
- Secure storage for PIN hashes / tokens (currently settings store plaintext PIN fields on user doc — security review recommended during migration).

---

## 15. CRUD Modules

| Domain | Primary hooks / entry | Ops | Firebase paths | Complexity |
|--------|----------------------|-----|----------------|------------|
| Expenses / Incomes | `useFinanceData`, `ExpenseForm`, list page | CRUD, batch | `expenses`, `incomes` | High |
| Accounts ecosystem | `useFinanceData` + thin hooks | CRUD + guards | accounts* | High |
| Categories | `useCategories` | CRUD, merge, rename cascade | `categories` (+ expenses/budgets) | High |
| Budgets / rules / goals | `useCategoryBudgets`, `useCategorizationRules`, `useFinancialGoals` | CRUD | respective subcols | Medium |
| Splits | `useSplits` | CRUD + linked expense | `splits`, expenses | Medium |
| Trips | `useTrips` | CRUD + cascade | `trips`, expenses | Medium |
| Vaults | `useVaults`, `useVaultExpenses` | CRUD | `vaults` | Medium–High |
| Subscriptions | `useSubscriptions` | CRUD + auto-post | subscriptions → expenses/transfers | High |
| Classic investments | `useInvestments` | CRUD | `investments` | Medium |
| Portfolio | holdings/orders/txs/watchlist/alerts/settings/snapshots | CRUD + metrics | portfolio* | Very High |
| SIP | `sipRepository` + SIP hooks | Plans, execute, portfolio, notifs | sip* | Very High |
| Payment requests | `usePaymentRequests` | CRUD by slug | `paymentRequests` | Medium |
| Nutrition | `useDailyLog`, profile, weight | CRUD | nutrition paths | Medium–High |
| Focus / gamification | `useFocusMode`, `useGamification` | setDoc | focus, stats | Medium |
| Admin reads | `useUsers`, `dataFetching` | mostly read | cross-user | High (defer) |
| Seed | `seedData.ts` | generate/clear | many | Low |

---

## 16. Forms

| Form / surface | Validation | Purpose | Complexity |
|----------------|------------|---------|------------|
| `AuthPage` | Manual | Auth credentials | Medium |
| `ExpenseForm` | Controlled + rules | Add/edit expense or income; vault write path; last category memory | High |
| Settings sections | Controlled | Prefs / privacy / UPI / widgets | High |
| Trip wizard | Multi-step controlled | Create trip + category budgets | Medium |
| Split create/edit | Controlled | Participants & amounts | Medium |
| Vault create/edit | Controlled | Shared vault metadata | Medium |
| Account / payment / entry / transfer modals | Controlled | Money movement records | High |
| Classic investment modals | Controlled | FD/interest create/edit | Medium |
| Portfolio RHF+Zod schemas | `features/portfolio/schemas` | Add/sell/buy/cash/onboarding/alerts | High |
| `SipPlanModal` RHF+Zod | `features/sip/schemas` | SIP plan create/edit | High |
| Nutrition profile / meal editors | Controlled | Macros & foods | Medium |
| Admin settings toggles | Controlled | System flags | Low |
| Receipt / MagicChat NL | AI + parser | Semi-structured expense intake | High |

---

## 17. Tables

| Table / dense list | Location | Purpose | Complexity |
|--------------------|----------|---------|------------|
| Expense journal | `ExpenseList` / `ExpenseListPage` | Primary ledger (not DataTable lib) | High |
| `HoldingsTable` | portfolio | Holdings with metrics | High |
| Admin user lists / leaderboard | admin | Ops views | Medium |
| Orders / transactions panels | portfolio | Mock trading history | Medium |
| Account activity list | `AccountDetailPage` | Reconstruct running balance | High |

No classic AG Grid / TanStack Table dependency — custom list UIs.

---

## 18. Charts

| Chart | Lib | Location | Purpose | Complexity |
|-------|-----|----------|---------|------------|
| `CategoryPie` | Chart.js | `components/charts` | Category split | Medium |
| `MonthlyBar` | Chart.js | same | Monthly totals | Medium |
| `TrendLine` | Chart.js | same | Trends | Medium |
| `DailyTrend` | Chart.js | same | Daily spend | Medium |
| Analytics cards | mix | `components/analytics/*` | Bento insights | High |
| `PortfolioCharts` / `AllocationPieChart` / `HistoricalPerformanceChart` | Recharts | portfolio | Allocation & history | High |
| `AdminCharts` | charts | admin | Ops | Medium |
| SIP analytics panels | charts | sip | SIP performance | High |
| Nutrition analytics | custom / charts | nutrition pages | Macros over time | Medium |
| `Heatmap` | custom | components | Activity heatmap | Medium |

**Mobile:** Replace Chart.js/Recharts with RN-compatible charting; keep pure calculation utils unchanged.

---

## 19. Modals

| Modal | Purpose | Complexity |
|-------|---------|------------|
| `common/Modal` + `ExpenseForm` | Global add/edit transaction | Medium |
| `AddAccountEntryModal` | Manual account entry | Medium |
| `EditAccountModal` | Edit account metadata | Medium |
| `PayCreditBillModal` | Credit bill payment | High |
| `CreateInvestmentModal` / `EditInvestmentModal` | Classic investments | Medium |
| `FocusConfigModal` | Focus session config | Low–Medium |
| Portfolio: AddHolding, MockBuy, MockSell, CsvImport, TransactionHistory, QuickView, EditCash | Trading UX | High |
| `SipPlanModal` | SIP plan form | High |
| `ConfirmDialog` | Destructive confirms | Low |
| MonthDrawer | Global month picker (drawer, modal-like) | Medium |

---

## 20. APIs

### 20.1 Netlify Functions (`netlify/functions/`)

| Function | Client path(s) | Upstream | Purpose | Complexity |
|----------|----------------|----------|---------|------------|
| `stock.ts` | `/api/stock`, `/.netlify/functions/stock` | Yahoo (yahoo-finance2) | Quotes / search | Medium |
| `historical.ts` | `/api/historical` | Yahoo | Historical series | Medium |
| `mutualFunds.ts` | `/api/mutual-funds` | mfapi.in | India MF NAV | Medium |
| `crypto.ts` | `/api/crypto` | CoinGecko | Crypto quotes | Medium |
| `twelve-data.mjs` | `/api/twelve-data/*` | Twelve Data | Alternate market data | Medium |
| `sip-execute.ts` | `/api/sip-execute` + cron `0 3 * * *` | Firebase Admin | Execute due SIPs server-side | High |
| `_ipv4.ts` | helper | — | Force IPv4 fetch | Low |

### 20.2 Client service wrappers (`src/services/`)

| Service | Purpose | Env / endpoint | Complexity |
|---------|---------|----------------|------------|
| `stockService.ts` / `stockApi.ts` | Stock quote client | Netlify stock | Medium |
| `mutualFundService.ts` | MF client | Netlify MF | Medium |
| `cryptoService.ts` | Crypto client | Netlify crypto | Medium |
| `aiService.ts` | Gemini advisor + parse | `VITE_GEMINI_API_KEY` | High (secret hygiene) |
| `ocrService.ts` | Receipt OCR | `VITE_OCR_SPACE_API_KEY` | High |
| `openFoodFactsService.ts` | Barcode food lookup | Open Food Facts public API | Medium |
| `features/portfolio/services/marketDataService.ts` | Unified market router | Netlify APIs | Medium |
| Portfolio calc services | Pure math | — | Low (portable) |
| SIP calc / schedule / execution engine | Pure + orchestration | Firestore + cron | High |

### 20.3 Hooks wrapping market HTTP
`useStock`, `useMutualFund`, `useCrypto` — thin UI-facing wrappers around services.

---

## 21. Utility Functions

| Utility | Path | Purpose | Complexity |
|---------|------|---------|------------|
| `formatCurrency` | `utils/formatCurrency.ts` | INR/default currency formatting | Low |
| `dates` | `utils/dates.ts` | Date/month helpers | Low |
| `analytics` / `rangeAnalytics` / `monthSummary` / `weeklySummary` / `monthlyComparison` / `incomeSummary` / `insightMetrics` / `insights` / `smartSummary` / `categoryInsights` | `utils/*` | Client-side analytics math | Medium (portable) |
| `accountBalance` / `accountKind` / `billingCycle` | `utils/*` | Account balance reconstruction | High (must unit-test on RN) |
| `investmentInterest` | `utils/investmentInterest.ts` | FD interest schedules | Medium |
| `ensureCategoryHierarchy` | `utils/ensureCategoryHierarchy.ts` | Category seed/migrate | Medium |
| `categoryPreferences` | localStorage recent cats | Low |
| `csvExport` / `exportCsv` / `nutritionExport` | Export | Medium (sharing APIs differ) |
| `upi` / `paymentSlug` / `paymentRequestUrl` / `paymentRequestPath` / `qrStyles` | UPI/QR | Medium |
| `magicParser` | NL → expense fields | Medium |
| `proactiveSplits` | Split suggestions | Medium |
| `grouping` / `groupByDay` / `dayGrouping` | List grouping | Low |
| `lazyWithRetry` | Chunk load retry | Low (web-specific; Expo differs) |
| `scheduleIdle` | Idle callback | Medium (polyfill requestIdleCallback) |
| `seedData` | Demo generator | Low |
| `chartColors` | Palette | Low |
| `lib/utils` (`cn`) | className merge | Low / replace |
| `lib/toast` | Toast helpers | Low |
| `lib/formStyles` / `iconSizes` | Style constants | Low |

---

## 22. Constants

| Constant source | Contents |
|-----------------|----------|
| `types/expense.ts` `CATEGORIES` / `INCOME_SOURCES` | Taxonomy parents + income sources |
| `data/categoryTaxonomy.ts` | Hierarchical default category tree |
| `config/navigation.ts` | `CORE_NAV_ITEMS`, `ADMIN_NAV_ITEM`, active-path helpers |
| `features/portfolio/data/indianSymbols.ts` | Symbol metadata |
| `features/portfolio/data/cryptoCoins.ts` | Crypto id map |
| Settings `DEFAULTS` in `useSettings` | Default user prefs & dashboard order |
| System settings defaults in `useSystemSettings` | Feature flag defaults |
| QR style IDs in `utils/qrStyles.ts` | Visual QR themes |
| Theme union in `useTheme` | 11 themes |

---

## 23. Types

| File | Domain |
|------|--------|
| `types/expense.ts` | Expense, Income, Account*, Category, budgets, goals, rules |
| `types/user.ts` | `UserProfile`, `UserRole` |
| `types/split.ts` | Split, Participant |
| `types/trip.ts` | Trip, category budgets |
| `types/vault.ts` / `vaultExpense.ts` | Shared vaults |
| `types/paymentRequest.ts` | Public payment request |
| `types/subscription.ts` | Recurring defs |
| `types/investment.ts` | Classic investments + valuation |
| `types/focus.ts` | Focus session |
| `types/stats.ts` | Gamification stats |
| `types/nutrition.ts` | Profile, meals, goals, weight |
| `types/market.ts` | Market quote shapes |
| `features/portfolio/types` | Holdings, orders, settings, etc. |
| `features/sip/types` | SIP plans/transactions/portfolio |
| Zod schemas | `features/portfolio/schemas`, `features/sip/schemas` |

**Migration note:** Types and Zod schemas are highly portable — treat as shared package candidates.

---

## 24. Themes

- **Implementation:** CSS variables in `index.css` + `ThemeProvider` applies theme class / attribute; syncs to `users/{uid}.theme` and `localStorage` key `expense-tracker-theme`.
- **Themes:** `light`, `dark`, `midnight`, `midnight-olive`, `vintage-parchment`, `sakura-bloom`, `cyberpunk`, `nordic`, `deep-sea`, `glass-3d`, `claymorphism`.
- **Fonts (web):** Outfit + Inter (Google Fonts).
- **Complexity:** High to achieve visual parity on RN; Medium if starting with light/dark tokens only.

---

## 25. Assets

| Asset | Location | Usage |
|-------|----------|-------|
| `logo.svg`, `logo.jpeg`, `vectorized.svg`, `vite.svg` | `public/` | Branding / PWA |
| `src/assets` | effectively unused | — |
| Iconography | `lucide-react` | UI icons |
| No large image media library | — | Product is UI-driven |

---

## 26. Environment Variables

### Documented (`.env.example`)
| Variable | Client? | Purpose |
|----------|---------|---------|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Firebase (unused in client SDK) |
| `VITE_FIREBASE_MESSAGING_SENDER` | Yes | Firebase |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase |
| `TWELVE_DATA_API_KEY` | **Server only** | Twelve Data proxy |
| `VITE_PUBLIC_APP_URL` | Yes | Payment share base URL |

### Also referenced in code / deploy config
| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_GEMINI_API_KEY` | `aiService.ts` | Gemini AI |
| `VITE_OCR_SPACE_API_KEY` | `ocrService.ts` | OCR.space |
| `VITE_FIREBASE_MEASUREMENT_ID` | Netlify omit list | Analytics id (not used in scanned client) |
| `CRON_SECRET` | SIP execute | Protect cron endpoint |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | SIP execute | Admin SDK |
| `import.meta.env.DEV` | App / Settings | Seed route & Dev Tools |

Local `.env*` files exist in the web repo — **not inspected** for secret values in this analysis.

**Mobile env mapping:** Use `EXPO_PUBLIC_*` (or secure secrets for server-only). Do **not** ship OCR/Gemini/Admin secrets in a mobile binary if avoidable — prefer proxying via existing Netlify/BFF.

---

## 27. Feature Flags

### System (`system_settings/global`)
| Flag | Effect |
|------|--------|
| `maintenanceMode` | Non-admins see MaintenanceScreen |
| `disableSignups` | Block new registrations |
| `announcementBanner` | Banner text |
| `defaultCurrency` | Amount formatting |
| `enableAIFeatures` | FloatingAdvisor / AI surfaces |
| `allowDataExport` | Export permission |
| `enableInvestments` | Portfolio/FD surfaces (system-level) |

### Per-user (`users/{uid}` settings)
| Flag / setting | Effect |
|----------------|--------|
| `enableInvestments` | User-level investments gate (also in Settings DEFAULTS) |
| `navigationStyle` | `bottom` vs `dock` |
| `defaultView` | Root redirect target |
| `dashboardWidgets` / `dashboardOrder` | Home composition |
| Privacy: `ghostMode`, `privacyPin`, `fakePin`, lock timers | PrivacyLock + duress |
| `monthlyBudget`, `upiId`, `timezone`, `lockPastMonths`, `compactListMode`, `defaultCategory` | UX prefs |

### Runtime / local
| Flag | Effect |
|------|--------|
| `import.meta.env.DEV` | `/seed`, Settings Dev Tools |
| `localStorage.selectedApp` | Expense vs Nutrition shell |
| Various localStorage keys | Theme, QR style, last category, chat history, networth privacy, biometrics id |

---

## 28. Module-by-Module Deep Dive

### 28.1 Core entry & Firebase

| Module | Purpose | Deps | Business logic | Data flow | Firebase | APIs | Complexity |
|--------|---------|------|----------------|-----------|----------|------|------------|
| `main.tsx` | Bootstrap providers | React, RQ, contexts | Provider order | Mount App | Indirect | — | Low |
| `App.tsx` | Routing + shell + gates | Router, all shell deps | Auth/maintenance/app select/hubs | Location → pages | Indirect | — | High |
| `firebase.ts` | SDK init | firebase | Persistent cache | Singleton auth/db | Auth+Firestore | — | Medium |

### 28.2 Auth & privacy

| Module | Purpose | Deps | Logic | Flow | Firebase | APIs | Complexity |
|--------|---------|------|-------|------|----------|------|------------|
| `useAuth` | Session | Auth SDK | Duress UID wrapping | Auth → context | Auth | — | High |
| `useBiometrics` | WebAuthn | localStorage | Register/assert credential | Lock screen | — | WebAuthn | Very High |
| `PrivacyLock` | Gate UI | settings, biometrics | PIN / fakePin / inactivity | Blocks children | Reads settings | — | High |
| `useUserRole` / `AdminRouteGuard` | Admin access | UserDoc | SUPER_ADMIN check | Route guard | users.role | — | Medium |

### 28.3 Finance core

| Module | Purpose | Deps | Logic | Flow | Firebase | APIs | Complexity |
|--------|---------|------|-------|------|----------|------|------------|
| `useFinanceData` | Central money state | Auth uid | Staged listeners; account CRUD with link checks; payments/entries/transfers | Snapshot → UI | users/* money cols | — | Very High |
| `useExpenses` / `useIncomes` / `useAccounts*` | Thin accessors | Finance provider | Delegate | Same | Same | — | Low–Medium |
| `ExpenseForm` | Transaction capture | categories, accounts, vaults, AI/OCR optional | Writes expense/income or vault expense; category memory | Form → Firestore | expenses/incomes/vault expenses | AI/OCR optional | High |
| `accountBalance` utils | Reconstruct balances | finance entities | Credit cycles, payments, transfers | Pure compute | — | — | High |

### 28.4 Categories, budgets, rules, goals

| Module | Purpose | Complexity |
|--------|---------|------------|
| `useCategories` + Taxonomy + CategoryManager/Picker | Hierarchical categories; rename/merge cascades to expenses/budgets | High |
| `useCategoryBudgets` | Monthly caps | Medium |
| `useCategorizationRules` | Keyword rules for Magic/OCR assist | Medium |
| `useFinancialGoals` | Goal tracking | Low–Medium |

### 28.5 Recurring subscriptions

| Module | Purpose | Deps | Logic | Flow | Firebase | APIs | Complexity |
|--------|---------|------|-------|------|----------|------|------------|
| `useSubscriptions` | CRUD + process | Finance | Idle posting for due month; transfer vs expense types | onSnapshot + writes | subscriptions, expenses, transfers | — | High |

### 28.6 Splits, trips, vaults, collect

Covered in pages/CRUD; module complexity **Medium–High**. Shared firestore root collections require security rules awareness on mobile (same backend).

### 28.7 Insights & AI

| Module | Purpose | Deps | Logic | Flow | Firebase | APIs | Complexity |
|--------|---------|------|-------|------|----------|------|------------|
| Analytics pages + utils | Client aggregates | expenses | Pure math | Context → charts | Read-only | — | High |
| `MagicChatEntry` / `FloatingAdvisor` / `aiService` | NL entry + advisor | Gemini, finance context | Prompt + parse → optional expense create | Chat UI ↔ API | Optional writes | Gemini | High |
| `ReceiptScanner` / `ocrService` | OCR receipts | camera/file + OCR.space | Parse amount/date/merchant | Image → OCR → form prefills | — | OCR.space | High |
| `useStoryGenerator` + `StoryViewer` | Shareable stories | analytics | Compose frames | Client-only | — | — | Medium |

### 28.8 Portfolio feature (`features/portfolio`)

- **Purpose:** Virtual brokerage: holdings, mock buy/sell, limit orders, watchlist, alerts, snapshots, CSV import, net worth, onboarding.
- **Dependencies:** RQ market quotes, Firestore portfolio collections, Zod/RHF modals, Recharts.
- **Business logic:** Position avg cost, P/L, allocation, historical backfill via `/api/historical`, limit order processing client-side.
- **Data flow:** Firestore holdings/orders/txs ←→ UI; prices from Netlify; snapshots written daily/keyed by date.
- **Firebase:** holdings, watchlist, alerts, portfolioTransactions, portfolioOrders, portfolioSnapshots, portfolioSettings.
- **APIs:** stock, mutual-funds, crypto, historical, twelve-data.
- **Complexity:** **Very High**.

### 28.9 SIP feature (`features/sip`)

- **Purpose:** Systematic investment plans, virtual portfolio positions, catch-up, notifications, analytics.
- **Dependencies:** `sipRepository`, schedule/calc/execution services, simulation provider, RQ quotes, cron function.
- **Business logic:** Schedule next SIP dates; server cron executes buys; client can catch up; notifications mark read.
- **Data flow:** Plans → cron/execute → transactions + virtualPortfolio + notifications → dashboard.
- **Firebase:** sipPlans, sipTransactions, virtualPortfolio, notifications.
- **APIs:** `/api/sip-execute`, market quotes.
- **Complexity:** **Very High**.

### 28.10 Nutrition twin app

- **Purpose:** Daily meals, macros, water, workouts, weight, meal planner, barcode foods.
- **Dependencies:** nutrition hooks, Open Food Facts, scanner, charts.
- **Business logic:** Goals from profile formulas; meal totals roll into daily log.
- **Data flow:** Profile/goals docs; daily_logs + meals subcollections; weight_history.
- **Firebase:** as listed in §13.
- **APIs:** Open Food Facts (+ camera).
- **Complexity:** **High** (camera/barcode especially).

### 28.11 Admin

- **Purpose:** System settings editor; user inspection; charts/leaderboard.
- **Dependencies:** Admin guard, `useUsers`, `dataFetching`.
- **Firebase:** `system_settings`, cross-user reads.
- **Complexity:** **High**; **defer** for consumer mobile v1.

### 28.12 Services layer summary

| Service | Complexity |
|---------|------------|
| Market (stock/MF/crypto/marketData) | Medium (reuse HTTPS) |
| AI / OCR | High (secrets + UX) |
| Open Food Facts | Medium |
| SIP calculation/schedule (pure) | Medium portable |
| SIP execution (server) | Keep server; mobile triggers/status only |

---

## 29. Migration Complexity Matrix

### By capability (consumer mobile priority)

| Capability | Complexity | Notes |
|------------|------------|-------|
| Types + Zod + pure utils | Low | Share as-is |
| Firebase Firestore CRUD patterns | Medium | Persistence config differs |
| Auth email/password | Medium | Firebase Auth RN |
| Auth Google | High | Native Google Sign-In |
| Privacy PIN | Medium–High | Secure storage review |
| Biometrics | Very High | WebAuthn ≠ LocalAuthentication |
| Duress mode | High | Must preserve path isolation |
| Expense/income journal + form | High | Core product |
| Accounts / credit bills / balances | High | Delicate finance logic |
| Categories hierarchy | High | Cascade operations |
| Subscriptions auto-post | High | Background/idle timing |
| Splits / trips / vaults | Medium–High | Collaboration + rules |
| Payment requests + deep links | Medium | Strong mobile fit |
| Dashboard widgets | High | Many deps |
| Insights / charts | High | Chart library swap |
| AI advisor + Magic chat | High | Key security |
| Receipt OCR | High | Camera + OCR |
| Classic investments | Medium | Portable math |
| Portfolio trading suite | Very High | Phase later |
| SIP + cron dependency | Very High | Phase later |
| Nutrition + barcode | High | Optional phase |
| Admin console | High | Likely stay web-only |
| Themes (full 11) | High | Start with 2–3 |
| Tailwind / framer-motion UI | High | Redesign for RN |

### Notably absent for migration planning

- **Zustand** — nothing to port; Context is the model.
- **Firebase Storage** — unused on client (no receipt image upload path found).
- **Next.js SSR** — SPA only; Expo Router is a closer analogue to client routing.

---

## 30. Recommended Migration Phases

>(Analysis-only ordering; no implementation in this document.)

### Phase 0 — Foundation
Shared types, Firebase init (Auth+Firestore), theme tokens (light/dark), env wiring, navigation shell matching `CORE_NAV_ITEMS`.

### Phase 1 — Auth & Privacy
Email/password + Google; Settings subset; PrivacyLock PIN; decide biometrics/duress timeline.

### Phase 2 — Core ledger
FinanceDataProvider equivalent; ExpenseForm; Expense list; accounts basic; categories; month filters; Dashboard MVP.

### Phase 3 — Ledger hubs
Subscriptions, splits, trips, cards/accounts detail, payment collect + universal links to `/payment/:slug`.

### Phase 4 — Insights
Port analytics utils; pick RN chart library; Analysis Lab lite; AI behind feature flag + server proxy.

### Phase 5 — Vaults & investments (classic)
Shared vaults; FD/interest investments.

### Phase 6 — Portfolio & SIP
Depends on stable Netlify market/SIP endpoints from the mobile network path; treat as advanced pack.

### Phase 7 — Nutrition
Separate navigator; barcode last.

### Phase 8 — Admin
Prefer keeping admin on web unless there is a clear operational need.

---

## Appendix A — Source tree map (significant)

```
expense-tracker/
  src/
    main.tsx, App.tsx, firebase.ts, index.css
    admin/          # Admin layout, pages, charts, dataFetching
    components/     # UI shell, forms, analytics, charts, nutrition, …
    config/         # navigation.ts
    data/           # categoryTaxonomy
    features/
      portfolio/    # full virtual brokerage module
      sip/          # SIP plans + repository + cron-facing data
    guards/         # AdminRouteGuard
    hooks/          # 40+ domain + context hooks
    lib/            # cn, toast, formStyles
    pages/          # expense + nutrition pages
    services/       # AI, OCR, market HTTP clients
    styles/         # form.css legacy
    types/          # domain types
    utils/          # analytics, money, UPI, export, seed, …
  netlify/functions/ # stock, historical, mutualFunds, crypto, sip-execute, twelve-data
  public/           # logos
  e2e/, tests/      # Playwright + Vitest
```

## Appendix B — Provider & route cheat sheet

1. Public: `/payment/:slug`
2. Auth gate → PrivacyLock → AppSelector
3. Expense: Dashboard / Ledger(?tab) / Insights(?tab) / Vaults / Settings / detail routes / Admin
4. Nutrition: `/`, `/profile`, `/body`, `/analytics`, `/meal/:dateStr/:mealId`

## Appendix C — Confirmation: no Zustand

Searched dependencies and `src/` for Zustand usage: **none**. Mobile analysis should not assume store files exist in the web app.

---

*Generated for pre-migration understanding of `expense-tracker`. This document intentionally contains no React Native implementation code and does not modify the source web application.*

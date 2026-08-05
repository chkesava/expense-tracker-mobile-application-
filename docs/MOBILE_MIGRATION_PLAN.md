# Expense Tracker — Mobile Migration Plan

> **Based on:** [`MOBILE_ANALYSIS.md`](./MOBILE_ANALYSIS.md)  
> **Source:** `../expense-tracker`  
> **Destination:** `./expense-tracker-mobile` (Expo)  
> **Scope:** Planning only — no React Native implementation, no project code changes.  
> **Ordering principle:** Lowest dependency → highest dependency (foundation before features that consume it).

**Complexity legend:** `Low` · `Medium` · `High` · `Very High`

---

## Phase Overview

| Phase | Name | Depends on | Est. complexity |
|-------|------|------------|-----------------|
| 0 | Shared contracts & portable pure logic | — | Low |
| 1 | App foundation (Expo shell, env, Firebase, design tokens) | 0 | Medium |
| 2 | Authentication & system gates ✅ **Done** | 0, 1 | High |
| 3 | User document, settings & theme ✅ **Done** | 0–2 | Medium |
| 4 | Privacy lock (PIN; biometrics optional) | 0–3 | High |
| 5 | Expense shell navigation & chrome | 0–4 | Medium |
| 6 | Core finance data layer | 0–5 | Very High |
| 7 | Categories, budgets, rules & goals | 0–6 | High |
| 8 | Transactions (form, list, month filter) | 0–7 | High |
| 9 | Accounts, cards & account detail | 0–8 | High |
| 10 | Dashboard MVP | 0–9 | High |
| 11 | Recurring subscriptions | 0–8, 9 | High |
| 12 | Splits | 0–8 | Medium–High |
| 13 | Travel / trips | 0–8 | Medium |
| 14 | Payment collect & public pay deep links | 0–5, 3 | Medium |
| 15 | Insights (analytics, yearly, discovery) | 0–8, 10 | High |
| 16 | AI advisor, Magic chat & receipt OCR | 0–8, 15 (partial) | High |
| 17 | Shared vaults | 0–8 | Medium–High |
| 18 | Classic investments (FD / interest / MF) | 0–9, feature flags | Medium |
| 19 | Focus, gamification & polish widgets | 0–10 | Medium |
| 20 | Portfolio (virtual brokerage) | 0–10, 18 flags, Netlify APIs | Very High |
| 21 | SIP plans & virtual SIP | 0–20 (quotes), cron | Very High |
| 22 | Nutrition twin app | 0–4, 5 shell patterns | High |
| 23 | Admin console (optional / defer) | 0–3, role gate | High |
| 24 | Native Google Sign-In & store build prep | 2 (auth), Play Store gate | High |

**Shippable consumer MVP** (feature set) is approximately end of **Phase 14** (with Insights optional as Phase 15). Portfolio/SIP/Nutrition/Admin are post-MVP. **Play Store upload requires Phase 24** (native Google + EAS) — Expo Go bridge from Phase 2 is not enough for production.

---

## Phase 0 — Shared Contracts & Portable Pure Logic

Port nothing that needs React Native or Firebase listeners yet. Extract the dependency-free domain surface the rest of the app will import.

### Modules
- Domain TypeScript types
- Zod schemas (portfolio/SIP can wait until those phases, but expense-adjacent schemas if any)
- Category taxonomy constants
- Pure money/date/analytics/UPI/interest utils
- Navigation config constants (`CORE_NAV_ITEMS` shape)

### Dependencies
- None (first phase)

### Files (source → conceptual mobile targets)
| Source (`expense-tracker`) | Role |
|----------------------------|------|
| `src/types/*.ts` | Domain types |
| `src/data/categoryTaxonomy.ts` | Default hierarchy |
| `src/config/navigation.ts` | Nav item IDs/paths/labels |
| `src/utils/formatCurrency.ts` | Currency display |
| `src/utils/dates.ts` | Date/month helpers |
| `src/utils/accountBalance.ts` (+ tests) | Balance reconstruction |
| `src/utils/accountKind.ts` | Credit vs bank |
| `src/utils/billingCycle.ts` | Credit cycles |
| `src/utils/investmentInterest.ts` (+ tests) | FD math |
| `src/utils/analytics.ts`, `rangeAnalytics.ts`, `monthSummary.ts`, `weeklySummary.ts`, `monthlyComparison.ts`, `incomeSummary.ts`, `insightMetrics.ts`, `insights.ts`, `smartSummary.ts`, `categoryInsights.ts` | Analytics math |
| `src/utils/grouping.ts`, `groupByDay.ts`, `dayGrouping.ts` | List grouping |
| `src/utils/upi.ts`, `paymentSlug.ts`, `paymentRequestUrl.ts`, `paymentRequestPath.ts`, `qrStyles.ts` | UPI/QR helpers |
| `src/utils/magicParser.ts` | NL parsing helpers |
| `src/utils/chartColors.ts` | Palette constants |
| `src/utils/formatCurrency.test.ts` and sibling `*.test.ts` | Port or re-run under Vitest/Jest |

### Estimated Complexity
**Low**

### Acceptance Criteria
- [ ] Types compile in the mobile TS project without web-only imports (`window`, `document`, Vite `import.meta.env`).
- [ ] Pure util unit tests pass on the mobile toolchain (or shared package).
- [ ] No Firebase, React Navigation, or UI packages required to use this layer.
- [ ] Taxonomy and `CATEGORIES` / `INCOME_SOURCES` match web behavior.

---

## Phase 1 — App Foundation (Expo Shell, Env, Firebase, Design Tokens)

Establish the runnable Expo app skeleton and backend connectivity before any product screens.

### Modules
- Expo Router root layout
- Env mapping (`EXPO_PUBLIC_*` ↔ former `VITE_*`)
- Firebase Auth + Firestore init (RN-compatible persistence)
- Design tokens (start with `light` + `dark` only)
- Shared UI primitives shell (`Button`, `Input`, `Card`, `Amount`, `EmptyState`, `Skeleton`, toast)
- Assets (logo)

### Dependencies
- Phase 0 (types/constants)

### Files
| Source | Role |
|--------|------|
| `src/firebase.ts` | Init pattern (adapt persistence; drop multi-tab manager) |
| `.env.example` | Env inventory |
| `src/index.css` / theme CSS variables | Token source of truth |
| `src/hooks/useTheme.tsx` | Theme union / storage key semantics |
| `src/components/ui/*` | Primitive API surface |
| `src/components/common/{Amount,Badge,EmptyState,Skeleton,SearchInput,ConfirmDialog}.tsx` | Common primitives |
| `src/lib/toast.ts`, `src/lib/utils.ts` | Toast + `cn` replacement strategy |
| `public/logo.svg` (and jpeg) | Branding |
| Mobile scaffold: `app/_layout.tsx`, `app.json`, `package.json` | Existing Expo template base |

### Estimated Complexity
**Medium**

### Acceptance Criteria
- [ ] App launches on iOS/Android simulator with Expo.
- [ ] Firebase Auth + Firestore clients initialize from env without secrets leaked for server-only keys.
- [ ] Light/dark tokens apply consistently to primitives.
- [ ] Toast + basic form controls render and are accessible.
- [ ] Offline Firestore persistence strategy documented and enabled for RN.

---

## Phase 2 — Authentication & System Gates

Users can sign in/out; maintenance and signup flags work before any private finance data loads.

### Modules
- `AuthProvider` / `useAuth` (realUser vs session user; **no duress yet** or stub only)
- Auth UI (login / signup / forgot)
- Google Sign-In via **web bridge** (Expo Go) + email/password — same Firebase UID as web
- `SystemSettingsProvider` (maintenance, disableSignups, currency, banners, feature flags)
- `MaintenanceScreen`
- Post-login `ensureCategoryHierarchy` trigger

### Google auth — Phase 2 scope vs later
| Track | When | What |
|-------|------|------|
| **Expo Go / early mobile** | Phase 2 | Web bridge (`/mobile-google-auth`) → Google OAuth ID token → `signInWithCredential`. See `docs/GOOGLE_AUTH_BRIDGE.md`. |
| **Production / Play Store** | **Phase 24** (do not skip) | Native `@react-native-google-signin/google-signin` — **cannot run in Expo Go**; needs custom native build (EAS / `expo run:android`), Android `package`, SHA-1 OAuth client, and usually `google-services.json`. Same Google account → same UID as web. |

### Dependencies
- Phase 0, 1
- Web deploy of `/mobile-google-auth` for Expo Go Google login

### Files
| Source | Role |
|--------|------|
| `src/hooks/useAuth.tsx` | Auth context & methods |
| `src/pages/AuthPage.tsx` | Auth UI |
| `src/hooks/useSystemSettings.tsx` | `system_settings/global` |
| `src/components/MaintenanceScreen.tsx` | Maintenance gate |
| `src/utils/ensureCategoryHierarchy.ts` | Category seed on login |
| `src/components/AnnouncementBanner.tsx` | Optional banner |
| Web: `MobileGoogleAuthPage.tsx` | Expo Go Google bridge (not native) |

### Estimated Complexity
**High** (Google bridge + Auth state mapping; native Google deferred to Phase 24)

### Acceptance Criteria
- [x] Email/password signup, login, password reset, logout work against the same Firebase project as web.
- [x] Google sign-in via web bridge works in Expo Go and maps to the same Firebase UID as web (Google OAuth ID token — not Firebase JWT).
- [x] New signups blocked when `disableSignups` is true (including Google new-user rejection path parity).
- [x] Non-admins see maintenance screen when `maintenanceMode` is true; admins can bypass (role read can be minimal).
- [x] Category hierarchy ensure runs once per authenticated session without crashing.
- [x] Unauthenticated users cannot reach expense routes.
- [x] Phase 24 native Google / store build is listed as a release gate (not forgotten after features ship).

**Status:** Completed (2026-08-05) — verified on device with Google via web bridge; signed-in home shows Firebase session (same project / UID path as web). Native Google remains Phase 24.

---

## Phase 3 — User Document, Settings & Theme Sync

Wire the shared user document that all later phases read for prefs and role.

### Modules
- `UserDocProvider` / `useUserDoc`
- `SettingsProvider` / `useSettings` (DEFAULTS merge + seed)
- Theme persistence to `users/{uid}.theme` + local storage analogue
- Settings screen **subset** (prefs without full privacy suite yet)
- `useUserRole` (USER vs SUPER_ADMIN)

### Dependencies
- Phase 0–2

### Files
| Source | Role |
|--------|------|
| `src/hooks/useUserDoc.tsx` | `users/{realUid}` snapshot |
| `src/hooks/useSettings.tsx` | Prefs merge/setters |
| `src/hooks/useTheme.tsx` | Theme sync |
| `src/hooks/useUserRole.ts` | Role |
| `src/types/user.ts` | Profile/role types |
| `src/pages/Settings.tsx` | Settings UI (subset) |

### Estimated Complexity
**Medium**

### Acceptance Criteria
- [x] Single shared listener for `users/{uid}` feeds settings and theme (no N× snapshots for those fields).
- [x] Missing user doc is seeded with DEFAULTS (parity with web merge).
- [x] Changing theme/settings on mobile reflects in Firestore and survives relaunch.
- [x] `enableInvestments`, `navigationStyle`, `defaultView`, budget/UPI/timezone prefs readable by later phases.
- [x] Role resolves correctly for SUPER_ADMIN vs USER.

**Status:** Implemented (2026-08-05) — code complete; confirm persistence on device via Settings screen.

---

## Phase 4 — Privacy Lock (PIN; Biometrics Optional)

Gate the authenticated product behind privacy controls before loading finance shells.

### Modules
- `PrivacyLock`
- PIN set/change/verify from settings
- Inactivity / app-switch lock settings
- **Duress / fakePin** (`uid` → `uid_duress`) — required for parity if privacy is shipped
- Biometrics (`useBiometrics`) — can be Phase 4b

### Dependencies
- Phase 0–3 (especially settings + auth realUser)

### Files
| Source | Role |
|--------|------|
| `src/components/PrivacyLock.tsx` | Gate UI |
| `src/hooks/useBiometrics.ts` | WebAuthn → map to LocalAuthentication |
| `src/hooks/useAuth.tsx` | Duress effective user |
| `src/pages/Settings.tsx` (privacy sections) | PIN / fakePin / timers |

### Estimated Complexity
**High** (PIN + duress); **Very High** if biometrics included in same phase

### Acceptance Criteria
- [ ] With PIN configured, app content is blocked until correct PIN.
- [ ] Wrong PIN does not unlock; rate-limit / UX matches product intent.
- [ ] Fake PIN activates duress session: effective Firestore paths use `{uid}_duress`.
- [ ] Leaving duress/logout restores real user isolation; no cross-leak of real ledger into duress paths.
- [ ] Inactivity and background lock settings behave on mobile lifecycle events.
- [ ] *(If in scope)* Biometric unlock works on supported devices and fails closed when unavailable.

---

## Phase 5 — Expense Shell Navigation & Chrome

Authenticated, unlocked users get the expense product chrome and route map without full ledger data.

### Modules
- App selector stub or default-to-expense (Nutrition deferred to Phase 22)
- Expense root tabs/stack mapping `CORE_NAV_ITEMS` (Home, Ledger, Vaults, Insights, Settings)
- Header / BottomNav or Dock (`navigationStyle`)
- `PageShell` / `PageHeader` / `Modal` shell
- `ModalProvider`, `LedgerStateProvider` (UI state only)
- Placeholder screens for Dashboard, Ledger, Insights, Vaults, Settings
- Safe-area handling

### Dependencies
- Phase 0–4

### Files
| Source | Role |
|--------|------|
| `src/App.tsx` | Shell decision tree / routes |
| `src/config/navigation.ts` | Tab map |
| `src/components/Header.tsx`, `BottomNav.tsx`, `MobileActionDock.tsx`, `SideDrawer.tsx` | Chrome |
| `src/components/layout/*` | Page chrome |
| `src/components/common/Modal.tsx` | Modal shell |
| `src/hooks/useModals.tsx`, `useLedgerState.tsx` | UI providers |
| `src/pages/AppSelector.tsx` | Product chooser |

### Estimated Complexity
**Medium**

### Acceptance Criteria
- [ ] Bottom or dock nav switches correctly based on `navigationStyle`.
- [ ] Routes exist for dashboard, ledger hub, insights hub, vaults, settings (placeholders OK).
- [ ] Active nav highlighting mirrors `isNavItemActive` path rules.
- [ ] Global modal host can open/close an empty or stub modal.
- [ ] Investments nav remains hidden when `enableInvestments` is false (system or user flag).

---

## Phase 6 — Core Finance Data Layer

Central realtime finance context; no full UI yet beyond smoke screens if useful.

### Modules
- `FinanceDataProvider` / `useFinanceData`
- Thin hooks: `useExpenses`, `useIncomes`, `useAccounts`, `useAccountTypes`, `useAccountPayments`, `useAccountEntries`, `useAccountTransfers`
- Staged expense load (initial limit → full)
- Account CRUD with cascading link checks
- Payments / entries / transfers writes

### Dependencies
- Phase 0–5 (auth effective uid, shell)

### Files
| Source | Role |
|--------|------|
| `src/hooks/useFinanceData.tsx` | Core provider |
| `src/hooks/useExpenses.ts`, `useIncomes.ts`, `useAccounts.ts`, `useAccountTypes.ts`, `useAccountPayments.ts`, `useAccountEntries.ts`, `useAccountTransfers.ts` | Thin accessors |
| `src/types/expense.ts` | Account/expense shapes |
| `src/utils/accountBalance.ts`, `accountKind.ts`, `billingCycle.ts` | Already in Phase 0; wired here |

### Estimated Complexity
**Very High**

### Acceptance Criteria
- [ ] Expenses, incomes, accounts, types, payments, entries, transfers listen under `users/{effectiveUid}/…`.
- [ ] Staged load strategy does not block first paint indefinitely; full set eventually consistent.
- [ ] Creating/updating/deleting accounts enforces the same linked-document guards as web.
- [ ] Balance helpers given provider data match web unit-test cases.
- [ ] Duress uid (if enabled) isolates this entire layer.

---

## Phase 7 — Categories, Budgets, Rules & Goals

Category hierarchy and related planning entities required by the expense form and dashboard.

### Modules
- `useCategories` + CategoryManager / CategoryPicker
- `useCategoryBudgets`
- `useCategorizationRules`
- `useFinancialGoals`
- Taxonomy ensure already done; UI to manage hierarchy

### Dependencies
- Phase 0, 6 (expenses cascade on rename/merge)

### Files
| Source | Role |
|--------|------|
| `src/hooks/useCategories.ts` | CRUD + rename/merge cascades |
| `src/hooks/useCategoryBudgets.ts` | Budgets |
| `src/hooks/useCategorizationRules.ts` | Keyword rules |
| `src/hooks/useFinancialGoals.ts` | Goals |
| `src/components/CategoryManager.tsx`, `CategoryPicker.tsx` | UI |
| `src/data/categoryTaxonomy.ts` | Defaults |
| `src/utils/ensureCategoryHierarchy.ts` | Seed |

### Estimated Complexity
**High**

### Acceptance Criteria
- [ ] Hierarchical parent/subcategory pickers work offline-tolerant via Firestore cache.
- [ ] Rename/merge updates related expenses/budgets consistently with web.
- [ ] Budgets, rules, and goals CRUD succeed and appear via snapshots.
- [ ] Archived/hidden/favorite flags respected in pickers.

---

## Phase 8 — Transactions (Form, List, Month Filter)

Core user value: add/edit/list expenses and incomes.

### Modules
- `ExpenseForm` (without OCR/AI dependencies initially)
- Add expense screen + global add modal
- `ExpenseList` / `ExpenseListPage` (journal tab)
- Month selector / `MonthDrawer`
- Bulk delete / recategorize / audit flags (can be 8b)
- Compact list mode / lock past months settings

### Dependencies
- Phase 6–7, ModalProvider (5)

### Files
| Source | Role |
|--------|------|
| `src/components/ExpenseForm.tsx` | Capture |
| `src/components/ExpenseList.tsx` | List |
| `src/pages/ExpenseListPage.tsx` | Journal hub body |
| `src/pages/AddExpense.tsx` | Full-page add |
| `src/pages/LedgerHub.tsx` | Hub host (`?tab=expenses`) |
| `src/components/MonthDrawer.tsx`, `MonthSelector.tsx` | Month filter |
| `src/components/BulkActionBar.tsx` | Bulk ops |
| `src/components/audit/*` | Audit UX |

### Estimated Complexity
**High**

### Acceptance Criteria
- [ ] User can create expense and income with category, account, date, note, tags.
- [ ] Edit and delete work; list updates in realtime.
- [ ] Month filtering and past-month lock respect settings.
- [ ] Ledger hub shows Journal tab as default when `tab` missing/invalid.
- [ ] Last-used category preference persists (AsyncStorage analogue of localStorage).
- [ ] Batch delete/recategorize (if in scope) uses batched writes safely.

---

## Phase 9 — Accounts, Cards & Account Detail

Full account ecosystem UI on top of the finance layer.

### Modules
- `AccountsPage`, `CardsPage`
- `AccountDetailPage` (running activity)
- Modals: `EditAccountModal`, `AddAccountEntryModal`, `PayCreditBillModal`
- Net worth inputs from accounts (without portfolio)

### Dependencies
- Phase 6–8

### Files
| Source | Role |
|--------|------|
| `src/pages/AccountsPage.tsx`, `CardsPage.tsx`, `AccountDetailPage.tsx` | Screens |
| `src/components/EditAccountModal.tsx`, `AddAccountEntryModal.tsx`, `PayCreditBillModal.tsx` | Modals |
| `src/components/NetWorthCard.tsx` | Partial (accounts-only) |
| `src/utils/accountBalance.ts` | Display math |

### Estimated Complexity
**High**

### Acceptance Criteria
- [ ] Credit vs bank accounts display correct balances vs web for the same fixtures.
- [ ] Manual entries, transfers, and credit bill payments write the correct collections (not as expenses/incomes).
- [ ] Account detail activity timeline and running balance match helper output.
- [ ] Deleting an account blocked when linked documents exist (same rules as web).
- [ ] Ledger tabs `accounts` and `cards` navigate correctly.

---

## Phase 10 — Dashboard MVP

Compose home from existing data modules; advanced widgets can follow in Phase 19.

### Modules
- `Dashboard` with configurable widget order/visibility
- Overview, recent activity, top categories, budget alerts, financial goals, quick add
- Investments/focus/gamification widgets stubbed or hidden until later phases

### Dependencies
- Phase 5–9 (settings order + finance + categories + goals)

### Files
| Source | Role |
|--------|------|
| `src/pages/Dashboard.tsx` | Home |
| `src/hooks/useSettings.tsx` | `dashboardWidgets` / `dashboardOrder` |
| Supporting cards already under `src/components/*` | Widget pieces |

### Estimated Complexity
**High**

### Acceptance Criteria
- [ ] Default view routing lands on dashboard (or user `defaultView`).
- [ ] Widget order/visibility matches settings; unknown widgets ignored safely.
- [ ] Quick add opens expense modal/screen.
- [ ] Investments widgets do not appear when `enableInvestments` is false.
- [ ] Dashboard remains usable offline from Firestore cache.

---

## Phase 11 — Recurring Subscriptions

### Modules
- `SubscriptionsProvider` / `useSubscriptions`
- `SubscriptionsPage`
- Idle/startup `processSubscriptions` auto-posting of expenses/transfers
- Recurring EMI / subscription / transfer types

### Dependencies
- Phase 6–9 (needs expenses/transfers/accounts)

### Files
| Source | Role |
|--------|------|
| `src/hooks/useSubscriptions.tsx` | Provider + processing |
| `src/pages/SubscriptionsPage.tsx` | UI |
| `src/types/subscription.ts` | Types |
| `src/App.tsx` / `DeferredStartupEffects.tsx` | Idle scheduling analogue |
| `src/utils/scheduleIdle.ts` | Idle helper (adapt) |

### Estimated Complexity
**High**

### Acceptance Criteria
- [ ] CRUD for subscription definitions works.
- [ ] Due items post exactly once per period (`lastProcessed` semantics preserved).
- [ ] Transfer-type recurrings create `accountTransfers`, not expenses.
- [ ] Processing runs after auth without blocking UI (idle/background-safe).
- [ ] Ledger `subscriptions` tab shows active/completed correctly.

---

## Phase 12 — Splits

### Modules
- `useSplits`
- `SplitPage`, `SplitDetailPage`
- Linked expense creation
- UPI settle helpers / share affordances
- Optional `SplitSuggestionToast` / `proactiveSplits`

### Dependencies
- Phase 6–8 (expenses); UPI utils from Phase 0

### Files
| Source | Role |
|--------|------|
| `src/hooks/useSplits.ts` | CRUD |
| `src/pages/SplitPage.tsx`, `SplitDetailPage.tsx` | UI |
| `src/types/split.ts` | Types |
| `src/utils/proactiveSplits.ts` | Suggestions |
| `src/components/SplitSuggestionToast.tsx` | Toast UX |

### Estimated Complexity
**Medium–High**

### Acceptance Criteria
- [ ] Splits persist in root `splits` with `participantIds` synced.
- [ ] Creating a split can create the linked personal expense.
- [ ] Detail screen supports settle/paid participant updates.
- [ ] Delete does not leave orphaned inconsistent state vs web rules.
- [ ] Deep link/route `/split/:id` opens detail.

---

## Phase 13 — Travel / Trips

### Modules
- `useTrips`
- `TripsPage`, `CreateTripWizard`, `TripDetailPage`
- Trip category budgets subcollection
- Expense `tripId` linkage and spend rollup; cascade on delete

### Dependencies
- Phase 6–8

### Files
| Source | Role |
|--------|------|
| `src/hooks/useTrips.ts` | CRUD + cascade |
| `src/pages/TripsPage.tsx`, `CreateTripWizard.tsx`, `TripDetailPage.tsx` | UI |
| `src/types/trip.ts` | Types |

### Estimated Complexity
**Medium**

### Acceptance Criteria
- [ ] Multi-step create writes trip + categoryBudgets.
- [ ] Expenses tagged with `tripId` roll into spent totals.
- [ ] Delete trip cleans budgets and unlinks/deletes related expenses per web behavior.
- [ ] Routes `/travel/new` and `/travel/:tripId` work; ledger `travel` tab lists trips.

---

## Phase 14 — Payment Collect & Public Pay Deep Links

Strong mobile-native fit; only needs auth/settings for create, public read for pay.

### Modules
- `usePaymentRequests`
- `PaymentRequestsPage` (ledger collect tab)
- Public `PaymentRequestPage` + `/pay/:slug` redirect
- QR render + style picker + share card
- Universal links / app links to payment URLs (`EXPO_PUBLIC` app URL)

### Dependencies
- Phase 0 (UPI/QR utils), 3 (upiId settings), 5 (routing). Finance layer optional for collect list only.

### Files
| Source | Role |
|--------|------|
| `src/hooks/usePaymentRequests.ts` | CRUD by slug |
| `src/pages/PaymentRequestsPage.tsx`, `PaymentRequestPage.tsx`, `CollectPaymentPage.tsx` | UI |
| `src/types/paymentRequest.ts` | Types |
| `src/components/UpiPaymentQr.tsx`, `QrStylePicker.tsx`, `PaymentRequestShareCard.tsx`, `RequestUpiPayment.tsx` | QR/share |
| `src/utils/paymentRequestUrl.ts`, `qrStyles.ts` | URLs/styles |

### Estimated Complexity
**Medium**

### Acceptance Criteria
- [ ] Authenticated user can create/cancel/delete payment requests keyed by slug.
- [ ] Public route resolves active requests without requiring login.
- [ ] QR encodes correct UPI payload; style preference persists.
- [ ] Share uses native share sheet; link opens app or web fallback as designed.
- [ ] Cancelled requests cannot accept payment UX.

---

## Phase 15 — Insights (Analytics, Yearly, Discovery)

### Modules
- `InsightsHub` tabs: analytics, yearly, search
- `AnalyticsPage`, `YearlyAnalytics`, `AnalysisLab`
- Chart components (replace Chart.js/Recharts with RN charts)
- Analytics cards under `components/analytics/*`
- Export CSV/PDF gated by `allowDataExport` (can be 15b)

### Dependencies
- Phase 0 (utils), 6–8 (data), 5 (hub chrome); Dashboard optional

### Files
| Source | Role |
|--------|------|
| `src/pages/InsightsHub.tsx`, `AnalyticsPage.tsx`, `YearlyAnalytics.tsx`, `AnalysisLab.tsx` | Screens |
| `src/components/charts/*` | Charts |
| `src/components/analytics/*` | Insight cards |
| `src/utils/csvExport.ts`, `exportCsv.ts` | Export |
| Settings export year + system `allowDataExport` | Gates |

### Estimated Complexity
**High**

### Acceptance Criteria
- [ ] Insight tabs deep-link via query/segment parity with web `?tab=`.
- [ ] Aggregations match web util outputs for identical expense fixtures.
- [ ] At least category pie + monthly bar + trend render on device.
- [ ] Analysis Lab search/filter returns expected subsets.
- [ ] Export (if included) respects `allowDataExport` and shares a file via OS sheet.

---

## Phase 16 — AI Advisor, Magic Chat & Receipt OCR

### Modules
- `aiService` via **server proxy** (preferred; avoid shipping Gemini key in binary)
- `MagicChatEntry`, `FloatingAdvisor` behind `enableAIFeatures`
- `ocrService` via proxy; `ReceiptScanner` camera pipeline
- `magicParser` + categorization rules integration
- Chat history storage (AsyncStorage)

### Dependencies
- Phase 8 (form prefills), 15 recommended for advisor context; feature flags from Phase 2–3

### Files
| Source | Role |
|--------|------|
| `src/services/aiService.ts`, `ocrService.ts` | Clients |
| `src/components/MagicChatEntry.tsx`, `FloatingAdvisor.tsx` | UI |
| `src/components/ReceiptScanner.tsx` | Camera/OCR |
| `src/utils/magicParser.ts` | Parsing |
| `src/hooks/useCategorizationRules.ts` | Assist |

### Estimated Complexity
**High**

### Acceptance Criteria
- [ ] AI surfaces hidden when `enableAIFeatures` is false.
- [ ] No raw Gemini/OCR secrets required in the mobile app binary (proxy or secure injection documented).
- [ ] Advisor can answer using finance context; failures show offline/fallback message.
- [ ] Magic parse can prefill ExpenseForm fields.
- [ ] Receipt capture → OCR → form prefill works on device camera roll/camera.
- [ ] Chat history persists per install without leaking across duress/real incorrectly.

---

## Phase 17 — Shared Vaults

### Modules
- `useVaults`, `useVaultExpenses`, `useUserProfilesByIds`
- `VaultsPage`, `VaultDetailPage`
- ExpenseForm vault write path (`vaults/{id}/expenses`)
- Member listing / budget display

### Dependencies
- Phase 6–8 (and form vault branch)

### Files
| Source | Role |
|--------|------|
| `src/hooks/useVaults.tsx`, `useVaultExpenses.ts`, `useUserProfilesByIds.ts` | Data |
| `src/pages/VaultsPage.tsx`, `VaultDetailPage.tsx` | UI |
| `src/types/vault.ts`, `vaultExpense.ts` | Types |
| `src/components/ExpenseForm.tsx` (vault branch) | Writes |

### Estimated Complexity
**Medium–High**

### Acceptance Criteria
- [ ] Owner can create vaults; members resolved by profile lookup.
- [ ] Vault expenses write to vault subcollection and appear for members per security rules.
- [ ] Personal journal behavior remains correct when `vaultId` unset.
- [ ] Nav Vaults tab and `/vaults/:vaultId` detail work.

---

## Phase 18 — Classic Investments (FD / Interest / MF)

### Modules
- `useInvestments`
- `InvestmentsPage`, `InvestmentDetailPage`
- `CreateInvestmentModal`, `EditInvestmentModal`
- Interest valuation UI using Phase 0 math
- Feature flag gating (`enableInvestments`)

### Dependencies
- Phase 6–9 (optional funding expense), settings/system flags

### Files
| Source | Role |
|--------|------|
| `src/hooks/useInvestments.ts` | CRUD |
| `src/pages/InvestmentsPage.tsx`, `InvestmentDetailPage.tsx` | UI |
| `src/components/CreateInvestmentModal.tsx`, `EditInvestmentModal.tsx` | Forms |
| `src/types/investment.ts` | Types |
| `src/utils/investmentInterest.ts` | Valuation |

### Estimated Complexity
**Medium**

### Acceptance Criteria
- [ ] Classic investments CRUD under `users/{uid}/investments`.
- [ ] Detail route gated when investments disabled (redirect to dashboard).
- [ ] Ledger investments `sub=fixed` shows classic list; stocks hub still empty/hidden until Phase 20.
- [ ] Accrued interest / maturity figures match unit tests.

---

## Phase 19 — Focus, Gamification & Polish Widgets

### Modules
- `useFocusMode`, `FocusWidget`, `FocusConfigModal`
- `GamificationProvider`, `GamificationCard`, celebrations
- `CelebrationProvider` / `CelebrationOverlay`
- `useStoryGenerator` / `StoryViewer` (optional)
- Dashboard completion for deferred widgets
- `NetWorthCard` privacy toggle

### Dependencies
- Phase 6–10

### Files
| Source | Role |
|--------|------|
| `src/hooks/useFocusMode.ts`, `useGamification.tsx`, `useCelebration.tsx`, `useStoryGenerator.ts` | Logic |
| `src/components/focus/*`, `GamificationCard.tsx`, `CelebrationOverlay.tsx`, `story/StoryViewer.tsx` | UI |
| `src/types/focus.ts`, `stats.ts` | Types |

### Estimated Complexity
**Medium**

### Acceptance Criteria
- [ ] Focus session persists to `focus/active` and respects config modal.
- [ ] Gamification stats sync to `stats/summary` without corrupting expense data.
- [ ] Celebrations trigger on defined events without blocking navigation.
- [ ] Dashboard widgets for focus/gamification honor toggles.

---

## Phase 20 — Portfolio (Virtual Brokerage)

### Modules
- Portfolio feature package (`features/portfolio`)
- React Query client + `useMarketQuotes` / search / holdings metrics
- Market HTTP clients → deployed Netlify `/api/*`
- Holdings, watchlist, alerts, orders, transactions, snapshots, settings
- Portfolio dashboard UI, charts, CSV import, onboarding, mock buy/sell
- `InvestmentsHubPage` stocks sub-tab
- `DeferredStartupEffects` portfolio warm-up

### Dependencies
- Phase 1 (RQ), 5–10, 18 flags; **live Netlify market endpoints reachable from device**

### Files
| Source | Role |
|--------|------|
| `src/features/portfolio/**` | Entire module |
| `src/services/stockService.ts`, `stockApi.ts`, `mutualFundService.ts`, `cryptoService.ts` | HTTP |
| `src/features/portfolio/services/marketDataService.ts` | Router |
| `netlify/functions/{stock,historical,mutualFunds,crypto,twelve-data}.*` | Backend (reuse; do not rewrite unless required) |
| `src/hooks/useStock.ts`, `useMutualFund.ts`, `useCrypto.ts` | Thin wrappers |
| `src/components/{StockCard,MutualFundCard,CryptoCard}.tsx` | Cards |
| `src/types/market.ts` | Quote types |

### Estimated Complexity
**Very High**

### Acceptance Criteria
- [ ] Quotes load via HTTPS Netlify functions (not direct Yahoo from device if blocked).
- [ ] Holdings CRUD + live P/L metrics work offline for Firestore side; prices degrade gracefully.
- [ ] Mock buy/sell/cash/orders/watchlist/alerts/snapshots match web collection shapes.
- [ ] CSV import validates via Zod schemas.
- [ ] Portfolio charts render with chosen RN chart library.
- [ ] Feature remains fully hidden when investments flags are off.

---

## Phase 21 — SIP Plans & Virtual SIP

### Modules
- SIP repository + hooks (plans, transactions, virtual portfolio, notifications)
- SIP calculations/schedule (pure from Phase 0-style port)
- SIP UI: dashboard, plan modal, analytics, catch-up, notification bell
- Client visibility of cron-executed results; optional manual execute endpoint
- Integration with market quotes from Phase 20

### Dependencies
- Phase 20 (quotes); Netlify `sip-execute` cron + Admin SDK already deployed on web infra

### Files
| Source | Role |
|--------|------|
| `src/features/sip/**` | Entire module |
| `netlify/functions/sip-execute.ts` | Server execution |
| Header `NotificationBell` integration | UX |

### Estimated Complexity
**Very High**

### Acceptance Criteria
- [ ] SIP plans CRUD under `sipPlans` with Zod validation.
- [ ] After cron (or authorized execute), transactions and virtual positions update and display.
- [ ] Catch-up flow does not double-post vs schedule rules.
- [ ] Notifications mark read and badge clears.
- [ ] Mobile never embeds `FIREBASE_SERVICE_ACCOUNT_JSON` or `CRON_SECRET`.

---

## Phase 22 — Nutrition Twin App

### Modules
- App selector real choice (expense vs nutrition)
- `NutritionApp` shell + bottom nav
- Profile + goals, daily log + meals, water/workout widgets, body/weight, analytics
- Meal planner
- Barcode scanner + `openFoodFactsService` (last sub-step)

### Dependencies
- Phase 0–4 (auth/privacy), Phase 5 patterns; independent of ledger but shares Firebase user

### Files
| Source | Role |
|--------|------|
| `src/pages/nutrition/**` | Screens |
| `src/hooks/useDailyLog.ts`, `useNutritionProfile.ts`, `useNutritionHistory.ts`, `useWeightHistory.ts` | Data |
| `src/components/nutrition/**` | Widgets/scanner |
| `src/types/nutrition.ts` | Types |
| `src/services/openFoodFactsService.ts` | Barcode API |
| `src/utils/nutritionExport.ts` | Export |

### Estimated Complexity
**High** (barcode/camera **High** subset)

### Acceptance Criteria
- [ ] Selecting Nutrition persists `selectedApp` and launches nutrition routes only.
- [ ] Profile required before dashboard; goals compute and store correctly.
- [ ] Meals under `daily_logs/{date}/meals` update day totals.
- [ ] Weight history and nutrition analytics screens function offline-tolerant.
- [ ] Barcode path (if included) looks up OFF and adds food items.
- [ ] Switching back to expense restores expense shell without data loss.

---

## Phase 23 — Admin Console (Optional / Defer)

Prefer keeping admin on web. Include only if mobile ops is a hard requirement.

### Modules
- `AdminRouteGuard`
- Admin layout + dashboard/users/user detail/settings
- `useUsers`, `admin/utils/dataFetching`
- System settings writes (`AdminSettings`)

### Dependencies
- Phase 2–3 (auth + role); system settings read already exists

### Files
| Source | Role |
|--------|------|
| `src/guards/AdminRouteGuard.tsx` | Gate |
| `src/admin/**` | Entire admin area |
| `src/hooks/useUsers.ts` | User list |

### Estimated Complexity
**High**

### Acceptance Criteria
- [ ] Non-admins cannot open admin routes.
- [ ] SUPER_ADMIN can toggle `system_settings/global` flags.
- [ ] User list/detail reads obey existing security rules (fail closed on permission errors).
- [ ] Documented decision: ship or explicitly out-of-scope for v1.

---

## Phase 24 — Native Google Sign-In & Store Build Prep

**Do not skip before Play Store / production APK.** Expo Go Google login (Phase 2 web bridge) is for development only.

`@react-native-google-signin/google-signin` **cannot run in Expo Go** — it needs a custom native build (EAS / `expo run:android`), plus Android package + SHA-1. The Phase 2 bridge remains valid for Expo Go; native is required for production UX and store builds. Same Google account still lands on the same Firebase UID as the web app.

### Modules
- `@react-native-google-signin/google-signin` + Expo config plugin
- Android `package` / applicationId + iOS `bundleIdentifier` (if shipping iOS)
- Google Cloud / Firebase **Android OAuth client** with correct **SHA-1** (debug + release / EAS)
- `google-services.json` (and iOS plist if needed) wired in `app.json`
- Prefer native Google path in non–Expo-Go builds; keep web bridge as Expo Go fallback (or remove once store-only)
- EAS development + production profiles; AAB/APK smoke of Google login

### Dependencies
- Phase 2 (AuthProvider + `loginWithGoogleIdToken` already wired)
- Firebase project already used by web (Google provider enabled)

### Files / console work
| Item | Role |
|------|------|
| `app.json` / `app.config` | `android.package`, plugin, `googleServicesFile` |
| Google Cloud Console | Android OAuth client + SHA-1 fingerprints |
| Firebase Console | Download `google-services.json`; enable Google sign-in |
| `docs/GOOGLE_AUTH_BRIDGE.md` | Bridge vs native decision notes |

### Estimated Complexity
**High** (native module + OAuth console + EAS)

### Acceptance Criteria
- [ ] App builds outside Expo Go (EAS or `expo run:android`).
- [ ] Native Google Sign-In returns a Google ID token and Firebase signs in to the **same UID** as web Google users.
- [ ] Debug and release/EAS SHA-1 clients both work (no `DEVELOPER_ERROR` / invalid audience).
- [ ] Documented fallback: Expo Go continues via web bridge until store-only builds.
- [ ] Play Store / production checklist includes this phase as a hard gate.

---

## Cross-Cutting Workstreams (Apply Continuously)

These are not independent phases but must be tracked alongside Phases 1–24.

| Workstream | Applies from | Notes |
|------------|--------------|-------|
| Security rules validation | Phase 2+ | Mobile uses same Firestore rules; test with real/duress uids |
| Feature flag parity | Phase 2+ | system + user flags drive nav and modules |
| Env / secret hygiene | Phase 1, 16, 20–21 | No admin/cron/Twelve Data secrets in the app |
| Accessibility & safe areas | Phase 5+ | Existing web safe-area intent |
| E2E smoke tests | Phase 8+ | Auth → add expense → list; expand per phase |
| Performance | Phase 6+ | Staged listeners; avoid exploding snapshot fan-out |
| Deep linking | Phase 14, 12–13 | Payment, split, trip routes |
| Native Google / store build | Phase 24 (gate) | Not Expo Go; EAS + package + SHA-1; see Phase 24 |

---

## Dependency Graph (Simplified)

```
0 Types/Utils
 └─ 1 Foundation (Expo, Firebase, tokens)
      └─ 2 Auth + SystemSettings (Expo Go Google = web bridge)
           └─ 3 UserDoc / Settings / Theme
                └─ 4 PrivacyLock (+ duress)
                     └─ 5 Expense shell
                          ├─ 6 FinanceData
                          │    ├─ 7 Categories/Budgets/Rules/Goals
                          │    │    └─ 8 Transactions
                          │    │         ├─ 9 Accounts/Cards
                          │    │         │    ├─ 10 Dashboard MVP
                          │    │         │    │    ├─ 15 Insights
                          │    │         │    │    │    └─ 16 AI / OCR
                          │    │         │    │    └─ 19 Focus / Gamification
                          │    │         │    ├─ 11 Subscriptions
                          │    │         │    └─ 18 Classic investments
                          │    │         │         └─ 20 Portfolio
                          │    │         │              └─ 21 SIP
                          │    │         ├─ 12 Splits
                          │    │         ├─ 13 Trips
                          │    │         └─ 17 Vaults
                          ├─ 14 Payment collect / public pay
                          └─ 22 Nutrition (parallel after 4–5)
                     └─ 23 Admin (optional)
      └─ 24 Native Google Sign-In + EAS/store build (Play Store gate; after Phase 2)
```

---

## Suggested Release Cuts

| Release | Includes through | Goal |
|---------|------------------|------|
| **Internal alpha** | Phase 8 | Sign in (bridge Google / email), add/list expenses |
| **Beta** | Phase 14 | Accounts, subscriptions, splits, trips, collect pay |
| **v1.0 consumer** | Phase 15 (+ 16 optional) **+ Phase 24** | Insights; **native Google + store build required before Play Store** |
| **v1.1** | Phases 17–19 | Vaults, classic investments, focus/XP |
| **v1.2 investing pack** | Phases 20–21 | Portfolio + SIP |
| **v1.3 wellness** | Phase 22 | Nutrition |
| **Ops (optional)** | Phase 23 | Admin on mobile or remain web-only |

---

## Out of Scope / Explicit Non-Goals for Early Phases

- Porting Zustand (does not exist on web; do not invent as a blocker)
- Firebase Storage (unused on web client)
- Pixel-perfect port of all 11 themes before light/dark work
- Reimplementing Netlify market/SIP backends inside the mobile app
- Admin as a blocker for consumer MVP

---

*This plan is derived solely from `MOBILE_ANALYSIS.md` and the scanned web architecture. It specifies phases, modules, dependencies, source files, complexity, and acceptance criteria only — no implementation code.*

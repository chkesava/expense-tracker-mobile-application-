# Multi-App Separation & CI/CD Analysis

Status: **Analysis only — no repository changes made.** Prepared per the task instructions in AGENTS.md/CLAUDE.md ("ANALYZE FIRST", no modifications). Date: 2026-08-27.

---

## 1. Executive Summary

The repo ("Spendly") ships one Android app (`com.example.expensetracker`, currently v4.3.0 / versionCode 74) that bundles three products — Expense Tracker, Nutrition Tracker, and Ganesh Seva (festival/pandal management) — behind a single runtime "workspace switcher." There is one Firebase project, one Supabase project, one Android application ID, one keystore, one GitHub Actions release workflow, one GitHub Release stream, and one Firebase App Distribution app.

Of the three products, **Ganesh is already the most cleanly separated** at the data layer (its own `pandals/**` Firestore tree, own security-rule block, own Supabase storage usage, own native camera/image-picker permission strings) but is *not* separated at the JS/native-dependency layer (shared root `Stack`, shared auth, shared `shared/` folder placement without barrel export). Expense and Nutrition are **not separated at all** at the data layer (same `users/{uid}` Firestore tree, same permissive security rule) but their JS code (components/hooks/routes) is cleanly separated by naming convention.

The CI/CD pipeline has **zero product-awareness today** — one workflow, one Gradle build, one keystore, one `applicationId`, one Firestore "latest release" document, one Firebase Distribution app ID. The in-app update system is similarly single-product: it compares numeric `versionCode` against one global Firestore doc (`system_settings/latest_release`) and has no field or check that ties a release to a specific package/product.

**Recommended direction:** keep one repository; introduce a build-time "product" dimension (env var + Android product flavors or three `app.json`/`eas.json` variants) that selects application ID, icon, entry route, permissions/plugins, and native modules; split the GitHub Actions workflow into a reusable workflow parameterized by product, each producing its own tagged GitHub Release and its own Firebase Android app target; extend the release-metadata schema with a `product` field and give each app's update checker a product-scoped Firestore document path. This is a **Medium-High complexity** effort — the CI/CD and update-metadata changes are mechanical and low-risk; the data-model/auth boundary between Expense and Nutrition is the part requiring real design decisions.

---

## 2. Current Repository Architecture

Single Expo Router app. One root `Stack` (`app/_layout.tsx:263-293`) registers all product route-groups as siblings: `(auth)`, `(app)` [Expense], `(nutrition)`, `(ganesh)`, `(ganesh-auth)`, plus standalone screens (`ganesh-phone-auth.tsx`, `google-auth.tsx`, `payment/[slug]`, `split/[slug]`). All providers (Auth, Network, Workspace, Settings, etc.) wrap the *entire* tree — there is no per-product provider isolation (`app/_layout.tsx:227-256`).

Product selection at runtime is a client-side state machine, not a build-time decision:
- `providers/WorkspaceProvider.tsx` — persists `activeWorkspace: "expense"|"nutrition"|"ganesh"` in AsyncStorage (`@active_workspace`), drives `router.replace(resolveWorkspaceRoute(...))`.
- `app/index.tsx:48-56` — post-auth branch by `activeWorkspace`.
- `app/welcome.tsx` — pre-auth chooser between Expense and Ganesh only (Nutrition is reached from *inside* the Expense app via an app-selector screen, not from the welcome screen).

One Firebase project, one Supabase project, one Android `applicationId` (`com.example.expensetracker`, app.json:15), one keystore alias (`expense-tracker-upload`), one GitHub Actions release workflow, one version stream (single `versionCode`/`versionName` incremented across all three products' changes indiscriminately).

## 3. Expense Product Boundary

- Routes: `app/(app)/**` (accounts, credit-card-bills, dashboard, insights, investments, ledger, vaults, sms-inbox, settings, app-selector).
- Components: `components/accounts`, `borrowings`, `creditCardBills`, `receivables`, `sip`, `splits`, `investments`, `vaults`, `subscriptions`, `trips`, `spaces`, `collect`, `focus`, `sms`, `portfolio`, `dashboard`, `categories`.
- Hooks: ~50 files — `useAccounts`, `useExpenses`, `useBorrowings`, `useReceivables`, `useInvestments`, `useSips`, `useSplits`, `useVaults`, `useCreditCardBills`, `useSubscriptions`, `useTrips`, `useSpaces`, `useSms*`.
- Providers: `BorrowingsReceivablesProvider`, `CreditCardBillsProvider`, `FinanceDataProvider`, `LedgerStateProvider`, `SetupProgressProvider`, `SmsReceiverProvider`.
- Native: SMS auto-detection (`modules/sms-reader`, `android.permission.READ_SMS`/`RECEIVE_SMS`) is Expense-exclusive — confirmed by grep across `services/sms/*`.
- In-app update UI (`UpdateAvailableSheet`) is mounted in `app/(app)/_layout.tsx` — confirmed present for Expense; **not confirmed** mounted in Nutrition/Ganesh layouts (requires verification during implementation).

## 4. Nutrition Product Boundary

- Routes: `app/(nutrition)/` — `analytics.tsx`, `body.tsx`, `index.tsx`, `log.tsx`, `meal.tsx`, `profile.tsx`, `scanner.tsx`, `_layout.tsx`.
- Components: `components/nutrition/` (MacroProgressBar, MealPlannerCard, NutritionTabBar, NutritionValue, SimpleBarChart, WaterCard, WorkoutCard, ChipSelect) — has its own chart component rather than reusing `components/charts/`, i.e. weak sharing today.
- Hooks: `useNutrition`, `useNutritionHistory`, `useNutritionProfile`, `useWeightHistory`.
- Data: `users/{uid}/profile/nutrition`, `users/{uid}/goals/nutrition` (Firestore) — same top-level `users/{uid}` tree as Expense.
- Distinguishing env dependency: `EXPO_PUBLIC_GEMINI_API_KEY`, explicitly documented in `.env.example:40` as "used to estimate nutrients from natural-language food logs" — the one clearly Nutrition-specific credential in the whole env file.
- No dedicated Nutrition data provider was found; it appears to read Firestore directly from its hooks rather than through a context provider (UNKNOWN depth — not fully traced).
- Camera/scanner (`scanner.tsx`) dependency on `expo-camera`/`expo-image-picker` is plausible but **not confirmed** independently of Ganesh's already-confirmed use of the same libraries (requires verification).

## 5. Ganesh Product Boundary

- Routes: `app/(ganesh)/**` (large — assets, collections, contributions, expenses, member payments, opening/permanent funds, reimbursements, sponsors, admin, household, join-requests, reports, setup) and `app/(ganesh-auth)/`, `app/ganesh-phone-auth.tsx`.
- Components: `components/ganesh/` (13 files: AccountabilityLine, AdminGate, AdminLinkRow, AdminQueryState, ChoiceChips, DuplicateHouseholdDialog, FundLocationChips, GaneshImageUploader, GaneshQuickActions, GaneshScreen, GaneshSignedPreview, GaneshSyncChip, GaneshTabBar, GaneshWriteLock, GodFundHero, MetricGrid, PermanentFundCard, PermissionChecklist, RoleChips, plus a `ui/` subdir).
- Hooks: `useGanesh*` (Activity, Categories, Expenses, Permissions, Storage, Summary, SyncReporter, Writes), `useFestival*`, `usePandal*`, `useHouseholds`, `useJoinRequests`, `useMemberAudits`, `usePermanentFund*`, `useOpeningFunds`, `useSponsorships`, `hooks/ganesh/useGaneshCollection.ts`.
- Providers: `GaneshSessionProvider` (pandal/festival "actor" session, layered on top of shared Firebase auth).
- Data: fully separate top-level Firestore tree `pandals/{pandalId}/**` (see §10), with its own, larger security-rule block (`firestore.rules:554+`).
- Storage: Ganesh files route through Supabase (`EXPO_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY`, explicitly labeled "Ganesh Seva file storage" in `.env.example:36`) via the `ganesh-files` Supabase Edge Function (per recent commits `1d51b4e`, `2499e45`), plus Firebase Storage rules scoped to `/pandals/{pandalId}/festivals/{festivalId}/**`.
- Native/permission footprint: `expo-image-picker` plugin config text explicitly says "Allow Spendly to attach Ganesh receipt and contribution photos" (app.json:66-67) — the only plugin config in the whole file naming a specific product.
- Notable gap for the split: `shared/types/ganesh.ts` and 9 files under `shared/utils/ganesh*.ts` physically live inside the cross-product `shared/` folder but are **not** re-exported from `shared/index.ts` — Ganesh code imports them by direct path. This is actually good news for separability (no other product touches them) but means "shared/" as a folder name is misleading; a real split should either move these into a Ganesh-only package or explicitly document that `shared/` mixes cross-product and single-product code.

## 6. Shared Code

- `shared/index.ts` barrel: expense/focus/investment/market/nutrition/paymentRequest/split/stats/subscription/trip/user/vault/vaultExpense types; category taxonomy/institutions data; navigation config; ~25 util modules (dates, currency, account math, analytics, insights, credit-card math, splits, trips, UPI/magic-parser, chart colors); `memoryStorage`; `portfolio`/`sip` feature namespaces. Genuinely cross-product for Expense+Nutrition types, but Ganesh is present on disk and absent from the barrel (see §5).
- Cross-cutting providers used by all three: `AuthProvider`, `NetworkProvider`, `SystemSettingsProvider`, `UserDocProvider`, `LocalizationProvider`, `WorkspaceProvider`, `CelebrationProvider`.
- Product-agnostic components: `components/ui/` (Button, Card, Input, AddFab, DashboardSkeleton), `components/common/` (Amount, Dialog, EmptyState, ErrorState, LoadingState, Modal, Skeleton, SwipeableRow, AppErrorBoundary, OfflineBanner, SplashAnimationOverlay).
- Shared infra: `lib/errors.ts`, `theme/` (ThemeProvider, tokens, motion), `expo-router`, fonts, `firebase`/`@supabase/supabase-js` SDKs, `zustand`/`zod`/`react-hook-form`/`@tanstack/react-query`/`date-fns` (JS-only, not native-heavy, low removal value even if kept in all three builds).

## 7. Native Dependency Analysis

| Dependency | Used by | Confidence |
|---|---|---|
| `modules/sms-reader` (custom native module) | Expense only | Confirmed |
| `modules/apk-installer` (custom native module) | Cross-cutting update flow; confirmed wired only into `app/(app)/_layout.tsx` today | Likely Expense-only in current wiring — Requires verification if Ganesh/Nutrition layouts should also mount it |
| `expo-local-authentication` (biometrics) | Generic app-lock gate (`PrivacyLock`) | Likely shared |
| `expo-camera`, `expo-image-picker`, `expo-image-manipulator` | Ganesh (confirmed via plugin text + `GaneshImageUploader`); Nutrition `scanner.tsx` (plausible, unconfirmed) | Ganesh: Confirmed; Nutrition: Requires verification |
| `firebase` (Auth+Firestore+Storage SDK) | All three products | Confirmed shared, heaviest JS SDK |
| `@supabase/supabase-js` | Ganesh file storage only | Confirmed Ganesh-specific |
| `@react-native-google-signin/google-signin` | Shared auth (all products) | Confirmed shared |
| `react-native-qrcode-svg` | Payment requests / splits (Expense), possibly Ganesh sponsorship/payment flows | Likely Expense(+Ganesh) |
| `@gorhom/bottom-sheet`, `@shopify/flash-list`, `react-native-reanimated`/`worklets`, `react-native-gesture-handler`, `react-native-svg`, `react-native-screens` | Core RN/UI, shared across the whole app | Confirmed shared, unavoidable overhead per product unless deliberately dropped for a lighter product |
| `expo-notifications` | Shared (`app/_layout.tsx:94-101`) | Confirmed shared |
| `expo-document-picker`, `expo-file-system` | Likely CSV export utilities and the APK update downloader (`lib/apkUpdate.ts`) | Requires verification per product |
| `nativewind`/`tailwindcss` | Styling | Requires verification whether used uniformly |
| `zustand`, `zod`, `react-hook-form`, `@hookform/resolvers`, `date-fns`, `@tanstack/react-query` | Cross-cutting JS, low native footprint | Confirmed shared, low removal value |

**Android permissions** (`app.json:23-30`) classification:
- `USE_BIOMETRIC`, `USE_FINGERPRINT` — Likely shared (privacy lock could apply to any product).
- `READ_SMS`, `RECEIVE_SMS` — **Confirmed Expense-only.**
- `POST_NOTIFICATIONS` — Confirmed shared.
- `REQUEST_INSTALL_PACKAGES` — tied to `apk-installer`; Likely Expense-only in current wiring, Requires verification for the other two.

**Plugins** (`app.json:38-70`): `expo-router`, `expo-splash-screen`, `expo-secure-store`, `expo-local-authentication`, `expo-notifications`, `@react-native-google-signin/google-signin` are product-agnostic; `expo-image-picker`'s permission-copy is written specifically for Ganesh, even though the library could be reused by Nutrition's scanner.

## 8. 135 MB APK Size Analysis

No native-module-count or bundle-analyzer output was captured in this analysis pass (out of scope for a read-only static review, and the task rules prohibit running builds). What can be said with evidence:
- The APK currently bundles **all** JS/route code for all three products (no code-splitting by product at the Metro/bundler level — Expo Router's file-based routing includes every route group in one JS bundle) plus **all** native modules referenced anywhere in `package.json`/`app.json`, regardless of which product actually uses them at runtime (React Native/Expo does not tree-shake native Android libraries per unused-JS-import; a linked native module ships in the APK if it's in `package.json`, whether or not any screen imports it).
- Confirmed contributors to native/binary weight, all currently shipped unconditionally: `firebase` (full SDK), `@supabase/supabase-js`, `react-native-reanimated`+`react-native-worklets`, `react-native-svg`, `expo-camera`, `expo-image-manipulator`, two custom native modules (`sms-reader`, `apk-installer`), Google Sign-In native library.
- **No evidence-based size-reduction number can be given without an actual per-flavor build and APK analyzer run** (task rule §19 prohibits promising reductions without evidence). Directionally, removing `modules/sms-reader` and its permissions from Nutrition/Ganesh builds, and removing `@supabase/supabase-js` + Ganesh-specific camera config from Expense/Nutrition builds, are the clearest, lowest-risk wins — but the actual MB delta is UNKNOWN until measured.

## 9. Authentication Analysis

Single shared Firebase Auth identity/pool for all three products (`providers/AuthProvider.tsx`). Four sign-in mechanisms, all terminating in the same Firebase Auth call surface:
1. Email/password (`signInWithEmailAndPassword`/`createUserWithEmailAndPassword`) — general/all products.
2. Google OAuth ID token via a web bridge (`lib/googleAuthBridge.ts`, `app/google-auth.tsx`) — all products.
3. Phone/OTP (`lib/ganeshPhoneAuth.ts`, `app/ganesh-phone-auth.tsx`) — named/routed for Ganesh, but the resulting credential passes through the same generic `loginWithPhoneCredential`, so it is not enforced as Ganesh-only at the auth layer.
4. Biometric/PIN "duress" proxy user — a cross-product privacy feature, not a real sign-in method.

`GaneshSessionProvider` is a session/actor layer *on top of* the shared Firebase user (pandal/festival selection), not a separate identity system. One Firebase project and one Supabase project exist; Supabase is storage-only (`persistSession: false`) and, per `.env.example:36`, exists specifically for Ganesh file storage.

## 10. Database/Data Isolation

- **Ganesh: cleanly separated.** Entire data model lives under `pandals/{pandalId}/festivals/{festivalId}/{households|collections|contributions|expenses|reimbursements|categories|activity|auditLogs|fundTransfers|sponsorships}`, plus `pandals/{pandalId}/{permanentFund|roles|assets|sponsors}` (`shared/utils/ganeshPaths.ts`). Only touchpoint with shared data: `users/{uid}/pandalMemberships/{pandalId}` — a membership pointer, not domain data. Has its own large, dedicated security-rule block (`firestore.rules:554+`).
- **Expense and Nutrition: not separated.** Both live under the same `users/{uid}/**` recursive tree — Expense in `expenses`, `incomes`, `accounts`, `accountTypes`, `accountPayments`, `accountEntries`, `accountTransfers`, etc.; Nutrition in `profile/nutrition`, `goals/nutrition`. Governed by the same single permissive rule (`firestore.rules:39-45`: any authenticated owner can read/write **any** subcollection under their own uid — the rule cannot distinguish Expense data from Nutrition data).
- Storage: Ganesh receipt/contribution photos go through Firebase Storage rules scoped to `/pandals/{pandalId}/festivals/{festivalId}/**`, plus the Supabase `ganesh-files` Edge Function for some file paths (per recent commits). No Expense/Nutrition-specific Storage rule block exists — their file attachments (if any) are not clearly routed through Firebase Storage.

**Implication for the split:** Ganesh's app can be extracted with a real, defensible security boundary (separate app + separate rule tree already exists). Expense and Nutrition apps would ship separately but continue to share one Firestore rule tree and one `users/{uid}` document — that's an acceptable "shared backend" per the target architecture, but it means a Nutrition app build technically retains read/write ability to Expense data (and vice versa) unless the security rules are tightened to check a custom claim/product allowlist — worth flagging as a security consideration (§25), not a blocker to shipping separate APKs.

## 11. Navigation Analysis

Expo Router single root `Stack` registers every product's route group as a sibling (`app/_layout.tsx:263-293`). Product selection is a **runtime** decision (`WorkspaceProvider` + AsyncStorage + `router.replace`), not a build-time route inclusion decision. This means today's single APK always ships all three products' route trees; splitting into three APKs will require either (a) conditionally registering only the relevant route group(s) at build time via an env-driven `app/_layout.tsx`, or (b) three separate Expo Router `app/` trees/entry points selected via a build-time alias. Given Expo Router resolves routes from the filesystem, option (a) — gating registration inside `_layout.tsx` behind a compile-time `process.env.EXPO_PUBLIC_PRODUCT` (or similar) check — is more consistent with "one repository, minimal duplication" than maintaining three physical `app/` directories.

## 12. Expo/EAS Analysis

- Expo SDK 57 (`expo: ~57.0.10`), New Architecture implied by `react-native-worklets`/`reanimated` 4.x — confirm against SDK 57 docs before any implementation (per AGENTS.md instruction to read the versioned docs).
- `eas.json` exists (profiles `development`/`preview`/`production`, plus `submit.production`) but **is not referenced by any script or the GitHub Actions workflow** — it appears to be a dormant/manual-use config; the actual CI build path is local Gradle after `expo prebuild`, not EAS Build. This matters for the split plan: introducing product-specific EAS profiles would be net-new wiring, not an extension of an existing automated path.
- Single EAS `projectId` (`app.json:76-78`) tied to the single Expo/EAS project — would need either three projects or three profiles-with-overrides if EAS Build/Update were adopted, though today's pipeline doesn't use it at all.

## 13. Architecture Options

**A. Fully separate repos per product** — rejected per task goal ("one repository") and because it would fragment the already-shared auth/backend/design-system code across three repos, multiplying maintenance.

**B. Monorepo with three Expo "app" packages + a shared package (classic Expo monorepo/Yarn/Turborepo workspaces)** — cleanest long-term separation (each app has its own `app.json`, `package.json`, native deps, entry point), but is the highest-effort migration: requires moving `app/(app)/**` etc. into three separate Expo projects, restructuring `shared/` into a real workspace package, and reworking the single `node_modules`/Metro config into a monorepo topology. Best long-term scalability for adding a 4th product later.

**C. Single Expo app, build-time product flavor selection (env-driven route/config gating + Android product flavors or per-product `app.json`/`eas.json` overrides), no monorepo restructuring** — lowest migration effort from today's structure; keeps one `package.json`/`node_modules`, uses `EXPO_PUBLIC_PRODUCT` (or a build script templating `app.json`) plus conditional imports/route registration to exclude the other two products' route trees and permissions per build. Native-dependency exclusion (e.g., dropping `sms-reader` from Nutrition/Ganesh builds) is harder to do perfectly under this option because Expo autolinks whatever is in `package.json`/`modules/` regardless of which routes are compiled in — true native-size savings would need either Android product flavors (Gradle-level source-set exclusion) or physically moving unused native modules out of the built config for that product's CI job.

**D. Hybrid — Option C now, Option B later** — do the build-time flavor/env split first (fast, reversible, matches "don't assume repo structure" instruction), and only migrate to a full workspace monorepo (B) if/when a 4th product or true native-size reduction becomes a hard requirement.

## 14. Recommended Architecture

**Recommend Option D (start with C, keep B as the future path).** Rationale: the task explicitly asks to preserve the existing production app and its users, and to avoid over-engineering ahead of proven need. Given (a) Ganesh's data layer is already isolated, (b) Expense/Nutrition JS code is already cleanly separated by directory naming, and (c) the CI pipeline is already script-driven (not EAS-coupled) and easy to parameterize, a build-time "which product" switch layered onto the existing single Expo project is the smallest change that satisfies "three independently installable Android applications." A full package-per-product monorepo (Option B) can be pursued later without redoing this work, once the flavor boundaries are proven correct in production.

Concretely this means:
- Introduce a single build-time config concept, e.g. `PRODUCT` = `expense | nutrition | ganesh`, consumed by a small config-generation step (a script, not a hand-maintained `app.json`) that emits the correct `applicationId`, app name, icon, permissions, and plugin list for that product before `expo prebuild`.
- Gate route-group registration in `app/_layout.tsx` (and the pre-auth `welcome.tsx` chooser) behind that same `PRODUCT` value at build time, so only one product's routes/providers compile into a given build. (Today the root `Stack` always lists all five groups — this is the main code change needed, and it is a "files expected to change" item, not something to do in this analysis phase.)
- Keep Firebase project, Supabase project, and the shared `AuthProvider`/`FinanceDataProvider`-style code exactly as-is (shared backend, shared auth — matches the target diagram).
- Treat Ganesh's `sms-reader`-equivalent exclusion (i.e., excluding `READ_SMS`/`RECEIVE_SMS` and the `sms-reader` module from Nutrition/Ganesh builds) as the first concrete native-dependency win, since it's Confirmed Expense-only with no ambiguity.

## 15. Proposed Repository Structure

No physical directory moves are proposed for the initial phase (Option C), to minimize risk and match "preserve existing production app" and "do not create new app directories" constraints from this analysis phase. The one *new* concept introduced (in a future implementation phase, not now) would be a small `products/` config directory, e.g.:

```text
products/
  expense/
    app.config.overrides.json   # applicationId, name, icon, permissions, plugins
    firebase-app-id.txt-or-env  # which Firebase Android app this build reports to
  nutrition/
    app.config.overrides.json
  ganesh/
    app.config.overrides.json
```
consumed by a new `scripts/resolve-product-config.js` (or an `app.config.js` replacing the static `app.json`) at prebuild time. This keeps the existing `app/`, `components/`, `hooks/`, `providers/`, `shared/` layout completely intact — only route *registration* becomes conditional, not file location. A later Option-B migration could relocate product-specific directories into per-product packages, but that is out of scope for this phase.

## 16. Product Build Configuration

Per product, the build needs to vary: Android `applicationId`/app name/icon, `android.permissions` list, `expo.plugins` list (e.g., omit the Ganesh-flavored `expo-image-picker` copy for Expense/Nutrition, omit SMS permissions for Nutrition/Ganesh), which native `modules/*` are autolinked, the entry route (`app/welcome.tsx`'s chooser vs. a direct single-product landing), the Firebase Android app ID reported to for release metadata/App Distribution, and the versionCode stream (see §23). Because `app.json` is static JSON today, moving to `app.config.js` (a dynamic Expo config file, standard Expo mechanism, not a departure from "don't assume structure") is the natural way to make these fields computed from an env var/CLI flag rather than hand-edited per release — this is a recommendation for the implementation phase, not a change made now.

## 17. Current GitHub Actions Analysis

**`.github/workflows/android-release.yml`** — `workflow_dispatch` only (inputs: `version`, `mandatory`, `notes`); explicitly never triggered by `pull_request` (commented rationale: fork PRs would gain access to the signing keystore/Firebase service account). Single job, ~24 sequential steps: checkout → Node/JDK/Android SDK setup → `npm ci` → tests/typecheck → restore `.env` from secrets → restore keystore (`ANDROID_KEYSTORE_BASE64` → `keystores/expense-tracker-upload-key.keystore`) → restore Firebase service-account JSON → resolve version (patch-bump or explicit input; versionCode = `VERSION_CODE_OFFSET + GITHUB_RUN_NUMBER`, monotonic-guarded) → resolve release notes (input or latest commit subject) → `expo prebuild --platform android --no-install` → `release:verify` → `node scripts/release.js --skip-prebuild ...` (local Gradle `assembleRelease`) → upload build artifact → `gh release create/upload` (tag `android-v{name}-{code}`, asset `Spendly-{name}-{code}.apk`) → Firebase App Distribution upload (`wzieba/Firebase-Distribution-Github-Action@v1`, `appId: vars.FIREBASE_ANDROID_APP_ID`, tester group hardcoded `testers`) → resolve tester/download URL → publish release metadata to Firestore (`system_settings/latest_release`) → commit version bump back to the branch → clean up credentials → job summary.

**`.github/workflows/pr-checks.yml`** — triggers on `pull_request` and `push` to `main`/`docs/**`/`feature/**`/`fix/**`/`test/**`; runs `npm ci`, `npm test`, `typecheck:shared`, `typecheck` only; no secrets, no build/signing.

**Zero product-conditional logic exists anywhere in the workflow or `scripts/*.js`** — no matrix, no per-product application ID, no flavors. The one keystore, one Firebase app, one GitHub Release stream, and one Firestore metadata doc all currently cover the combined app.

## 18. Recommended GitHub Actions Architecture

```text
GitHub
   ↓
GitHub Actions (workflow_dispatch with a required "product" input: expense | nutrition | ganesh)
   ↓
Reusable workflow (workflow_call), parameterized by product
   ↓
   ├── Resolve product config (applicationId, Firebase app id, permissions/plugins)
   ├── npm ci / test / typecheck (shared quality gate, product-agnostic)
   ├── Restore product-scoped secrets (keystore may stay shared; Firebase app id and service account may be shared-project/per-app)
   ├── expo prebuild (Android) using the resolved product config
   ├── Build signed release APK (Gradle)
   ├── GitHub Release: tag "{product}-v{version}-{code}", asset "{Product}-{version}-{code}.apk"
   ├── Firebase App Distribution: appId = per-product Firebase Android app id, tester group = "{product}-testers" (or shared "testers" if that's acceptable)
   └── Publish release metadata to Firestore doc "system_settings/latest_release_{product}" (or "releases/{product}") including a "product" field
   ↓
Each installed app's update checker reads only its own product's metadata document
```

Recommend **Approach C (one reusable workflow, `workflow_call`, invoked by three thin product workflows)** over Approach A (single workflow + input) or B (three fully separate workflow files), because:
- It eliminates the duplication risk of Approach B (three copies of ~24 steps to keep in sync) while still giving each product its own workflow **file and run history** in the Actions UI (easier debugging/triage than Approach A's single shared history filtered by an input).
- It composes cleanly with GitHub's per-workflow required-reviewers/environment protection, so e.g. Ganesh's Firebase service account can be scoped to an "environment" distinct from Expense's if that's ever desired, without touching the other two workflows.
- It keeps the actual step logic (build, sign, release, distribute, publish-metadata) in one reusable file, so a change to (e.g.) the Firebase Distribution step only needs to be made once.

Concretely: `.github/workflows/release.yml` (reusable, `on: workflow_call`, inputs: `product`, `version`, `mandatory`, `notes`) containing today's ~24 steps but reading `applicationId`/Firebase app id/permissions from a per-product config keyed by the `product` input; plus three thin callers `.github/workflows/release-expense.yml`, `release-nutrition.yml`, `release-ganesh.yml`, each just `workflow_dispatch` with the same three optional inputs, calling the reusable workflow with a hardcoded `product` value. This is Approach C from the task's own framing.

## 19. GitHub Release Strategy

**Recommend Option A — separate tags per product** (`expense-v2.4.0-{code}`, `nutrition-v1.7.0-{code}`, `ganesh-v1.0.3-{code}`), each with its own APK asset, replacing today's single `android-v{name}-{code}` tag scheme. This directly supports the stated requirement that the three products evolve at different speeds with independent version numbers — a shared-tag scheme (Option B) would force a single version number across products or require awkward asset-naming disambiguation within one release, which doesn't match "Expense 2.4.0 / Nutrition 1.7.0 / Ganesh 1.0.3" evolving independently. This requires no change to the `gh release create/upload` mechanism itself (already generic), only to the tag/asset name templates and making the version-resolution step (§23) product-scoped rather than reading a single global `app.json.version`.

## 20. Firebase App Distribution Strategy

**Recommend keeping one Firebase project, adding three Firebase Android "apps" within it** (three distinct `google-services.json` client entries / three distinct `mobilesdk_app_id`s / `FIREBASE_ANDROID_APP_ID` values), rather than three separate Firebase projects — per the task's default preference to reuse the existing project absent a technical/security reason not to, and because Firestore/Storage/Auth already need to stay shared per the target architecture (three separate projects would fragment the shared backend that's explicitly wanted). Each product's Android app entry gets its own `applicationId`, its own App Distribution "app," and can have its own tester group (e.g. `expense-testers`/`nutrition-testers`/`ganesh-testers`) instead of today's single hardcoded `testers` group — this also lets different stakeholders be testers for only the product they care about. Requires: registering three new Android apps in the existing Firebase project console (one-time human action, not done in this analysis), each producing its own SHA-1 registration (`scripts/extract-sha1.js`/`print-sha1.js` already exist and are reusable) and its own entry in a (still single, multi-client) `google-services.json`, or three separate `google-services.json` files selected per product build via the same product-config mechanism as §16.

## 21. Current In-App Update Analysis

Update checking is a **live Firestore listener**, not polling and not a GitHub API/CDN check: `useAppUpdate()` (`hooks/useAppUpdate.ts`) subscribes via `onSnapshot` to a single global document at path `["system_settings", "latest_release"]` (`lib/appRelease.ts:27`), re-firing whenever CI's publish step writes to it. Gated to `Platform.OS === "android"` only. A supplementary one-shot `getDoc` re-check happens immediately before install.

Metadata schema (`AppRelease` type, `lib/appRelease.ts:10-25`): `versionName`, `versionCode`, `downloadUrl` or `storagePath`, `testerUrl`, `notes`, `mandatory` (strict boolean `true`), `apkFileName`, `publishedAt`, `contentLength`, `sha256`. Written by `scripts/publish-release-metadata.js` with the identical field set, `.set(payload, { merge: true })` on `system_settings/latest_release` (also optionally uploading the APK to Firebase Storage and building a `storageDownloadUrl`).

Version comparison is **pure numeric `versionCode` compare** (`release.versionCode > installedVersionCode`), never semver on `versionName`; installed version comes from `expo-application`'s `Application.nativeBuildVersion`/`nativeApplicationVersion`, falling back to `Constants.expoConfig`.

Download: `expo-file-system`'s `File.createDownloadTask` into the app's cache directory (`Paths.cache/apk-updates/spendly-{versionCode}.apk`). Install: a custom native Expo module (`modules/apk-installer`, Kotlin) using Android's `PackageInstaller` session API with a `PendingIntent` result receiver, gated behind `canRequestPackageInstalls()`/`REQUEST_INSTALL_PACKAGES` permission and `ACTION_MANAGE_UNKNOWN_APP_SOURCES` settings-intent fallback.

Mandatory vs optional: `release.mandatory` drives whether the "Not now" dismiss option is hidden and whether the sheet re-shows on every foreground regardless of prior dismissal (dismissal is session-only, never persisted, even for optional updates).

Failure handling: Firestore subscription errors are logged via `lib/errors.ts`'s `logWarning`; **download/install/permission failures inside `installAppRelease` are caught and silently fall back to `Linking.openURL(testerUrl||downloadUrl)` with no `logError`/`logWarning` call** — this is a real gap (errors swallowed, not logged) worth flagging (see §25/§29), independent of the multi-app split.

**Critically: nothing in this pipeline is product-aware today.** No "ganesh"/"nutrition"/"expense"/"product" string appears anywhere in `lib/appRelease.ts`, `hooks/useAppUpdate.ts`, `lib/apkUpdate.ts`, `modules/apk-installer/**`, or `scripts/publish-release-metadata.js`. The release metadata document carries no package/applicationId field, and nothing validates that a downloaded APK's package matches `context.packageName` before installing. This is currently *moot* only because there's one shared `applicationId` — it becomes a real correctness/security requirement the moment three separate `applicationId`s exist while sharing this code unmodified (see §26 and §29).

## 22. Recommended In-App Update Architecture

Do not redesign the mechanism (Firestore-listener + PackageInstaller flow works and matches the task's "do not redesign blindly" instruction) — extend its metadata scope to be product-keyed:

- Add a `product: "expense"|"nutrition"|"ganesh"` field to the `AppRelease` schema (`lib/appRelease.ts`) and to the publisher script's payload.
- Change the Firestore document path from the single global `system_settings/latest_release` to a per-product path, e.g. `system_settings/latest_release_{product}` (minimal change — same collection, product-suffixed doc id) or a `releases` collection keyed by product id (`releases/{product}`). Either works; the suffixed-doc-id approach is the smaller diff from today's code.
- Each product's build compiles in a constant (from the same build-time `PRODUCT` value in §14) that selects which document `useAppUpdate` subscribes to — so an Expense build only ever listens to the Expense doc, never able to "see" a Nutrition or Ganesh release even if all three still share one Firestore project (which they do, per §20's recommendation).
- As defense-in-depth (not strictly required if the per-product document scoping above is correct), also have the publisher script write `applicationId` into the metadata and have the client optionally assert `release.applicationId === Application.applicationId` before offering the update — cheap insurance against a future misconfiguration (e.g., someone points a build's `PRODUCT` env at the wrong doc).
- Fix the silent-failure gap noted in §21 (add `logError`/`logWarning` calls in `installAppRelease`'s catch block) — a good opportunistic fix while touching this code, independent of the product split.

## 23. Versioning Strategy

Today: one shared version stream. `app.json`'s `expo.version`/`expo.android.versionCode` are the source of truth; CI computes `VERSION_CODE = VERSION_CODE_OFFSET(vars) + GITHUB_RUN_NUMBER`, monotonic-guarded against the last committed value, and commits the bump back to `app.json`/`package.json` after a successful release (`scripts/common.js:updateVersion`). Not EAS-managed, not purely git-tag-driven — a hybrid CI-run-number + committed-file scheme. `eas.json` is present but unused by any actual process.

Recommended for three independent products: give each product its **own** versionCode/versionName stream, e.g. by storing `expo.version`/`versionCode` per-product in the `products/{product}/app.config.overrides.json` file proposed in §15, and computing versionCode per-product as `PRODUCT_VERSION_CODE_OFFSET[product] + GITHUB_RUN_NUMBER` (three distinct offsets, e.g. via three `vars.*_VERSION_CODE_OFFSET` repo variables) so Expense/Nutrition/Ganesh versionCodes never collide or interfere with each other's monotonic guard. Git tags become product-prefixed (`expense-v2.4.0-…`) per §19, and the in-app update comparison logic (§22) already only ever compares within one product's document, so cross-product version comparison is a non-issue once the metadata is product-scoped.

## 24. Secrets & Environment Variables

Existing secrets (names only, no values, per task rule): `GITHUB_TOKEN`, `MOBILE_ENV_FILE`, `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_SHARE_URL`, `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER`, `EXPO_PUBLIC_FIREBASE_APP_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GEMINI_API_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEYSTORE_BASE64`, `FIREBASE_SERVICE_ACCOUNT`. Existing repo variables: `VERSION_CODE_OFFSET`, `FIREBASE_ANDROID_APP_ID`.

**Should stay shared:** `GITHUB_TOKEN`, `FIREBASE_SERVICE_ACCOUNT` (same project, same service account can administer multiple Android apps' App Distribution unless least-privilege scoping argues otherwise later), all `EXPO_PUBLIC_FIREBASE_*` (same project config), `EXPO_PUBLIC_SUPABASE_*` (Ganesh-only today but harmless to leave in the shared `.env` template even if only Ganesh builds consume it), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (shared OAuth client), the Android **keystore** (`ANDROID_KEYSTORE_BASE64`/passwords) if the products can share one signing identity — this is a judgment call the user should confirm; there is no technical requirement for three separate keystores since the three products will have three different `applicationId`s regardless of shared signing key, but Play Store policy/organizational preference may argue for separate keys per app.

**Should become product-specific:** `FIREBASE_ANDROID_APP_ID` (repo variable) → `EXPENSE_FIREBASE_ANDROID_APP_ID` / `NUTRITION_FIREBASE_ANDROID_APP_ID` / `GANESH_FIREBASE_ANDROID_APP_ID`; `VERSION_CODE_OFFSET` → `EXPENSE_VERSION_CODE_OFFSET` / `NUTRITION_VERSION_CODE_OFFSET` / `GANESH_VERSION_CODE_OFFSET`; `EXPO_PUBLIC_GEMINI_API_KEY` could remain shared or be scoped to only the Nutrition workflow's `.env` composition (no technical need to withhold it from other builds, but no need to include it either — a minor build-input-hygiene choice, not a security requirement).

## 25. Security Considerations

- **Firestore rules do not distinguish Expense from Nutrition data** (§10) — once separate apps exist, a Nutrition app build retains latent read/write access to Expense collections under the same rule tree (and vice versa) unless rules are tightened. Not a new vulnerability introduced by the split, but worth revisiting now that "product" becomes an explicit concept — e.g. via custom claims or simply accepting it as an intentional trust boundary since it's the same user's own data either way.
- **No package/applicationId field in release metadata, no verification of it against the running app before install** (§21) — currently moot (one shared applicationId) but becomes a real gap the moment three applicationIds exist; must be closed as part of §22's product-scoped metadata work, not left for later.
- **APK download integrity**: `AppRelease` already carries an optional `sha256` field (`lib/appRelease.ts`) — confirm (in the implementation phase) whether `lib/apkUpdate.ts` actually verifies the downloaded file's hash before invoking `PackageInstaller`, or whether that field is currently unused/advisory only; if unused, wire it in as a defense against a corrupted/tampered download, independent of the product split.
- **Firebase service-account credential scope**: currently one service account with (per README) Firebase App Distribution Admin + Cloud Datastore User (+ optionally Storage Admin) roles across the whole project; if it will administer three Android apps' distribution, confirm its IAM role still covers all three Firebase Android app resources (it should, since App Distribution Admin is project-scoped) — no change needed, just a confirmation item.
- **Silent error swallowing in the update-install failure path** (§21) — not a security hole per se, but reduces observability into failed/attempted updates; recommend fixing opportunistically.
- **Signing key sharing across products**: if one keystore signs all three APKs, a compromise of that key compromises all three products' update trust simultaneously; if the user has any reason to want blast-radius isolation between products (e.g. Ganesh handles festival financial contributions from the public), separate keystores per product is the safer default — flagged as a decision point, not a mandate.

## 26. Testing Strategy

| Product   | Build | GitHub Release | Firebase Distribution | Update Check | APK Install | Regression |
|---|---|---|---|---|---|---|
| Expense   | ✓ correct `applicationId`/icon/name; SMS permission present | ✓ tag `expense-v...`, correct asset name | ✓ uploads to Expense's Firebase Android app id, correct tester group | ✓ reads only `latest_release_expense` doc, never offers Nutrition/Ganesh release | ✓ installs over existing `com.example.expensetracker`-equivalent expense package without touching other products | ✓ existing Expense features (SMS auto-add, ledger, investments) still function |
| Nutrition | ✓ correct `applicationId`/icon/name; SMS permission absent | ✓ tag `nutrition-v...` | ✓ uploads to Nutrition's Firebase Android app id | ✓ reads only its own doc | ✓ installs cleanly as a distinct package alongside Expense/Ganesh on the same device | ✓ nutrition logging/scanner/analytics still function |
| Ganesh    | ✓ correct `applicationId`/icon/name; camera/image-picker permission present, SMS absent | ✓ tag `ganesh-v...` | ✓ uploads to Ganesh's Firebase Android app id | ✓ reads only its own doc | ✓ installs cleanly as a distinct package | ✓ pandal/festival flows, Supabase file upload still function |

Additional cross-cutting tests: shared-auth sign-in works identically across all three built apps (same Firebase project); a device with all three apps installed shows three distinct app icons/launcher entries (proof of distinct `applicationId`s, not just distinct display names); each app's "About/version" screen shows the correct product-specific version number independent of the other two's release cadence; verify the monotonic versionCode guard doesn't cross-contaminate between products once offsets are separated (§23).

## 27. Migration Plan

Phased, each phase independently shippable/reversible:

1. **Phase 0 (this analysis)** — no code changes. Get sign-off on Option D architecture (§14).
2. **Phase 1 — Build-time product config, no CI change yet.** Introduce `app.config.js` (replacing static `app.json`) that reads a `PRODUCT` env var and emits the right `applicationId`/name/icon/permissions/plugins; keep default `PRODUCT=expense` so today's single combined build keeps working unchanged if the var is unset (backward-compatible). Verify locally via `expo prebuild` for each of the three values, comparing generated Android manifests — no APK actually published from this phase.
3. **Phase 2 — Route-tree gating.** Make `app/_layout.tsx`/`app/welcome.tsx` register only the relevant route group(s) for the active `PRODUCT` at build time (compile-time `if` on the env var, not a runtime switch) — verify each product's build still boots to the right screen and that the other two products' screens are genuinely excluded from the bundle (bundle-size/import check).
4. **Phase 3 — Update-metadata product scoping.** Add the `product` field and per-product Firestore doc path (§22) to `lib/appRelease.ts`, `hooks/useAppUpdate.ts`, and `scripts/publish-release-metadata.js`; ship this as a backward-compatible change first (both old single-doc readers and new per-product readers coexist) so the existing production app (still on the combined build) keeps receiving updates from the old doc path unaffected.
5. **Phase 4 — CI/CD split.** Introduce the reusable `workflow_call` release workflow (§18) and three thin per-product callers; wire in the three Firebase Android app ids (after registering them in the Firebase console — a one-time human/console action) and per-product versionCode offsets (§23/§24).
6. **Phase 5 — First product-specific releases.** Run each of the three new workflows once, manually verify the resulting APKs (application ID, icon, permissions, Firebase Distribution target, GitHub Release tag) before distributing to any real testers.
7. **Phase 6 — Retire the combined build** (only after all three product apps are validated and existing users have been communicated with/migrated — see §29 for the existing-production-app caveat) by stopping further releases of the old `android-release.yml` combined workflow. Do not delete it immediately; keep it available as a rollback path (§28) for at least one full release cycle.

## 28. Rollback Plan

Each phase in §27 is additive and gated behind an env var or a new/parallel file, not a destructive edit to the existing combined workflow/app — so at every phase, reverting is either (a) unsetting/removing the new env var or config (Phases 1-3), or (b) simply not invoking the new per-product workflows and continuing to use `android-release.yml` (Phases 4-6). Concretely: do not delete or rewrite `android-release.yml`, `app.json`'s current static values, or `lib/appRelease.ts`'s existing single-doc read path until the three product apps have shipped at least one successful, verified release each and any existing production users are confirmed to be on a compatible path. If a per-product release goes wrong post-launch (e.g. wrong Firebase app targeted, corrupted metadata), the fix is either a corrected re-run of that product's workflow (idempotent per §17/§18's `--clobber`/merge semantics already in place) or, worst case, manually deleting the bad GitHub Release/tag and Firestore doc entry for that product only — never affecting the other two products' release streams since they'd be in separate docs/tags by then.

## 29. Risks & Edge Cases

- **Existing production app continuity**: the current single APK (`com.example.expensetracker`) has real installed users. Per task rule §15/21, this application ID should almost certainly become one of the three products' permanent ID (most likely Expense, since it's the largest/oldest surface and the package name literally says "expensetracker") so existing users' installed app keeps updating in place with no reinstall; Nutrition and Ganesh would then need **new** application IDs (net-new installs for anyone currently using those workspaces inside the combined app) — this is a user-communication/migration concern, not just a technical one, and should be explicitly confirmed with the user before implementation, not assumed.
- **Users currently relying on the combined app's Nutrition or Ganesh workspace** lose that functionality when the combined app stops receiving updates (§27 Phase 6) unless they separately install the new standalone Nutrition/Ganesh apps — needs a migration/communication plan (in-app message pointing to the new app's Play Store/APK link), not purely a CI/CD concern.
- **Signing-key continuity**: if a product's `applicationId` changes are combined with a signing-key change, Android will refuse to install the "update" over the old app at all (different signature) — this reinforces the previous point: whichever product keeps `com.example.expensetracker` must also keep the same keystore, or existing users must uninstall/reinstall.
- **Shared Firestore rule tree between Expense and Nutrition** (§10/§25) means a "wrong Firebase app received Nutrition's release" failure mode (§12 in the task's framing) is about release *distribution*, not data access — data access is already shared by design; the risk to actually guard against is the update-metadata cross-contamination described in §21/§22, which is a real, previously-unmitigated gap.
- **GitHub/Firebase partial-failure scenarios** (build succeeds but Firebase upload fails, or vice versa): today's workflow already handles this reasonably — Firebase Distribution step has `continue-on-error: true` and the version-bump commit step only runs `if: always() && (github_apk.outcome=='success' || distribute.outcome=='success')`, so a Firebase-only failure doesn't block the GitHub Release or the version commit. This existing pattern should be preserved per-product in the reusable workflow (§18), so e.g. Ganesh's Firebase failure doesn't block Ganesh's GitHub Release, and definitely doesn't affect Expense's or Nutrition's independent runs.
- **Network/GitHub/Firebase unavailability at update-check time**: already handled client-side via the `onSnapshot` error callback (`logWarning`, clears release state) — no change needed, just confirm the per-product doc path change (§22) doesn't regress this handling.
- **A mandatory update being released for the wrong product** (human error selecting the wrong `product` workflow-dispatch input) — mitigated by keeping three distinct workflow files (§18's Approach C) rather than one shared input, since the Actions "Run workflow" UI then shows three unambiguous named workflows instead of a dropdown a person could fat-finger.

## 30. Final Implementation Checklist

(For the future implementation phase — not to be started without separate approval per the task's explicit rules.)

- [ ] Confirm with the user which existing `applicationId` (almost certainly Expense's) must be preserved for existing production users, and get explicit sign-off on new IDs for the other two products.
- [ ] Decide: shared signing keystore across all three products, or per-product keystores (§24/§29 security trade-off).
- [ ] Register three Android apps in the existing Firebase project console; capture three `FIREBASE_ANDROID_APP_ID`s and (if separate `google-services.json` files are used) three client configs.
- [ ] Introduce `app.config.js` + `products/*.json` overrides (Phase 1).
- [ ] Gate route registration by build-time `PRODUCT` (Phase 2).
- [ ] Add `product`-scoped fields/paths to `AppRelease`/`useAppUpdate`/`publish-release-metadata.js`, plus the applicationId-consistency check and the swallowed-error logging fix (Phase 3, §22/§25).
- [ ] Build the reusable `workflow_call` release workflow and three thin per-product callers (Phase 4, §18).
- [ ] Add per-product `VERSION_CODE_OFFSET`/tag scheme secrets/variables (§23/§24).
- [ ] Run and manually verify one release per product before any tester distribution (Phase 5).
- [ ] Draft user-facing migration messaging for anyone currently using the combined app's Nutrition/Ganesh workspace (§29).
- [ ] Only after all above are verified in production: stop further releases of the legacy combined workflow (Phase 6), keeping it as a rollback path for one cycle.

---

### Recommended Architecture

Keep one repository and one Expo project; add a build-time `PRODUCT` selector that drives Android `applicationId`/permissions/plugins and gates which route tree compiles in; split CI into one reusable `workflow_call` release workflow invoked by three thin per-product workflow files, each producing its own tagged GitHub Release and targeting its own Firebase Android app (same Firebase project, three app entries); extend the existing Firestore-based update-metadata document to be product-scoped so each installed app only ever sees its own releases. Preserve the existing production `applicationId`/keystore for whichever product it currently represents (almost certainly Expense) so existing users are unaffected.

### Target Repository Tree

```text
(unchanged for Phase 1-3: app/, components/, hooks/, providers/, shared/, lib/, modules/, services/, scripts/)
+ app.config.js                      # NEW — dynamic config, replaces static app.json, reads PRODUCT
+ products/
    expense.json                     # NEW — per-product overrides (applicationId, name, icon, permissions, plugins)
    nutrition.json                   # NEW
    ganesh.json                      # NEW
.github/workflows/
    pr-checks.yml                    # unchanged
    android-release.yml              # kept temporarily as legacy/rollback path (Phase 6 retires it)
  + release.yml                      # NEW — reusable workflow_call, product-parameterized
  + release-expense.yml              # NEW — thin caller
  + release-nutrition.yml            # NEW — thin caller
  + release-ganesh.yml               # NEW — thin caller
```

### Product Build Matrix

```text
Expense    — applicationId: (preserve existing) | SMS permission: yes | native: sms-reader | Firebase app: Expense
Nutrition  — applicationId: new                  | SMS permission: no  | native: camera/image-picker (tbd)  | Firebase app: Nutrition
Ganesh     — applicationId: new                  | SMS permission: no  | native: camera/image-picker, Supabase | Firebase app: Ganesh
```

### CI/CD Flow

```text
GitHub Actions (workflow_dispatch on release-{product}.yml)
   → calls reusable release.yml with product={expense|nutrition|ganesh}
   → resolve product config → expo prebuild → Gradle assembleRelease
   → GitHub Release tag "{product}-v{version}-{code}"
   → Firebase App Distribution → per-product Firebase Android app, per-product tester group
   → publish metadata to Firestore doc scoped to {product}
   → installed {product} app's onSnapshot listener on its own doc → update prompt → download → PackageInstaller install
```

### Files Expected to Change (implementation phase, not now)

`app.json` → replaced by `app.config.js`; `app/_layout.tsx`, `app/welcome.tsx`, `app/index.tsx` (route gating); `lib/appRelease.ts`, `hooks/useAppUpdate.ts`, `lib/apkUpdate.ts`, `scripts/publish-release-metadata.js` (product-scoped metadata); `.github/workflows/android-release.yml` (split into reusable + callers); `scripts/common.js` (per-product version offsets); new `products/*.json`.

### Files That Should Remain Untouched

`providers/AuthProvider.tsx`, `lib/firebase.ts`, `lib/supabase.ts`, `firestore.rules`/`storage.rules` (unless the Expense/Nutrition rule-tightening in §25 is separately approved), `shared/` internals (types/utils), `modules/apk-installer` and `modules/sms-reader` native implementations (only their per-product *inclusion* changes, not their code), `components/`, `hooks/`, `services/` business logic.

### Native Dependency Removal Candidates (per non-Expense product build)

- `modules/sms-reader` + `READ_SMS`/`RECEIVE_SMS` permissions, for Nutrition and Ganesh builds — **Confirmed** safe to exclude.
- `@supabase/supabase-js`, for Expense and Nutrition builds — **Confirmed** Ganesh-only usage today.
- Ganesh-specific `expo-image-picker` permission copy, for Expense/Nutrition builds (library itself likely still needed by Nutrition's scanner) — **Likely**, requires verification of Nutrition's actual camera usage.
- `modules/apk-installer` for Nutrition/Ganesh, if those products are decided not to need self-update — **Requires verification** (currently only confirmed wired into the Expense layout; product owners should decide if Nutrition/Ganesh want the same in-app-update UX).
- `react-native-qrcode-svg`, for a hypothetical Nutrition build — **Requires verification** (not confirmed used by Nutrition at all).

### GitHub Actions Changes

Split `android-release.yml` into one reusable `workflow_call` file plus three thin per-product `workflow_dispatch` callers (§18); add per-product secrets/variables (§24); change tag/asset naming to be product-prefixed (§19); keep `pr-checks.yml` untouched (already product-agnostic quality gate).

### Firebase Changes

Register three Android apps within the existing Firebase project (§20); no new Firebase projects; no change to Firestore/Storage/Auth configuration itself, only to which Android app id App Distribution targets and which Firestore document release metadata is written to (§22).

### Update System Changes

Add a `product` field and per-product document path to the existing Firestore-listener-based update mechanism (§22); no change to the download/install (`PackageInstaller`) mechanism itself; opportunistically fix the silent-failure logging gap noted in §21/§25.

### Estimated Complexity

**Medium-High.** The CI/CD parameterization (§18) and update-metadata scoping (§22) are mechanical, low-risk, and well-supported by the existing script-driven (non-EAS-coupled) pipeline. The higher-complexity, higher-judgment parts are: (1) deciding and safely executing the existing-production-`applicationId` preservation and user-migration story (§29) — a product/business decision as much as a technical one; (2) the Expense/Nutrition data-isolation gap at the Firestore-rules layer (§10/§25), which is pre-existing and not required to fix for a build-level split, but is worth a deliberate decision either way; (3) verifying the several "Requires verification" items (Nutrition's camera usage, `apk-installer`'s intended scope, `react-native-qrcode-svg` usage) before finalizing per-product native-dependency exclusion lists, to avoid shipping a broken build for a product that turns out to need a dependency this analysis couldn't fully confirm from static inspection alone.

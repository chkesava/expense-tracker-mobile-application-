# Codebase Audit — 2026-08-14

Scope: read-only audit of the Expo/React Native expense-tracker app. No code was
modified as part of this audit. Checks performed: architecture review,
`tsc --noEmit` type check, ESLint configuration check, and the existing Vitest
test suite.

---

## 1. Current Architecture

- **Framework**: Expo SDK ~57.0.10, expo-router ~57.0.10 (file-based routing,
  typed routes enabled via `experiments.typedRoutes` in [app.json](../../app.json)),
  React 19.2.3, React Native 0.86.2, TypeScript ~6.0.3 with `strict: true` in
  [tsconfig.json](../../tsconfig.json).
- **Routing**: [app/_layout.tsx](../../app/_layout.tsx) wraps the app in a deep
  stack of React Context providers and renders the root `<Stack>`. Route
  groups: `(app)` (the main authenticated application — dashboard, ledger,
  accounts, credit-card bills, vaults, SMS inbox, settings, insights), `(auth)`
  (login), and `(nutrition)` (a separate mini-feature: index, log, profile,
  scanner) that appears unrelated to expense tracking but ships inside the
  same app.
- **State management**: `zustand` is listed as a dependency in
  [package.json](../../package.json) but a repo-wide search found no import of it
  anywhere in application source — it is currently dead weight. The state
  management that is actually in use is React's Context API: 13 provider
  files live in [providers/](../../providers/) (Auth, Workspace, Settings,
  FinanceData, LedgerState, UserDoc, CreditCardBills, Localization, Modal,
  Network, SetupProgress, SmsReceiver, SystemSettings, Celebration), each
  exposing its own `useX()` hook. Server/remote state is cached with a single
  TanStack Query `QueryClient` created in `app/_layout.tsx`
  (`staleTime: 60_000`, `retry: 1`), with per-domain query hooks living in
  [hooks/](../../hooks/) (e.g. `useAccounts.ts`, `useExpenses.ts`,
  `useMarketQuotes.ts`).
- **Authentication**: Firebase email/password auth plus Google Sign-In via
  `@react-native-google-signin/google-signin`. The most notable feature here
  is a **duress-mode** mechanism: [lib/authHelpers.ts](../../lib/authHelpers.ts)
  contains `createDuressUser(real)`, which takes a genuine Firebase `User`
  object and returns a proxy whose `uid` getter is overridden to return
  `` `${real.uid}_duress` `` instead of the real uid. [providers/AuthProvider.tsx](../../providers/AuthProvider.tsx)
  exposes both this possibly-swapped `user` and the always-real `realUser`.
  [lib/privacySession.ts](../../lib/privacySession.ts) tracks an in-memory
  unlock/lockout state machine (failed-attempt counter, 30-second lockout
  after 5 failures) and flags whether the current unlock was a duress unlock.
  The intent: if someone is forced under coercion to unlock the app, they can
  enter a separate duress credential and the app will silently operate
  against an empty/decoy Firestore data tree instead of their real financial
  data, while remaining authenticated as the real Firebase user underneath.
  This only works because [firestore.rules](../../firestore.rules)'s `isOwner(uid)`
  function explicitly treats both `request.auth.uid` and
  `request.auth.uid + '_duress'` as the same authorized owner. This path is
  covered by exactly one test file,
  [lib/duressPath.contract.test.ts](../../lib/duressPath.contract.test.ts).
  Biometric unlock uses `expo-local-authentication` together with
  `expo-secure-store` (see `hooks/useBiometrics.ts`).
- **Database/backend**: Firebase Firestore is the only backend configured in
  this repository (no Firebase Functions or Hosting config present).
  [firestore.rules](../../firestore.rules) documents the full list of
  per-user collections under `users/{uid}/...` (accounts, expenses, incomes,
  borrowings, receivables, investments, holdings, subscriptions, trips, etc.)
  plus three shared/cross-user collections: `vaults/{vaultId}` (with an
  `expenses` subcollection), `splits/{splitId}`, and
  `paymentRequests/{requestId}` (deliberately world-readable, since it backs
  a public payment link for people who are not signed in). The rules file
  itself states it is **not deployed by CI** — deployment is a manual step
  documented in [docs/FIREBASE_RULES_DEPLOY.md](../FIREBASE_RULES_DEPLOY.md).
  Market/stock-quote data is fetched from an external Netlify-hosted web app
  (configured via the `EXPO_PUBLIC_MARKET_API_URL` / `EXPO_PUBLIC_APP_URL`
  environment variables) whose server code lives outside this repository.
  `firebase-admin` is a devDependency used only by
  [scripts/publish-release-metadata.js](../../scripts/publish-release-metadata.js),
  which writes the latest release version and download URL to a
  `system_settings/latest_release` Firestore document so installed apps can
  detect and prompt for updates.
- **Local storage**: AsyncStorage is used across roughly 17 files for
  non-sensitive local flags and preferences (e.g. theme choice, "has launched
  before" flag). `expo-secure-store` is used specifically for the biometric
  vault identifier (`app/_layout.tsx`, `hooks/useBiometrics.ts`,
  `shared/storage/memoryStorage.ts`). `expo-file-system` is used in exactly
  one place, [components/portfolio/CsvImportModal.tsx](../../components/portfolio/CsvImportModal.tsx),
  for reading an imported CSV file.
- **Notifications**: `expo-notifications` is configured in
  [app.json](../../app.json) (custom icon/color) and a notification handler is
  set up in `app/_layout.tsx` for non-web platforms. All scheduled
  notifications are local, on-device notifications — SMS-transaction review
  prompts (`services/sms/smsNotifications.ts`) and credit-card bill-due
  reminders (`services/creditCardBills/billReminderScheduler.ts`). There is no
  server-side push notification infrastructure in this repository.
- **Android configuration**: [app.json](../../app.json) requests the Android
  permissions `USE_BIOMETRIC`, `USE_FINGERPRINT`, `READ_SMS`, `RECEIVE_SMS`,
  and `POST_NOTIFICATIONS`. The Android `package` (applicationId) is set to
  `com.example.expensetracker`, and `versionCode` is currently `39` (per
  [app.json](../../app.json) and the latest commit message bumping to build 39),
  meaning this placeholder-looking package id belongs to an app that is
  already well into active release iteration. `google-services.json` is
  committed at the repo root. The `READ_SMS`/`RECEIVE_SMS` permissions back a
  large, custom on-device SMS pipeline: a native module at
  [modules/sms-reader/](../../modules/sms-reader/) reads incoming SMS messages,
  which are then parsed, filtered for relevance, classified as
  income/expense, deduplicated, matched against a merchant/institution
  catalog, and automatically turned into expense or income ledger entries —
  all of this logic lives in [services/sms/](../../services/sms/) (roughly 35
  files). Nothing in the code that was reviewed sends raw SMS content to any
  remote server; processing appears to happen entirely on-device.
- **Testing setup**: [vitest.config.ts](../../vitest.config.ts) restricts the
  test run to four directories: `shared/**/*.test.ts`, `services/**/*.test.ts`,
  `lib/**/*.test.ts`, and `services/sms/**/*.test.ts`, running under vitest's
  `node` environment. There are 83 test files totaling 554 tests, almost all
  of them pure-function/business-logic unit tests (currency formatting, date
  math, split math, CSV export, SMS parsing/categorization/deduplication,
  duress-path routing, ledger guards, etc.). `package.json` has no
  `@testing-library/react-native` and no `jest-expo` in its dependencies,
  which confirms there is no infrastructure in place to render or test any
  screen, component, or provider — everything under `app/` and `components/`
  is currently untested by automation.
- **Build configuration**: [eas.json](../../eas.json) defines three build
  profiles — `development` (dev client, internal distribution), `preview`
  (internal distribution, Android APK build type), and `production` (default
  settings) — plus a `submit.production` entry. [scripts/](../../scripts/)
  contains a chain of Node.js release-automation scripts invoked by the
  `release:*` npm scripts in `package.json`:
  - `verify-environment.js` — checks that the local Node/tooling versions and
    required environment variables are present before a release proceeds.
  - `verify-keystore.js` — checks that the Android release keystore file
    exists and is valid.
  - `verify-google-services.js` — checks that `google-services.json` is
    present where the Android build expects it.
  - `verify-gradle.js` — checks that the Gradle signing configuration
    (`build.gradle`/`gradle.properties`) matches the expected keystore and
    key alias.
  - `prepare-release.js` — runs the four verification scripts above in
    sequence, then bumps the app's `versionName`/`versionCode` and records
    release state.
  - `build-release.js` — runs the actual Android release build.
  - `extract-sha1.js` — extracts the SHA1/SHA256 fingerprints from the
    release keystore, needed for configuring Google Sign-In and Firebase.
  - `release-report.js` — prints a combined summary of release state,
    version, and keystore fingerprints.
  - `publish-release-metadata.js` — uses `firebase-admin` to publish the
    release/download metadata to Firestore for in-app update prompts.

---

## 2. Current Build/Test Status

| Check | Command | Result |
|---|---|---|
| TypeScript type check | `npx tsc -p tsconfig.json --noEmit` | **Passed.** No type errors were reported. |
| ESLint | *(no lint script exists in `package.json`)* | **Not configured.** There is no `.eslintrc*` file, no `eslint.config.*` file, and no `eslint` package anywhere in `dependencies` or `devDependencies`. A repo-wide search for any ESLint-related file or reference in `package.json` returned nothing. This means there is currently no automated linting of any kind in this project. |
| Test suite | `npx vitest run` | **Passed.** 83 test files, 554 individual tests, all passing, in about 88 seconds. |

---

## 3. Critical Risks

Each risk below is explained in full — what the issue is, why it matters, and
what could go wrong if it is left as-is.

1. **There is no linting configured anywhere in this project.**
   Normally a React Native/TypeScript project would run ESLint (often with
   `eslint-plugin-react-hooks` and Expo/React Native presets) as part of
   local development and CI. Here, there is no `.eslintrc` file, no
   `eslint.config.js`, no `eslint` dependency, and no `lint` npm script.
   This means nothing automatically catches things like unused variables,
   incorrectly-ordered or conditionally-called React hooks, unreachable
   code, accidental `console.log`s left in, or common mistakes specific to
   React Native (like missing dependency arrays in `useEffect`). The only
   safety nets currently in the project are the TypeScript compiler (which
   catches type errors, not logic/style problems) and the Vitest test suite
   (which only covers pure business logic, not UI code — see risk #2). Any
   bug that isn't a type error and isn't covered by one of the 554 existing
   tests can currently reach a commit, a PR, and a release build completely
   unflagged.

2. **There is zero automated test coverage for any UI code.**
   All 554 passing tests live under `shared/`, `services/`, and `lib/`, and
   they test pure functions and business logic in isolation (for example,
   currency formatting, date math, SMS parsing rules, ledger balance
   calculations). None of them render a React component, a screen, or a
   provider. `package.json` has no `@testing-library/react-native` and no
   `jest-expo`, which are the two most common tools used to actually mount
   and test React Native components. This means every file under `app/`
   (all screens and layouts) and every file under `components/` (all UI
   components) is completely unverified by any automated test. A change
   that breaks how the dashboard renders, breaks the login flow, or breaks
   how the 13 context providers compose together in `app/_layout.tsx` would
   not be caught by `npm test` — it would only be caught by a human manually
   opening the app and clicking through it.

3. **Firestore security rules are not deployed automatically by CI.**
   The rules file itself, [firestore.rules](../../firestore.rules), states in
   its own header comment that it is a "reference source of truth" and that
   it is "NOT deployed by CI" — deployment is a manual step described in
   [docs/FIREBASE_RULES_DEPLOY.md](../FIREBASE_RULES_DEPLOY.md). This means the
   rules that are actually enforced on the live Firestore database could, in
   principle, be out of sync with what is committed in this repository —
   for example, if someone edits the rules file and forgets to run the
   manual deploy step, or if someone deploys a rules change directly from
   the Firebase console without updating this file. Since these rules are
   what prevents one user from reading or writing another user's financial
   data, any drift here is a data-isolation risk, not just a documentation
   nit.

4. **The app requests the `READ_SMS` and `RECEIVE_SMS` Android permissions,
   and no privacy-policy document was found anywhere in this repository.**
   These two permissions are on Google Play's list of "restricted
   permissions" — apps that request them must complete a Play Console
   "Sensitive App Permissions" declaration explaining why the permission is
   needed, and must also fill out a Play Store "Data Safety" section
   describing what SMS data is read, how it's used, and whether it's shared.
   Both of these normally point to a public privacy policy. A search of this
   repository (including the `docs/` folder, which contains many other
   design and phase-report documents) found no file with "privacy" in its
   name and no privacy-policy content. This does not necessarily mean no
   privacy policy exists at all — it may be hosted externally (e.g. on the
   Netlify-hosted companion web app) — but nothing in this repository
   confirms that, and it is worth verifying before any Play Store
   submission that includes this permission set, since Google can reject or
   remove an app that requests sensitive permissions without a compliant
   declaration.

5. **The Android application ID is the placeholder value
   `com.example.expensetracker`, despite the app already being on
   versionCode 39.**
   `com.example.*` is the conventional placeholder package name shown in
   Android tutorials and starter templates — it is not meant to be used for
   a real, shipping application. The fact that this project is already at
   `versionCode: 39` (and the most recent commit in this repository's
   history is literally "chore: bump version to v2.0.0 (build 39)") shows
   this is an actively released, non-trivial app still carrying that
   placeholder id. This matters because the Android application ID cannot be
   changed after an app has been published to the Google Play Store without
   effectively creating a brand new app listing (losing reviews, install
   counts, and update continuity for existing users). If this has already
   been published under this id, changing it later would be highly
   disruptive; if it has not yet been published, this is the last
   opportunity to fix it for free.

6. **`google-services.json` is committed directly into the repository.**
   This file is required for Firebase to work on Android and is not, by
   itself, a private secret in the way an API key or password is — it is
   designed to be shipped inside the compiled app. However, having it
   committed in plaintext in version control means anyone with read access
   to this repository (including this audit) can see exactly which Firebase
   project this app is wired to. This is flagged here only so the team can
   confirm this is the intended production Firebase project and that no
   more sensitive server-side credentials are sitting alongside it.

---

## 4. Top 10 Issues, Ranked by Priority

Priority key: **P0** = must fix before next release / actively dangerous gap,
**P1** = should fix soon, meaningful risk, **P2** = should fix, moderate
impact, **P3** = worth fixing, low urgency.

1. **[P0] No ESLint or any static-analysis tooling is configured at all.**
   As explained in Critical Risk #1 above, there is currently nothing
   automatically checking code quality or common React/React-Native
   mistakes before code is merged or released. This is the single highest-
   leverage gap to close because it's cheap to fix and immediately starts
   catching a whole category of bugs that today rely entirely on human
   review.

2. **[P0] There is no automated test coverage for any screen, component, or
   provider.**
   As explained in Critical Risk #2, all 554 existing tests are pure-logic
   unit tests with no rendering involved. Every user-facing surface of this
   app — including the login screen, the duress-mode unlock flow, and the
   entire dashboard — is verified only by manual testing today.

3. **[P1] Firestore rules deployment is a manual, un-enforced step.**
   As explained in Critical Risk #3, the rules committed to this repository
   are not guaranteed to be the rules actually running in production,
   because deployment depends on someone remembering to run a manual
   command.

4. **[P1] Sensitive `READ_SMS`/`RECEIVE_SMS` permissions with no located
   privacy-policy documentation in this repository.**
   As explained in Critical Risk #4, this is a Google Play compliance risk
   that should be confirmed and resolved before any store submission, even
   though the policy may simply live outside this repository.

5. **[P2] The `zustand` package is installed but is never actually used
   anywhere in the application source code.**
   A repository-wide search found `zustand` referenced only inside
   `package.json` and `package-lock.json` — no store file, no `persist`
   middleware usage, and no import of `zustand` in any `.ts`/`.tsx` file
   under `app/`, `components/`, `hooks/`, `lib/`, `providers/`, or
   `services/`. This means the project's actual state-management approach
   (React Context + TanStack Query) has quietly diverged from what its
   dependency list suggests, which can mislead a new contributor into
   thinking Zustand is the state-management pattern to follow. It also adds
   a small amount of unnecessary weight to the installed dependency tree.

6. **[P2] The Android `applicationId` is still the placeholder
   `com.example.expensetracker`.**
   Covered in full in Critical Risk #5. Flagged separately here because,
   unlike most of the other issues, this one becomes effectively
   unfixable once the app has been published under this id, so it deserves
   prompt attention on its own.

7. **[P2] Thirteen separate React Context providers are composed together in
   a single file (`app/_layout.tsx`), and none of that composition is
   covered by any test.**
   The providers found — Auth, Workspace, Settings, FinanceData,
   LedgerState, UserDoc, CreditCardBills, Localization, Modal, Network,
   SetupProgress, SmsReceiver, SystemSettings, and Celebration — are nested
   inside one another in a specific order in `app/_layout.tsx`. If one
   provider depends on state or context supplied by another (for example, a
   provider that needs to know the current authenticated user), the order
   of nesting matters, and there is currently no automated test that would
   catch someone accidentally reordering, removing, or duplicating one of
   these providers during a future refactor. This overlaps with, but is
   more specific than, the general lack of UI test coverage in issue #2.

8. **[P3] `shared/` has its own separate TypeScript configuration
   (`tsconfig.shared.json`) that is only checked manually via a separate npm
   script, rather than being part of a real monorepo/workspace setup.**
   The `npm run typecheck:shared` script type-checks the `shared/` folder in
   isolation using its own `tsconfig.shared.json`, which has different
   compiler settings than the main `tsconfig.json` used for the rest of the
   app. Because this is a second, manually-invoked script rather than a
   proper workspace boundary (there is no `workspaces` field in
   `package.json` and no separate `package.json` inside `shared/`), it is
   easy for the two type-checking configurations to drift apart over time
   without anyone noticing, since a normal `npm run typecheck` run does not
   automatically also run the shared-specific check.

9. **[P3] The security-critical "duress mode" feature has only a single
   contract test covering it.**
   As described in the Architecture section above, duress mode is a
   meaningful security/safety feature — its entire purpose is to protect a
   user's real financial data if they are coerced into unlocking the app.
   Despite that sensitivity, it is currently exercised by exactly one test
   file, [lib/duressPath.contract.test.ts](../../lib/duressPath.contract.test.ts),
   which contains a single test. Given how much this feature relies on a
   subtle mechanism (a proxied `uid` getter plus a matching Firestore rule
   exception), a feature this sensitive would benefit from broader test
   coverage of edge cases — for example, what happens if duress mode is
   entered mid-session, or if the app is closed and reopened while in
   duress mode.

10. **[P3] The `(nutrition)` route group appears to be an unrelated feature
    bundled inside an expense-tracking app.**
    Alongside the `(app)` and `(auth)` route groups that clearly belong to
    the expense-tracker's core purpose, there is a third route group,
    `(nutrition)`, containing an index screen, a log screen, a profile
    screen, and a scanner screen. Nothing in the surrounding code or
    documentation reviewed during this audit explains why a nutrition-
    tracking feature is bundled into an expense-tracker app. This is not
    necessarily wrong, but it's worth the team explicitly confirming
    whether this is intentional scope or leftover/experimental code that
    should be removed or split out.

---

## 5. Recommended Order for Fixing These Issues

1. **Add ESLint** with a React Native/Expo-appropriate configuration
   (including `eslint-plugin-react-hooks`). This is the cheapest of all the
   fixes and immediately starts preventing a whole class of future bugs,
   so it should happen first regardless of what else is prioritized.
2. **Add component-level test coverage**, starting with the highest-risk
   surfaces first: the authentication flow and duress-mode routing in
   `AuthProvider`, and the SMS auto-add review flow, since these touch
   security and money-handling logic most directly. `@testing-library/react-native`
   (or `jest-expo`) would need to be added as a dependency to make this
   possible at all.
3. **Make Firestore rules deployment part of CI** instead of a manual step,
   so the rules committed to this repository are guaranteed to match what's
   enforced in production.
4. **Confirm (or create) a privacy policy and Google Play Data Safety
   declaration** that explicitly covers the SMS-reading feature, before any
   Play Store submission or update goes out.
5. **Remove the unused `zustand` dependency**, or, if there's a plan to
   actually use it, document that plan so the dependency list matches
   reality.
6. **Decide on and set the real Android `applicationId`** before any further
   release builds are cut, since this becomes very costly to change after
   the app is published.
7. **Add tests around the provider composition** in `app/_layout.tsx` to
   guard against accidental breakage when providers are reordered or
   modified.
8. **Expand test coverage of the duress-mode feature** beyond the single
   existing contract test, given how security-sensitive it is.
9. Lower-priority cleanup: reconcile the `shared/tsconfig.shared.json` split
   with the main TypeScript configuration, and clarify the ownership and
   intended scope of the `(nutrition)` route group.

---

*No code was modified in the course of producing this audit, per the task
instructions. This document reflects the state of the repository as of
2026-08-14.*

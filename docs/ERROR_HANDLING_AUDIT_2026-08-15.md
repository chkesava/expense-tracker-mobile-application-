# Error Handling & Crash Resilience Audit — 2026-08-15

Scope: error handling and crash resilience only. No feature, styling, performance
or architectural changes.

Branch: `claude/error-handling-resilience-audit-f18b4a`
Baseline: 460 source files, `tsc` clean, 554 tests passing.
After: `tsc` clean (app + shared), 596 tests passing, 57 files changed.

---

## 1. Errors found

Severity: **S1** = user-visible data loss / stuck app, **S2** = misleading or
leaking behaviour, **S3** = degraded diagnostics.

### S1-1 — A failed profile read silently reset the user's settings
`providers/UserDocProvider.tsx`, `providers/SettingsProvider.tsx`

The `users/{uid}` listener's error callback set `exists = false` and `data = null`,
which is the exact state that means "document confirmed missing". `SettingsProvider`
reads that state and applies `SETTINGS_DEFAULTS`.

A transient `unavailable` or `permission-denied` therefore reset the user's
currency, monthly budget, theme and accent colour in front of them, with no error
shown. The comment in `SettingsProvider` ("Doc is confirmed missing after the first
snapshot") documented an invariant the error path violated.

### S1-2 — Every data-load failure rendered as an empty state
24 files (`hooks/use*.ts`, `providers/FinanceDataProvider.tsx`)

All 43 `onSnapshot` calls passed an error callback whose entire body was
`console.warn(...)` plus `setLoading(false)`. No hook exposed an `error` field.
`components/common/ErrorState.tsx` existed and was **imported by zero files**.

Consequence: a `permission-denied` (e.g. a Firestore rules regression), an expired
session, or a listener that could not be established produced "No Shared Vaults
Yet" / "No transactions" — indistinguishable from a genuinely empty account, with
no retry affordance and nothing on screen indicating failure.

### S1-3 — No React error boundary; route boundary printed stack traces
`app/_layout.tsx`

The only boundary was `export { ErrorBoundary } from "expo-router"`. expo-router's
built-in fallback renders the raw error message and stack trace, in release builds
as well as development. A render throw anywhere replaced the whole app with a
technical dump.

### S1-4 — No handler for uncaught exceptions or unhandled rejections
Whole app

No `ErrorUtils.setGlobalHandler`, no promise-rejection tracker. Throws from native
callbacks, timers and un-awaited promises were silent in release builds. Several
`async` press handlers (`onAllowSmsAccess`, `onToggleEnabled`) had no `catch`, so a
native-module failure produced an unhandled rejection and no user feedback.

### S1-5 — Splash screen could hang forever
`app/_layout.tsx`

`appIsReady` required `fontsLoaded`, and `useFonts`' error return value was
discarded. A font that fails to load leaves `fontsLoaded` false permanently, so
`SplashScreen.hideAsync()` was never called — a permanently blank launch. The same
applies to any of the four readiness gates never settling.

### S1-6 — Camera permission failure pinned the scanner on a spinner
`app/(nutrition)/scanner.tsx`

`await Camera.requestCameraPermissionsAsync()` was unguarded inside an effect. A
throw left `hasPermission` at `null` forever — the screen displayed "Requesting
camera permission…" with no exit. The denied branch also offered no way to reach
system settings.

### S1-7 — Corrupt SMS prefs storage pinned the settings screen on a spinner
`hooks/useSmsPermission.ts`

The mount effect awaited `loadSmsAutomationPrefs()` with no `catch`; a rejection
skipped `setPrefsLoading(false)` permanently. `refreshPermission`, `requestPermission`,
`persistPrefs` and `openSystemSettings` used `try`/`finally` with no `catch`, so
native-module failures escaped as unhandled rejections.

### S2-1 — Raw Firebase SDK strings shown to users
`lib/authHelpers.ts` and 14 call sites

`authErrorMessage` was documented as "Map Firebase (or unknown) errors to a
user-facing string" but its body returned `error.message` verbatim. Sign-in with a
wrong password produced the toast:

> Firebase: Error (auth/invalid-credential).

Thirteen further sites used `error instanceof Error ? error.message : "…"` or
`err.message || "…"`, surfacing whatever the SDK threw:
`app/(app)/settings.tsx` (×2), `app/(auth)/login.tsx` (×2),
`components/creditCardBills/CreateCreditCardBillModal.tsx`,
`components/creditCardBills/MarkBillPaidModal.tsx`,
`components/onboarding/SetupWizardModal.tsx`,
`components/portfolio/ManageStockCashModal.tsx`,
`components/sip/SipPlanFormModal.tsx`, `hooks/usePortfolio.ts` (×3),
`hooks/useVaults.ts`.

### S2-2 — Market data errors swallowed; retry could never fire
`services/marketDataService.ts`, `hooks/useMarketQuotes.ts`

Each fetcher wrapped everything in `try/catch` and returned `null` on timeout,
non-2xx, malformed JSON and genuine 404 alike. React Query saw a **successful**
`null`, so the configured `retry: 1` never ran and `isError` was never true. The
portfolio silently fell back to average buy price and presented those figures as
current valuations — wrong numbers shown as right ones.

### S2-3 — Silent failures with no user feedback
`components/ai/ReceiptScannerModal.tsx`

`handlePickImage` / `handleTakePhoto` caught errors into `console.warn` and
returned. The user tapped, nothing happened, no explanation.

### S2-4 — Account-enumeration signal on the sign-in form
`app/(auth)/login.tsx` (via S2-1)

Passing Firebase messages through distinguished `auth/user-not-found` from
`auth/wrong-password`, letting anyone test whether an email has an account.

### S2-5 — Sensitive material reachable from logs
`providers/AuthProvider.tsx`, 123 `console.error` / `console.warn` sites

`console.error("Email login failed", error)` logs the whole `FirebaseError`.
Firebase attaches `customData` to auth errors, which can carry the attempted email
and, for credential flows, `_tokenResponse.idToken`. On Android these land in
logcat, readable by anything holding `READ_LOGS`. Request errors elsewhere carry
URLs with query strings.

No evidence was found of SMS bodies being logged — the SMS pipeline (`services/sms/*`,
`smsAiFallback.ts`) runs on-device and logs no message content. That part was clean.

### S3-1 — Retry policy retried failures that cannot succeed
`app/_layout.tsx`

The React Query default `retry: 1` applied to permission and auth failures, which
fail identically on retry. Mutations inherited query retry semantics.

### S3-2 — Unstructured, ungreppable error logs
Codebase-wide

123 ad-hoc `console.error` / `console.warn` calls, 23 of them bare
`console.error(err)` with no indication of which operation failed.

---

## 2. Fixes

Root causes were fixed. No error was suppressed: every site either surfaces a
usable message, exposes a retry, or rethrows.

### New modules

| File | Purpose |
|---|---|
| `lib/errors.ts` | `friendlyErrorMessage`, `classifyError`, `isNetworkError`, `isPermissionError`, `safeErrorDetails`, `logError`, `logWarning`. Maps 20 Firebase Auth codes and 15 Firestore status codes to plain language; refuses to return SDK-looking strings; redacts emails, tokens and querystrings before logging and drops Firebase `customData` entirely. |
| `lib/firestoreErrors.ts` | `LoadFailure` type, `toLoadFailure`, `snapshotErrorHandler` — one handler shape for all Firestore listeners, classifying failures as retryable or not. |
| `lib/globalErrorHandler.ts` | `installGlobalErrorHandlers()` — `ErrorUtils.setGlobalHandler` plus Hermes promise-rejection tracking (with a web `unhandledrejection` fallback). Fatal errors still reach the platform default handler. |
| `hooks/useLoadFailure.ts` | `{ error, setError, retry, attempt }`. `attempt` goes in the effect's dependency array so `retry()` genuinely re-establishes a dead listener. |
| `components/common/AppErrorBoundary.tsx` | Class boundary with a fallback that depends on no app provider (so it can paint even when the theme provider is what threw). Stack traces in development only. |

### Fixes by finding

- **S1-1** — `UserDocProvider` now exposes `error: LoadFailure | null` and no longer
  claims `exists: false` on a failed read. `SettingsProvider` returns early while
  `userDocError` is set, keeping the applied settings.
- **S1-2** — All 20 listener hooks plus `FinanceDataProvider` (8 listeners) now
  report failures through `snapshotErrorHandler` and expose `error` + `retry`.
  Success snapshots clear a stale error, so a self-healing reconnect drops the
  failure UI. `ErrorState` is now wired into the vaults screen, the ledger screen
  and the portfolio dashboard.
- **S1-3** — `AppErrorBoundary` wraps the provider tree and, separately, the
  navigator (so a screen crash keeps session and cached data alive). The
  expo-router `ErrorBoundary` export is replaced with one that routes into the
  same fallback.
- **S1-4** — `installGlobalErrorHandlers()` runs at module scope in `app/_layout.tsx`.
- **S1-5** — `useFonts`' error is honoured (`fontsSettled`), and a 10s
  `SPLASH_TIMEOUT_MS` ceiling shows the UI regardless, logging which gate stalled.
- **S1-6** — Permission request wrapped, cancellation-safe, falls back to denied;
  denied state now offers **Open Settings**.
- **S1-7** — Prefs load falls back to defaults on failure; all four native calls
  have `catch` blocks with user-facing messages.
- **S2-1** — `authErrorMessage` delegates to `friendlyErrorMessage`; all 14 raw
  sites converted.
- **S2-2** — `marketDataService` now throws typed `MarketDataError` on transport
  failure, non-2xx and malformed JSON; `null` means only "genuinely absent" (404 /
  no match). `useMarketQuotes` exposes `isError`, `failedCount`, `errorMessage` and
  `refetch`, and the portfolio dashboard shows a tappable "Live prices are
  unavailable — showing your last known values" banner instead of presenting
  fallback numbers as current.
- **S2-3** — Both handlers now toast a friendly message.
- **S2-4** — `auth/user-not-found`, `auth/wrong-password` and
  `auth/invalid-credential` all map to "Incorrect email or password." (asserted by
  test).
- **S2-5** — All 123 `console.error`/`console.warn` sites converted to
  `logError`/`logWarning` with stable `scope.action` identifiers. Only `lib/perf.ts`
  (`console.log`, perf instrumentation) remains.
- **S3-1** — Query retry skips permission/auth errors, allows 2 attempts otherwise
  with exponential backoff capped at 8s; mutations do not retry.
- **S3-2** — Addressed by S2-5's structured scopes.

---

## 3. Files changed

57 files. New: `lib/errors.ts`, `lib/errors.test.ts`, `lib/firestoreErrors.ts`,
`lib/firestoreErrors.test.ts`, `lib/globalErrorHandler.ts`, `hooks/useLoadFailure.ts`,
`components/common/AppErrorBoundary.tsx`, `services/marketDataService.test.ts`,
this document.

Modified — infrastructure: `app/_layout.tsx`, `lib/authHelpers.ts`,
`lib/privacySession.ts`, `providers/AuthProvider.tsx`, `providers/UserDocProvider.tsx`,
`providers/SettingsProvider.tsx`, `providers/SystemSettingsProvider.tsx`,
`providers/FinanceDataProvider.tsx`, `providers/SmsReceiverProvider.tsx`,
`providers/WorkspaceProvider.tsx`.

Modified — hooks (20): `useBorrowings`, `useCategories`, `useCategorizationRules`,
`useCategoryBudgets`, `useExpenses`, `useFinancialGoals`, `useFocusMode`,
`useGamification`, `useInvestments`, `useMarketQuotes`, `usePaymentRequests`,
`usePortfolio`, `useReceivables`, `useSips`, `useSmsPermission`, `useSpaces`,
`useSplits`, `useSubscriptions`, `useTrips`, `useVaultExpenses`, `useVaults`,
`useBiometrics`.

Modified — screens/components (23): `app/(app)/ledger.tsx`, `app/(app)/settings.tsx`,
`app/(app)/vaults.tsx`, `app/(auth)/login.tsx`, `app/(nutrition)/scanner.tsx`,
`ExpenseForm`, `ExpenseList`, `SideDrawer`, `AddAccountEntryModal`,
`EditAccountModal`, `PayCreditBillModal`, `TransferFundsModal`,
`ReceiptScannerModal`, `ExportDataModal`, `PaymentRequestCard`,
`CreateCreditCardBillModal`, `MarkBillPaidModal`, `SetupWizardModal`,
`ManageStockCashModal`, `PortfolioDashboard`, `SipPlanFormModal`,
`SplitDetailModal`.

Modified — services: `marketDataService.ts`, `openFoodFactsService.ts`.

---

## 4. Tests

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | pass (clean before and after) |
| `npx tsc -p tsconfig.shared.json` | pass |
| `npm test` (`vitest run`) | **596 passed / 86 files** (baseline 554 / 83) |
| ESLint | **not run — not configured in this repo** (see risks) |

42 new tests:

- `lib/errors.test.ts` (28) — code classification; asserts no Firebase string ever
  reaches a user message; asserts `user-not-found` and `wrong-password` produce
  identical copy; asserts `customData` (email, `idToken`) never appears in log
  output; asserts sensitive context keys and nested objects are redacted.
- `lib/firestoreErrors.test.ts` (6) — retryable classification; failure is reported
  to the caller rather than swallowed; log redaction.
- `services/marketDataService.test.ts` (7) — throws on transport failure, 5xx and
  malformed JSON; returns `null` only for 404 / no match; the request URL does not
  leak into the thrown message.
- `lib/authHelpers.test.ts` (+1) — regression guard for the raw-message pass-through.

---

## 5. Remaining risks

1. **ESLint is not set up in this repository.** No `.eslintrc*`/`eslint.config.*`,
   no `lint` script, no `eslint` dependency, and no lint step in
   `.github/workflows/`. There was nothing to run. Adding it means installing
   `eslint` + `eslint-config-expo` and their transitive tree — a dependency change
   outside this audit's scope, so it was not done. To enable it:
   ```bash
   npx expo lint
   ```
   Once configured, `react-hooks/exhaustive-deps` should be reviewed against the
   dependency arrays touched here.

2. **`ErrorState` is wired into 3 screens, not all of them.** The failure channel
   now exists on every hook, but only the vaults screen, the ledger screen and the
   portfolio dashboard render it. Remaining screens (insights, spaces, splits,
   trips, subscriptions, receivables, borrowings, credit-card bills, SMS inbox,
   nutrition) still show an empty state on load failure. The hook-side work is
   done — each is a small render-branch addition.

3. **No crash reporting backend.** `logError` writes to the console. Nothing is
   collected from real devices, so release-build crashes remain invisible. `logError`
   is a single chokepoint if Sentry/Crashlytics is added later.

4. **Boundary reset does not clear React Query cache.** `AppErrorBoundary`'s "Try
   again" remounts the subtree. If the crash was caused by malformed cached data,
   the remount can hit the same data. An explicit cache invalidation on reset would
   close this.

5. **Redaction is heuristic.** `logError` redacts by key name and by pattern
   (emails, JWT-shaped blobs, querystring values) and collapses nested objects to
   `"[object]"`. A sensitive value passed as a top-level string under an
   innocuous key would still be logged.

6. **`app/(nutrition)/*` and portions of the portfolio flow were reviewed but not
   hardened beyond the specific findings above** — they carry the same
   empty-vs-error ambiguity noted in risk 2.

7. **Untested at runtime.** All verification was static (`tsc`, unit tests). None of
   the new UI paths — error boundary fallback, splash timeout, retry buttons,
   stale-price banner — were exercised on a device or simulator. See the manual
   testing guide below.

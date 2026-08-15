# Phase 3 — Performance Audit & Optimization (2026-08-15)

Scope: performance-only audit and optimization of the existing app. No UI
redesign, no backend architecture changes, no security changes (none were
required — nothing found here rose to a critical security issue). Checked:
unnecessary re-renders, expensive components, `useEffect` problems,
incorrect dependency arrays, unnecessary state updates, FlatList/SectionList
performance, large transaction/ledger lists, unnecessary API requests,
duplicate API calls, excessive database queries, unnecessary
Firebase/Firestore listeners, expensive calculations, image loading, large
assets, navigation performance, startup performance, unnecessary global
state, excessive `useMemo`/`useCallback`, and memory-heavy components.

**Headline finding**: the areas the task called out for special attention —
the main ledger/transaction list ([components/ExpenseList.tsx](../../components/ExpenseList.tsx))
and the dashboard's aggregate calculations ([app/(app)/dashboard.tsx](../../app/(app)/dashboard.tsx)) —
were already well-optimized before this phase (see §2). The real,
measurable problems were elsewhere: duplicate Firestore listeners and
unthrottled background network polling, both described in §1.

---

## 1. Issues Found & Fixed

### 1.1 [FIXED] Duplicate Firestore listeners for borrowings/receivables on the Dashboard screen

**Where:** [app/(app)/dashboard.tsx](../../app/(app)/dashboard.tsx) (lines 111-112,
before this fix), [hooks/useUnifiedNetWorth.ts](../../hooks/useUnifiedNetWorth.ts),
[components/dashboard/InvestmentsWidget.tsx](../../components/dashboard/InvestmentsWidget.tsx).

**What the issue was:** `hooks/useBorrowings.ts` and `hooks/useReceivables.ts`
each independently opened their own `onSnapshot` real-time listeners against
`users/{uid}/borrowings`, `users/{uid}/borrowingRepayments`,
`users/{uid}/receivables`, and `users/{uid}/receivableRepayments` — unlike
`useAccounts`/`useExpenses`/`useIncomes`, which are thin wrappers reading
from the single shared listener already centralized in
[FinanceDataProvider](../../providers/FinanceDataProvider.tsx). On the
Dashboard screen alone: `DashboardScreen` called `useBorrowings()` and
`useReceivables()` directly (to compute `totalBalance`), **and** rendered
`<InvestmentsWidget />` (when investments are enabled), which calls
`useUnifiedNetWorth()`, which **also** calls `useBorrowings()` and
`useReceivables()` internally. That's two fully independent real-time
listeners for the same four collections, both active at the same time, on
the same screen render — not a hypothetical based on navigation-stack
persistence, but a plain duplicate call in one component tree.

**Why it matters / failure scenario:** Every one of those two independent
listener sets does its own Firestore round-trip, holds its own live
subscription, and re-runs its own React state updates on every change to
those collections — doubling Firestore reads/listener overhead for data
that's identical between the two copies, and doubling the work done on every
write to a borrowing or receivable while the Dashboard is open. This is
wasteful but was not going to visibly stutter the UI on its own (these are
typically small per-user collections); the value here is eliminating a clear
resource/read-quota waste, not fixing visible lag.

**Fix applied:** Added
[providers/BorrowingsReceivablesProvider.tsx](../../providers/BorrowingsReceivablesProvider.tsx),
which centralizes the four listeners (plus all the create/update/delete/
repayment mutations previously duplicated inside the two hook files) into
one provider, mounted once in
[app/(app)/_layout.tsx](../../app/(app)/_layout.tsx) alongside the existing
`FinanceDataProvider`. `hooks/useBorrowings.ts` and `hooks/useReceivables.ts`
are now thin context-reading wrappers — exactly the same pattern this
codebase already uses for `useAccounts`/`useAccountPayments`/
`useAccountEntries`/`useAccountTransfers` around `FinanceDataProvider`. Every
call site (`dashboard.tsx`, `AccountsList.tsx`, `accounts/[id].tsx`,
`BorrowingsList.tsx`, `ReceivablesList.tsx`, `SpaceDetailModal.tsx`,
`useUnifiedNetWorth.ts`) keeps working unchanged because the hooks' return
shape (fields and function names) was preserved exactly. The one place that
passed a per-call `{ enabled }` option
([components/spaces/SpaceDetailModal.tsx](../../components/spaces/SpaceDetailModal.tsx))
was updated to call the hook with no arguments, since the listener is now
always-on and shared — the same trade-off `useAccounts`/`useExpenses`
already made.

---

### 1.2 [FIXED] Market-quote polling kept running for screens that weren't visible

**Where:** [hooks/useMarketQuotes.ts](../../hooks/useMarketQuotes.ts).

**What the issue was:** `useMarketQuotes` polls every holding's live price
every 60 seconds via TanStack Query's `refetchInterval: 60_000`, with no
gate tied to whether the consuming screen was actually visible. It's called
from four places —
[components/portfolio/PortfolioDashboard.tsx](../../components/portfolio/PortfolioDashboard.tsx),
[components/portfolio/HoldingsList.tsx](../../components/portfolio/HoldingsList.tsx),
[components/sip/SipDashboard.tsx](../../components/sip/SipDashboard.tsx), and
[hooks/useUnifiedNetWorth.ts](../../hooks/useUnifiedNetWorth.ts) (used by both
`InvestmentsWidget` on the Dashboard and `AccountsList` in the Ledger). Since
expo-router's `Stack` navigator keeps previously-visited screens mounted in
the stack for back-navigation (standard native-stack behavior), any of these
components stays alive — and their query keeps polling — after the user has
navigated to a completely different screen. For a user with many portfolio
holdings, that's N parallel network requests fired every 60 seconds,
indefinitely, for as long as the app is open, regardless of what screen is
actually on-screen.

**Why it matters / failure scenario:** Continuous background network polling
after the user has moved on wastes battery and mobile data, and adds load to
the market-data endpoint for a screen nobody is looking at. This is a
correctness gap in how the hook was written (it never checked visibility) —
not a hypothetical edge case, since expo-router's default Stack behavior of
keeping prior screens mounted is the normal case, not an exception.

**Fix applied:** Added a `useIsFocused()` check (re-exported by expo-router
itself, no new dependency needed) and passed `enabled: isFocused` plus
`refetchInterval: isFocused ? 60_000 : false` into each query. Polling now
pauses the moment its screen loses focus and resumes automatically when the
user comes back — the last fetched quotes stay cached and displayed
meanwhile (no blank/loading flash), matching TanStack Query's normal
disabled-query behavior.

---

## 2. Areas Reviewed and Found Already Well-Optimized (No Changes Made)

Per the instruction not to memoize blindly and to fix only measurable,
identifiable problems, these areas were reviewed in depth and left
untouched because they were already handled correctly:

- **[components/ExpenseList.tsx](../../components/ExpenseList.tsx)** — the
  main ledger/transaction list, exactly the kind of screen this task said to
  pay special attention to. Already uses `@shopify/flash-list` (not a plain
  `ScrollView`/`.map()`), a stable `keyExtractor` built from the Firestore
  document id (not an array index), `getItemType` set for mixed header/row
  recycling, and every derived value (`combinedTransactions`, `totals`,
  `groupedByDay`, `sections`, `listData`, `stickyHeaderIndices`,
  `renderTxRow`, `renderListItem`) wrapped in `useMemo`/`useCallback` with
  correct, minimal dependency arrays.
- **[providers/FinanceDataProvider.tsx](../../providers/FinanceDataProvider.tsx)** —
  the expenses listener is deliberately staged: an initial `limit(200)`
  listener for first paint, upgraded to the full unbounded history only
  after the app is idle (`scheduleIdleWork`, ~1.2-2.8s deferred). This is
  already the right pattern for the single largest, fastest-growing
  collection in the app, and every context value is memoized and split into
  three separate contexts (Expenses/Incomes/Accounts) so unrelated consumers
  don't re-render on each other's changes.
- **[app/(app)/dashboard.tsx](../../app/(app)/dashboard.tsx)** — every
  aggregate (`monthlyExpenses`, `totalBalance`, `activeCategoryBudgets`,
  `loggingStreak`, `budgetHealthScore`, etc.) is already wrapped in
  `useMemo` with correct dependencies; below-the-fold widgets are already
  staggered in via `LazyMount` instead of all mounting at once.
- **[app/_layout.tsx](../../app/_layout.tsx)** startup path — already
  separates the splash-screen-blocking critical path (auth, fonts, local
  stores, navigation readiness) from non-blocking background loads
  (settings, user doc), with `perfMark` instrumentation already in place to
  measure it.
- **[components/analytics/YearlyAnalyticsView.tsx](../../components/analytics/YearlyAnalyticsView.tsx)** —
  every yearly aggregate/chart computation is already memoized.
- Provider tree context values ([FinanceDataProvider](../../providers/FinanceDataProvider.tsx),
  [UserDocProvider](../../providers/UserDocProvider.tsx),
  [LedgerStateProvider](../../providers/LedgerStateProvider.tsx)) were
  checked for the "fresh object literal on every render" anti-pattern — none
  were found; all use `useMemo` correctly.
- **[components/ai/ReceiptScannerModal.tsx](../../components/ai/ReceiptScannerModal.tsx)** —
  the only `Image`-rendering component found outside `expo-image`. It
  already requests images at `quality: 0.8` with `allowsEditing: true` from
  the picker, which is a reasonable existing mitigation; not changed.

## 3. Files Changed

| File | Change |
|---|---|
| [providers/BorrowingsReceivablesProvider.tsx](../../providers/BorrowingsReceivablesProvider.tsx) | **New.** Centralizes borrowings + receivables listeners and mutations, one listener each app-wide |
| [hooks/useBorrowings.ts](../../hooks/useBorrowings.ts) | Rewritten as a thin reader of the new provider's context (same public API) |
| [hooks/useReceivables.ts](../../hooks/useReceivables.ts) | Rewritten as a thin reader of the new provider's context (same public API) |
| [app/(app)/_layout.tsx](../../app/(app)/_layout.tsx) | Mounted `BorrowingsReceivablesProvider` alongside `FinanceDataProvider` |
| [components/spaces/SpaceDetailModal.tsx](../../components/spaces/SpaceDetailModal.tsx) | Dropped the now-meaningless `{ enabled }` option on `useReceivables()` |
| [hooks/useMarketQuotes.ts](../../hooks/useMarketQuotes.ts) | Added `useIsFocused()` gating so polling pauses when its screen isn't visible |

No other files were touched. No UI was redesigned, no unrelated code was
refactored, and no memoization was added anywhere beyond these two fixes.

*(Files listed in other phases' still-open items — e.g. Phase 2's Firestore
rules, PIN hashing, `allowBackup` — are unrelated prior-phase changes still
present in the working tree and are not part of this phase's diff.)*

## 4. Tests / Checks Performed

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -p tsconfig.json --noEmit` | **Passed.** No type errors — confirms the provider/hook rewrite preserved every consumer's expected shape. |
| ESLint | *(still not configured — see [Phase 1](PHASE_1_ARCHITECTURE_AUDIT.md)/[Phase 2](PHASE_2_SECURITY_AUDIT.md))* | **Not run — nothing configured.** |
| Full test suite | `npx vitest run` | **Passed.** 84 test files, 560 tests — unchanged from Phase 2's count, since none of the touched hooks/providers/components have existing unit test coverage (consistent with the no-UI-test-coverage gap logged in Phase 1). |

## 5. Remaining Performance Concerns (Not Fixed, Logged for a Future Phase)

- **The same duplicate-listener pattern likely exists for investments and
  portfolio data.** `hooks/useInvestments.ts` and `hooks/usePortfolio.ts`
  follow the same per-hook-listener pattern `useBorrowings`/`useReceivables`
  used to, and `useUnifiedNetWorth` calls both of them too — so a user who
  visits Dashboard (mounting `InvestmentsWidget` → `useUnifiedNetWorth`) and
  then Ledger's Portfolio/SIP tabs (mounting `PortfolioDashboard`/
  `HoldingsList`/`SipDashboard`, each calling `usePortfolio`/`useInvestments`
  directly) without the Dashboard screen unmounting will end up with
  duplicate listeners for those collections too. The same
  `BorrowingsReceivablesProvider`-style consolidation would fix it. Not done
  in this phase to keep the change contained and independently verifiable.
- **Most non-ledger "list" screens are unvirtualized.** `AccountsList`,
  `BorrowingsList`, `ReceivablesList`, `SpacesList`, `SplitsList`,
  `SubscriptionsList`, `TripsList`, and `CollectList` all render via
  `.map()` inside a scroll view rather than `FlatList`/`FlashList`. This
  wasn't fixed because these collections are naturally small and
  self-limiting per user (accounts, borrowings, subscriptions, trips are
  realistically tens of items, not the thousands a transaction ledger can
  reach) — virtualizing them would be memoization/complexity added without
  a measurable problem behind it, which the task explicitly asked not to do.
  Worth revisiting only if real usage shows these lists growing large for
  some users.
- **Most hooks besides `expenses` fetch their entire collection unbounded**
  (no `limit()`, no date-range scoping) — `useSpaces`, `useSplits`,
  `useSubscriptions`, `useTrips`, `useVaults`, `useCategories`,
  `useCategorizationRules`, `useCategoryBudgets`, `useFinancialGoals`,
  `useFocusMode`, `useGamification`, `usePaymentRequests`, `useAppUpdate`,
  `useNutrition`, `useSips`, and (per §above) `useInvestments`/`usePortfolio`.
  `expenses` already got the staged/paginated treatment specifically because
  it's the one collection that can genuinely grow into the thousands for a
  long-time user; the others are naturally bounded by real-world usage. Not
  changed, but worth monitoring if any of these collections turn out to grow
  unexpectedly large for some users.
- **expo-router's `Stack` keeps prior screens mounted in the navigation
  stack** (standard native-stack behavior, not a bug introduced by this
  app) — this is the underlying reason background polling/listeners can
  outlive the screen that started them. The market-quote fix in §1.2
  addresses the concrete, confirmed instance of this; other screens with
  their own timers/effects could have the same latent issue and weren't
  individually audited for it in this pass.

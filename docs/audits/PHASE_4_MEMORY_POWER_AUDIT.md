# Phase 4 — Memory Management & Battery/Power Efficiency Audit (2026-08-15)

Scope: memory management and battery/power efficiency only. No UI redesign,
no unrelated refactoring. Inspected: `setInterval`, `setTimeout`, event
listeners, Firebase listeners, Supabase subscriptions (none in this app —
Firebase only), WebSockets (none used), notification listeners, navigation
listeners, background tasks, polling, location services (none used —
no `expo-location`/`expo-task-manager`/`expo-background-fetch` dependency),
animations, timers, and background network requests, with particular
attention to `useEffect` cleanup correctness.

---

## 1. Issues Found & Fixed

### 1.1 [FIXED] `CelebrationOverlay`'s background glow animation kept looping forever after being dismissed

**Where:** [components/common/CelebrationOverlay.tsx](../../components/common/CelebrationOverlay.tsx).

**What the issue was:** `CelebrationOverlay` is rendered once, permanently, at
the app root (`app/_layout.tsx`) — it never unmounts for the life of the
app session. When a celebration fires, its effect starts an **infinite**
Reanimated repeat animation for the background glow:
`withRepeat(withSequence(...), -1, true)`. Nothing ever called
`cancelAnimation()` or reset the shared value when the celebration was
dismissed (`currentCelebration` going back to `null`) — the effect only had
an `if (currentCelebration)` branch, no `else`. Reanimated's `withRepeat(-1)`
runs on the UI thread independently of whether the surrounding component's
render output is currently visible; since the component that owns the
shared value never unmounts, the animation had no way to stop itself.

**Why it matters / failure scenario:** The very first time a user earns any
celebration-triggering achievement (a streak milestone, a goal reached,
etc.), a UI-thread animation starts ticking every ~900ms and **never stops
for the rest of that app session** — including while the user is on
completely unrelated screens, with the app backgrounded to the home screen
switcher, or with the phone's screen off. This is a direct, continuous,
avoidable battery drain from an animation nobody can see, running for
however long the app process stays alive after that first celebration.

**Fix applied:** Added an `else` branch that calls `cancelAnimation(glowPulse)`
and resets `glowPulse.value = 1` when there's no active celebration, plus a
separate cleanup effect that calls `cancelAnimation(glowPulse)` if the
overlay itself ever unmounts, as a safety net. The visible celebration
animation (shown while a celebration is active) is completely unchanged.

---

### 1.2 [FIXED] `AiAdvisorView` could update state after being unmounted mid-response

**Where:** [components/ai/AiAdvisorView.tsx](../../components/ai/AiAdvisorView.tsx),
consumed conditionally in [app/(app)/insights.tsx](../../app/(app)/insights.tsx)
(`{activeTab === "advisor" && <AiAdvisorView />}`).

**What the issue was:** Two effects had no unmount guard:
1. The chat-history load effect called `AsyncStorage.getItem(storageKey).then(...)`
   and called `setMessages` in the callback with no check for whether the
   component was still mounted.
2. `handleSendMessage` scheduled a bare `setTimeout(async () => {...}, 650)`
   simulating a "thinking" delay, which calls `setIsTyping`/`saveHistory`
   (itself calling `setMessages`) when it fires — again with no unmount
   guard and no reference kept to cancel it.

Because `AiAdvisorView` is rendered with a `&&` conditional inside the
Insights screen's tab switcher, switching away from the "Advisor" tab
**actually unmounts** this component (unlike, say, a `Modal` whose children
stay mounted with `visible=false`). A user who sends a message and switches
tabs before the ~650ms simulated reply arrives would trigger state updates
on an already-unmounted component.

**Why it matters / failure scenario:** Calling `setState` after unmount
doesn't corrupt anything in modern React, but it does real work for
nothing — resolving a promise chain, running `generateAdvisorResponse`,
writing to `AsyncStorage` — for a screen the user has already left, and logs
a React warning. Switching tabs quickly after sending a message is a
completely ordinary interaction, not an edge case.

**Fix applied:** Added a `cancelled` flag to the chat-history-load effect
(matching the pattern already used elsewhere in this codebase, e.g.
`SmsReceiverProvider`), and a `typingTimerRef` that stores the pending
`setTimeout` id so it can be cleared in a dedicated unmount-cleanup effect.
The user-visible chat behavior is unchanged.

---

### 1.3 [FIXED] `CreditCardBillsProvider`'s debounced reconcile timer wasn't cleared on unmount

**Where:** [providers/CreditCardBillsProvider.tsx](../../providers/CreditCardBillsProvider.tsx).

**What the issue was:** `scheduleReconcile()` debounces bill-reminder
reconciliation with a 400ms `setTimeout`, correctly clearing any
**previously** pending timer before scheduling a new one (so rapid
successive calls don't pile up). However, nothing cleared the **last**
scheduled timer if the provider itself unmounted (e.g. on logout) while that
400ms window was still pending.

**Why it matters / failure scenario:** Logging out unmounts
`CreditCardBillsProvider` (it's inside the authenticated `(app)` layout).
If a reconcile was scheduled in the 400ms before logout, it fires afterward
using stale `accounts`/`bills`/`globalPrefs` closures captured from the
now-logged-out session, doing a wasted (and potentially confusing) round of
Firestore/notification-scheduling work for a session that no longer exists.

**Fix applied:** Added a cleanup effect that calls
`clearTimeout(reconcileTimer.current)` on unmount. No behavior change for
the normal (still-mounted) case.

---

## 2. Areas Reviewed and Found Already Clean (No Changes Made)

- **All Firebase `onSnapshot` listeners app-wide** (`FinanceDataProvider`,
  the Phase 3-added `BorrowingsReceivablesProvider`, `useSpaces`, `useSplits`,
  `useSubscriptions`, `useTrips`, `useVaults`, `useVaultExpenses`,
  `useCategories`, `useCategorizationRules`, `useCategoryBudgets`,
  `useFinancialGoals`, `useFocusMode`, `useGamification`, `useInvestments`,
  `usePortfolio`, `usePaymentRequests`, `useAppUpdate`, `useNutrition`,
  `useSips`, `UserDocProvider`, `SystemSettingsProvider`) — every one returns
  its unsubscribe function (or an explicit cleanup calling it) from its
  effect. Spot-checked several directly in this phase in addition to the
  broader sweep already done in Phase 3.
- **`AppState.addEventListener` usage** (`PrivacyLock`, `NetworkProvider`,
  `SmsReceiverProvider`, `CreditCardBillsProvider`, `useSmsPermission`) —
  every subscription is removed via `sub.remove()` in its effect's cleanup.
- **`BackHandler.addEventListener`** (`useAndroidBackHandler`) — removed
  correctly on cleanup.
- **`Keyboard.addListener`** (`BottomNav`) — both show/hide listeners
  removed correctly on cleanup.
- **The native SMS `BroadcastReceiver` event listener**
  (`services/sms/smsListener.android.ts`'s `addSmsReceivedListener`, backed
  by the custom `modules/sms-reader` native module) — returns a proper
  `EventSubscription`, and `SmsReceiverProvider` calls `.remove()` on
  cleanup. The receiver is also explicitly stopped
  (`stopSmsListening()`) in a dedicated unmount effect.
- **Notification response listener** (`Notifications.addNotificationResponseReceivedListener`
  in `SmsReceiverProvider`) — removed on cleanup, with a `cancelled` guard
  around the dynamic `import()` so a late-resolving import can't attach a
  listener after the effect has already been cleaned up.
- **`setInterval` usage** (`app/_layout.tsx`'s navigation-readiness poll,
  `PrivacyLock`'s lockout countdown) — both already call `clearInterval` in
  their effect cleanup; both are also naturally self-terminating (the
  first stops once navigation is ready, the second once the countdown
  reaches zero).
- **Other `setTimeout` usage reviewed** (`SplashAnimationOverlay`,
  `OfflineBanner`, `LazyMount`, `SideDrawer`, `InstitutionSearchField`,
  `ExpenseList`'s refresh/edit-after-close delays) — all either already
  clear their timer on unmount or are single-shot, sub-second UI delays on
  components that don't unmount mid-timer in normal use (e.g.
  `ReceiptScannerModal`'s simulated-OCR delay lives inside a persistent RN
  `Modal` whose children stay mounted regardless of `visible`, so there's no
  unmount to race).
- **Looping animations elsewhere** (`Skeleton`'s shimmer, `EmptyStateIllustration`'s
  float) — both live on components that are only rendered while relevant
  (loading / empty state) and unmount normally when that state ends, which
  stops their Reanimated loop along with them. Unlike `CelebrationOverlay`,
  neither is a permanently-mounted root component, so there's no equivalent
  leak.
- **No location services, WebSockets, or Supabase usage** exist in this
  codebase at all (Firebase Firestore/Auth only), so those categories had
  nothing to audit.
- **Background network polling**: the only interval-based polling in the
  app is `useMarketQuotes`'s 60s refetch, already fixed for focus-awareness
  in [Phase 3](PHASE_3_PERFORMANCE_AUDIT.md). No other polling loops were
  found.

## 3. Files Changed

| File | Change |
|---|---|
| [components/common/CelebrationOverlay.tsx](../../components/common/CelebrationOverlay.tsx) | Cancel the infinite glow-pulse animation when a celebration is dismissed, plus an unmount safety net |
| [components/ai/AiAdvisorView.tsx](../../components/ai/AiAdvisorView.tsx) | Guard the chat-history load effect against late resolution after unmount; track and clear the simulated-response timer on unmount |
| [providers/CreditCardBillsProvider.tsx](../../providers/CreditCardBillsProvider.tsx) | Clear the debounced reconcile timer on unmount |

No other files were touched. No UI was redesigned and no unrelated
refactoring was done.

## 4. Verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -p tsconfig.json --noEmit` | **Passed.** No type errors. |
| ESLint | *(still not configured — see [Phase 1](PHASE_1_ARCHITECTURE_AUDIT.md))* | **Not run — nothing configured.** |
| Full test suite | `npx vitest run` | **Passed.** 84 test files, 560 tests — unchanged, since none of the touched components have existing unit test coverage (consistent with the no-UI-test-coverage gap logged in Phase 1). |

## 5. Remaining Concerns

- **No automated way to verify a Reanimated animation actually stops** —
  this fix was verified by code inspection (the `cancelAnimation` call is
  correctly placed and reachable), not by profiling a running device. A
  future phase with device access should confirm via the Reanimated/Flipper
  UI-thread profiler that no stray animation frames continue after
  dismissing a celebration.
- **`ReceiptScannerModal`'s simulated-OCR `setTimeout`** is not cancelled if
  the modal is closed mid-"processing" and reopened before the 1.2s delay
  elapses — left as-is since the component doesn't unmount (RN `Modal`
  keeps children mounted regardless of `visible`) and the window is small
  (1.2s, single-shot, no accumulation), but a stale in-flight timer could in
  principle overwrite state from a second, newer capture if both are
  in-flight at once. Not fixed here since it's a correctness nit-pick more
  than a memory/battery cost.
- **No component/hook test coverage exists** for any of the three fixed
  files (a standing gap logged in Phase 1), so these fixes are verified by
  code review and the type checker, not by an automated regression test.

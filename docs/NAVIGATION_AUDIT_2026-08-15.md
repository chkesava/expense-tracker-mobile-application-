# Navigation Audit — 2026-08-15

**Scope:** navigation only — auth redirects, protected routes, back stack,
Android hardware back, deep links, notification routing, session/route
restoration, navigation loops, screen recreation. No feature work, no styling,
no changes to unrelated functionality.

**Branch:** `claude/network-offline-audit-7a0792` (phase 2 on this branch)
**Verification:** `npm run typecheck` ✅ · `npm run typecheck:shared` ✅ ·
`npm test` — 86 files / 589 tests ✅ (27 new navigation tests) · ESLint —
**still not configured in this repo** (see the network audit, P3-01).

Expo Router semantics were checked against the pinned docs
(`https://docs.expo.dev/versions/v57.0.0/`) before changing any navigation call;
`router.dismissTo` — *"Dismisses screens until the provided href is reached. If
the href is not found, it will instead replace the current screen"* — is the
primitive most of these fixes needed and is available in this version.

---

## Route map as found

```
app/_layout.tsx           Stack: index · onboarding · (auth) · (app) · (nutrition) · google-auth · +not-found
 ├── index.tsx            launch router → (nutrition) | (app) | /onboarding | /(auth)/login
 ├── (auth)/_layout       bare Stack (login redirects to /(app) when signed in)
 ├── (app)/_layout        GUARDED: !user → /(auth)/login; maintenance; PrivacyLock; data providers
 │    └── index.tsx       → /ledger | /insights | /dashboard  (per settings.defaultView)
 └── (nutrition)/_layout  Tabs — NO auth guard  (N-P1-04)
```

Navigation is issued from ~30 call sites: `BottomNav`, `SideDrawer`,
`MobileActionDock`, widgets, `SetupProgressProvider`, `SmsReceiverProvider`
(notifications), `useAndroidBackHandler`, and `useNavigationStateRestoration`.

---

## Findings

Severity: **P0** traps the user or breaks a core flow · **P1** materially wrong
routing · **P2** wasteful · **P3** hygiene.

### N-P0-01 — The nutrition workspace was a one-way trap

**File:** `app/(nutrition)/_layout.tsx`

**What it is.** The tab bar's **Exit** button ran `router.replace('/')`. `/` is
the launch router, which reads the *persisted* workspace (`@active_workspace`)
and redirects accordingly. The workspace is only changed by
`setActiveWorkspace`, which Exit never called — so the workspace was still
`"nutrition"` and the launch router sent the user straight back to
`/(nutrition)`.

**Why it matters.** This is a closed loop with no other exit. The expense
workspace is reachable only through `/app-selector`, which lives inside the
`(app)` group — unreachable from nutrition. Force-quitting does not help either:
the next cold start reads the same persisted workspace and re-enters nutrition.

**Failure scenario.** A user taps "Nutrition & Macro Tracker" once in the app
selector. The workspace is persisted. They look around, press **Exit** — the
screen flickers and they are still in nutrition. They kill the app and reopen
it: nutrition again. **They have permanently lost access to the expense
tracker**, including every account, ledger and bill in it, with no in-app path
back. Only clearing app data recovers it.

**Fix.** Exit now calls `setActiveWorkspace('expense')`, which persists the
switch and routes to `/(app)` — the same path the app selector uses.

### N-P0-02 — Route restoration overrode deep links, notifications and the user's default view

**Files:** `hooks/useNavigationStateRestoration.ts`, `app/(app)/_layout.tsx`

**What it is.** On every mount of the app shell the hook read a saved route from
AsyncStorage and called `router.replace(savedRoute)` — without checking where
the user actually was, whether the app had been opened by a link, or which user
was signed in. Three distinct defects in one hook:

1. **No current-route check.** It replaced the current screen unconditionally,
   whatever the app had just decided to show.
2. **No per-user scoping.** One global key `@vault_last_active_route`, never
   cleared on sign-out.
3. **A read/write race.** The save effect and the restore effect both fire on
   mount; the save (`/dashboard`) could land before the read, clobbering the
   route it was about to restore.

**Failure scenarios.**
- *Notification.* A bill reminder fires. The user taps it; the app opens and
  routes to `/credit-card-bills/abc`. A beat later the restore effect resolves
  and replaces it with `/settings`, where they were yesterday. The notification
  appears to open the wrong screen, and the bill they were told about is gone
  from the stack — `replace`, so there is nothing to go back to.
- *Shared device.* User A was last on `/accounts/xyz`. They sign out; user B
  signs in and is dropped on **user A's account detail route** — a document id
  that does not exist under B's uid, so it renders as an error/empty state.
- *Settings.* A user who set `defaultView: "expenses"` is bounced off `/ledger`
  to whatever they visited last, making the setting look broken.

**Fix.** The decision is now a pure function, `shouldRestoreRoute`, in
`shared/config/routeRestoration.ts` (15 tests): restoration is skipped when
`Linking.getInitialURL()` shows the app was opened by a link, when the current
route is not one of the launch-landing routes, and when the saved route is not
in the restorable set. The storage key is scoped per uid
(`lastRouteStorageKey`), the restore runs once per signed-in user, and
`AuthProvider.logout` clears the departing user's key.

### N-P1-03 — Notification taps that cold-start the app were dropped

**File:** `providers/SmsReceiverProvider.tsx`

**What it is.** Notification routing used only
`addNotificationResponseReceivedListener`. Per the v57 docs, that listener
*"does NOT fire for responses that arrived before registration or during cold
start"* — and this listener is registered deep inside the authenticated shell,
behind a dynamic `import("expo-notifications")`, so on a cold start it attaches
long after the launch response was delivered.

**Failure scenario.** The app is not running. An SMS-detected transaction
notification arrives; the user taps it expecting the review inbox. The app cold
starts to the dashboard and nothing else happens — the tap is silently
discarded. It only ever worked when the app was already running.

**Fix.** After attaching the listener the provider now also reads
`getLastNotificationResponseAsync()` and routes from it. Because that call keeps
returning the launch tap for the whole process lifetime, handled notification
ids are tracked in a module-level set so a provider remount (sign-out/in,
privacy lock) cannot replay the navigation.

### N-P1-04 — The nutrition workspace had no auth guard

**File:** `app/(nutrition)/_layout.tsx`

**What it is.** `(app)/_layout` redirects to login when there is no user;
`(nutrition)/_layout` was a bare `Tabs` with no check. The launch router guards
`/`, but it is not the only way in.

**Failure scenario.** A signed-out user opens `expensetrackermobile:///nutrition`
(a deep link, or a stale task in the recents switcher). The whole nutrition
shell renders with no session: tabs, profile screen, and food-log UI whose
writes silently no-op because every hook bails on `!user`. The user logs a meal
and it vanishes, with no prompt to sign in.

**Fix.** The layout now mirrors `(app)`: spinner while auth resolves, then
`<Redirect href="/(auth)/login" />` when there is no user.

### N-P1-05 — `router.push("/dashboard")` stacked duplicate Dashboards

**Files:** `components/ExpenseList.tsx` (×2), `components/analytics/MonthlyAnalyticsView.tsx`,
`components/analytics/YearlyAnalyticsView.tsx`, `providers/SetupProgressProvider.tsx`,
`app/(app)/settings.tsx`

**What it is.** Six "go to dashboard" actions used `push`, which appends a new
screen rather than returning to the existing one.

**Why it matters.** Dashboard is the heaviest screen in the app — a dozen
widgets over the full expense/income/account set. A second instance means a
second full mount, and the back button then walks through stale copies instead
of leaving.

**Failure scenario.** From the dashboard the user opens Insights, hits the empty
state, taps "Go to Dashboard" (push → second dashboard), taps a widget back into
Insights, taps the empty state again… The stack is now
`[dashboard, insights, dashboard, insights, dashboard]`. Pressing back replays
that history screen by screen — it looks like the app is stuck in a loop — and
every dashboard copy stays mounted.

**Fix.** All six now use `router.dismissTo("/dashboard")`, which pops back to the
existing dashboard, or replaces the current screen if there is not one.

### N-P1-06 — Android back grew the stack instead of returning home

**Files:** `hooks/useAndroidBackHandler.ts`, `shared/config/navigation.ts`

**What it is.** Back from a secondary tab ran `router.replace("/dashboard")`.
`replace` swaps the *current* entry, so with `[dashboard, ledger]` the result is
`[dashboard, dashboard]` — the original dashboard is still underneath. Repeating
tab → back cycles grows the stack with dashboard copies indefinitely.

Two related defects in the same handler: `/add` and `/credit-card-bills/[id]`
matched no rule and fell through to `return false`, so a bill detail opened
directly from a notification exited the app on back; and the
`cleanPath.startsWith("/(nutrition)/")` branch was dead code — Expo Router
strips group segments from `usePathname()`, and the hook is only mounted inside
`(app)` anyway.

**Failure scenario.** Ten minutes of ordinary tab-hopping (Home → Transactions →
back → Home → Insights → back …) leaves a dozen mounted Dashboard instances,
each holding widget state and re-rendering on every Firestore snapshot. Memory
climbs and the list screens get janky, with nothing in the UI to explain it.

**Fix.** The route → action decision moved to `resolveAndroidBackAction` in
`shared/config/navigation.ts` (12 tests), and the handler now uses
`router.dismissTo(HOME_ROUTE)` for the "return home" case. `/add` and
`/credit-card-bills/[id]` are classified as sub-screens (pop, falling back to
home when the stack is empty), and the dead nutrition branch is gone.

### N-P2-07 — Drawer navigation pushed top-level sections

**File:** `components/SideDrawer.tsx`

**What it is.** Every drawer destination used `push`, including the same
top-level sections `BottomNav` reaches with `navigate`. Opening Transactions
from the drawer while already on Transactions pushed a second copy.

**Fix.** The drawer now matches `BottomNav`: `dismissTo` for `/dashboard`,
`navigate` for everything else.

### N-P2-08 — `shared/config/linking.ts` was dead, and wrong

**File:** `shared/config/linking.ts` (deleted)

**What it is.** An exported `linkingConfig` — prefixes plus a hand-written screen
map — imported by nothing. Expo Router derives linking from the filesystem and
owns the navigation container, so this object never took effect. It had also
drifted: no `sms-inbox`, no `credit-card-bills/[id]`, no `onboarding`.

**Why it matters.** A stale config that looks authoritative is a trap — the next
person debugging a deep link edits this file, sees no change, and concludes deep
linking is broken at a lower level.

**Fix.** Deleted. Deep links come from `scheme: "expensetrackermobile"` in
`app.json` plus the route files, both of which are correct.

---

## Behaviour verified against the requested checks

| Check | Before | After |
| --- | --- | --- |
| Authentication redirects | `(app)` guarded; `(nutrition)` unguarded | Both guarded, same spinner-then-redirect shape |
| Protected routes | Nutrition shell renderable signed out | Redirects to login |
| Login → dashboard | Worked (`login` → `/(app)` → `/(app)/index` → `defaultView`) | Unchanged, no longer overridden by restoration |
| Logout behaviour | Session cleared, saved route left behind | Saved route cleared for the departing uid |
| Nested navigation | `(app)` stack + `(nutrition)` tabs | Unchanged |
| Back stack | Grew duplicate Dashboards via `push`/`replace` | `dismissTo` reuses the existing screen |
| Android hardware back | Stack growth; `/add` & bill detail could exit the app | Decision table under test; deep-linked sub-screens fall back home |
| Deep links | Worked, but restoration could override the target | Restoration stands down when a link opened the app |
| Notification → screen | Dropped entirely on cold start | Cold-start response collected and routed, once |
| App restart | Re-entered a trapped nutrition workspace | Exit persists the workspace switch |
| Session restoration | Global key, cross-user leak, hijacked links | Per-uid, link-aware, landing-route-gated |
| Navigation loops | Nutrition exit loop; dashboard push loops | Both removed |
| Unnecessary screen recreation | Every "home" action remounted Dashboard | Existing instance reused |

---

## Affected screens & files

**New**
- `shared/config/routeRestoration.ts` + `.test.ts` (15 tests)

**Deleted**
- `shared/config/linking.ts` (dead config)

**Modified**
- `app/(app)/_layout.tsx` — pass the signed-in uid to restoration
- `app/(nutrition)/_layout.tsx` — auth guard; Exit switches workspace
- `hooks/useNavigationStateRestoration.ts` — rewritten
- `hooks/useAndroidBackHandler.ts` — decision table, `dismissTo`
- `shared/config/navigation.ts` + `.test.ts` — `resolveAndroidBackAction`, `HOME_ROUTE` (12 tests)
- `providers/AuthProvider.tsx` — clear the saved route on logout
- `providers/SmsReceiverProvider.tsx` — cold-start notification response
- `providers/SetupProgressProvider.tsx`, `components/ExpenseList.tsx`,
  `components/analytics/MonthlyAnalyticsView.tsx`,
  `components/analytics/YearlyAnalyticsView.tsx`, `app/(app)/settings.tsx` — `dismissTo`
- `components/BottomNav.tsx`, `components/SideDrawer.tsx` — stop stacking home

Screens whose behaviour changes: Dashboard, Transactions/Ledger, Insights,
Vaults, Settings, SMS Inbox, Account detail, Credit card bill detail, App
selector, and the whole Nutrition workspace.

---

## Tests performed

**Automated — 27 new, 589 total passing**
- `shared/config/routeRestoration.test.ts` (15): per-user key isolation, group
  segment stripping, auth/onboarding routes never persisted, restorable set,
  and the five `shouldRestoreRoute` rules — including the two regression cases
  that matter most, "never overrides a deep link" and "stands down once the user
  is already somewhere specific".
- `shared/config/navigation.test.ts` (12 added): the full back-action table —
  exit on home, pop from sub-screens, **pop from `/add` and
  `/credit-card-bills/[id]`** (the fall-through that could exit the app), home
  from secondary tabs including `?tab=` query variants, and `default` for
  unknown routes.

**Static** — `npm run typecheck`, `npm run typecheck:shared`, and a repo-wide
sweep for `router.push`/`replace`/`navigate`/`Redirect`/`BackHandler` call sites
to confirm none were missed.

**Not run — ESLint.** No config, no dependency, not in CI.

**Not automated.** The stack-shape fixes (`dismissTo`, cold-start notifications,
the nutrition trap) need a device; there is no navigation test harness in this
repo. The manual guide below covers them.

---

## Remaining concerns

1. **No navigation integration tests.** Vitest here is `node`-environment only
   and covers `shared/`, `services/`, `lib/` — no renderer, no navigator. The
   decision logic is now pure and tested, but nothing verifies real stack shape.
   A React Native Testing Library setup with a mocked router would let the
   duplicate-Dashboard regression be caught automatically.

2. **Android App Links are not configured.** `app.json` has `scheme` but no
   `intentFilters`, and no iOS `associatedDomains` — so the
   `https://vault.kesava.dev` prefix the deleted config advertised never opened
   the app. Custom-scheme links work; verified web links do not. Fixing this
   needs `assetlinks.json` on the domain and a release build to verify, so it is
   deliberately out of this pass.

3. **`@active_workspace` is not cleared on logout.** After the N-P0-01 fix the
   workspace is escapable, but signing in as a different user still lands in the
   previous user's workspace. It is a preference rather than data, so I left it;
   clearing it alongside the saved route in `logout` would be consistent.

4. **`SmsReceiverProvider` owns notification routing, but lives inside the
   authenticated shell.** A notification tapped while signed out is discarded
   rather than deferred until after login. Handling it properly means hoisting
   the response handler to the root layout and replaying it once a session
   exists.

5. **The `defaultView` setting and route restoration overlap.** Both decide the
   first screen. The rule now is "restoration wins on a landing route, otherwise
   stand down", which is coherent but undocumented in the Settings UI — a user
   who sets a default view may still be resumed elsewhere.

6. **`(auth)` has no reverse guard of its own.** `login.tsx` redirects when a
   user exists, but the layout does not, so a new screen added to that group
   would be reachable while signed in. One `Redirect` in `(auth)/_layout` would
   make the guard structural rather than per-screen.

---

## Manual testing guide

**Commands needed:** none — all changes are JS and hot-reload.

```bash
npx expo start
```

Re-running the checks:

```bash
npm run typecheck && npm run typecheck:shared && npm test
```

### 1. Escape the nutrition workspace (N-P0-01)
1. Sign in → drawer → **Switch App** → **Nutrition & Macro Tracker**.
2. Confirm you are in the nutrition tabs.
3. Tap **Exit** in the tab bar. **Expect:** you land in the expense workspace
   (dashboard or your default view), not back in nutrition.
4. Force-quit and reopen. **Expect:** the expense workspace, because the switch
   was persisted.
5. *Regression check:* repeat steps 1–2, then force-quit **without** pressing
   Exit. **Expect:** nutrition reopens — the workspace preference still works.

### 2. Notification opens the right screen from cold start (N-P1-03)
1. Enable SMS automation, or wait for a credit-card bill reminder.
2. **Fully quit the app** (swipe from recents).
3. Tap the notification. **Expect:** the app opens *and* navigates to the review
   inbox / bill detail — not just the dashboard.
4. Press back. **Expect:** you reach the dashboard, not an app exit.
5. Tap a second notification while the app is running. **Expect:** it navigates
   again, without stacking a duplicate of the same screen.

### 3. Route restoration no longer hijacks (N-P0-02)
1. Navigate to **Settings** and leave the app there. Force-quit.
2. Reopen normally. **Expect:** you resume on Settings.
3. Force-quit again, then open a deep link:
   ```bash
   npx uri-scheme open "expensetrackermobile://ledger" --android
   ```
   **Expect:** you land on Transactions and **stay** there — no jump to Settings
   a second later.

### 4. Saved route does not leak between accounts (N-P0-02)
1. As user A, navigate to an account detail screen (`/accounts/<id>`).
2. Sign out. Sign in as user B.
3. **Expect:** user B lands on their own default view. **Not** user A's account
   detail route or an empty/error detail screen.

### 5. Nutrition is protected (N-P1-04)
1. Sign out.
2. Deep link into nutrition:
   ```bash
   npx uri-scheme open "expensetrackermobile://nutrition" --android
   ```
3. **Expect:** the login screen, not the nutrition tabs.

### 6. No duplicate Dashboards (N-P1-05, N-P1-06)
1. From the dashboard, open **Insights** on a month with no data.
2. Tap the empty state's **Go to Dashboard**.
3. **Expect:** you return to the dashboard. Press back **once** → the
   "Press back again to exit" toast. Previously back walked through several
   stale Insights/Dashboard copies first.
4. Now cycle Home → Transactions → back → Home → Insights → back, five times.
5. **Expect:** every back press from a secondary tab lands on the dashboard, and
   a single further back press offers to exit — proof the stack is not growing.

### 7. Android back from a deep-linked sub-screen (N-P1-06)
1. Fully quit the app.
2. Deep link straight to a detail screen:
   ```bash
   npx uri-scheme open "expensetrackermobile://accounts/SOME_ACCOUNT_ID" --android
   ```
3. Press the hardware back button. **Expect:** you land on the dashboard —
   previously an empty stack could drop you out of the app entirely.

### 8. Modals still consume back first (regression)
1. Open the Add Transaction sheet, the month drawer, and the setup wizard in
   turn.
2. Press back in each. **Expect:** the sheet closes and you stay on the screen —
   back must not navigate while a modal is open.

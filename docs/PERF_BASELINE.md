# Performance Baseline & Startup Contract — Phase 19 (Startup + Hot Screens)

Measurement is gated: enabled in `__DEV__`, or set `EXPO_PUBLIC_PERF_MARKS=1` in `.env` for release builds.

Watch Metro / `adb logcat` for lines prefixed `[perf]`.

---

## 1. Quantitative Performance Budgets & Contract (SPENDLY-404)

Budgets are derived directly from the measured baseline (SPENDLY-398) and post-optimization measurements (SPENDLY-399 through SPENDLY-403) for **Scenario 1 (Cold Online Launch)**:

| Metric / Milestone | Baseline (SPENDLY-398) | Achieved (SPENDLY-403) | Pass Budget (Target) | Warn Threshold | Fail Limit (Regression) |
|---|---|---|---|---|---|
| **Time to first UI (`app_ready`)** | 1938ms | 193ms | **< 300ms** | 300ms – 500ms | > 500ms |
| **Splash complete (`splash_animation_done`)** | 2769ms | 960ms | **< 1200ms** | 1200ms – 1600ms | > 1600ms |
| **First meaningful UI (`dashboard_mounted`)** | 2157ms | ~220ms | **< 400ms** | 400ms – 700ms | > 700ms |
| **Critical dashboard data (`dashboard_data_ready`)** | ~4878ms | ~400ms | **< 800ms** | 800ms – 1200ms | > 1200ms |
| **Full dashboard hydration (`dashboard_hydrated`)** | Stalled UI | ~1500ms | **< 2500ms** | 2500ms – 3500ms | > 3500ms |
| **Immediate startup Firestore listeners** | 17 listeners | 11 listeners | **≤ 11** | 12 – 14 | > 14 |
| **Initial ledger query page size** | Full history | 300 docs page | **≤ 300 docs** | 301 – 500 docs | > 500 docs |
| **Global feature provider mounts** | 3 providers | 0 providers | **0** | 1 | > 1 |
| **Dashboard scroll smoothness (`fps:dashboard`)** | Unmeasured | 58–60 FPS | **≥ 55 FPS** | 45 – 54 FPS | < 45 FPS |
| **Ledger scroll smoothness (`fps:ledger`)** | Unmeasured | 58–60 FPS | **≥ 55 FPS** | 45 – 54 FPS | < 45 FPS |

### Automated Enforcement:
Static and architectural guardrails against startup anti-patterns are automatically verified via:
```bash
npm run perf:verify
```
This check is wired into `npm run release:verify` and blocks release builds if any provider is mounted out of scope, a non-critical listener is attached before idle, initial query limits are removed, or dashboard widgets are unmemoized.

---

## 2. Benchmark Suite Scenarios

Execute the following scenarios using a **Release build** (`npm run release` -> `adb install -r releases/app-release.apk` or `npm run android:test-build` with `EXPO_PUBLIC_PERF_MARKS=1`) to ensure React overhead is representative of production.

### Scenario 1: Cold online launch after force-stop
```bash
adb shell am force-stop com.chkesava.spendly
```
*Launch app from launcher. Measures full native -> JS -> Network boundary.*

### Scenario 2: Warm/background resume
*Press Home button, wait 5 seconds, launch app from launcher or recents.*
*Measures JS thread unblocking and React reconciliation on resume.*

### Scenario 3: Cold launch with existing local cache
*Ensure app has loaded data recently.*
```bash
adb shell am force-stop com.chkesava.spendly
```
*Launch app. Measures Firestore local cache read speed vs server roundtrips.*

### Scenario 4: Cold offline launch
```bash
adb shell svc wifi disable
adb shell svc data disable
adb shell am force-stop com.chkesava.spendly
```
*Launch app. Measures time to first meaning UI when network fails immediately.*

### Scenario 5: Cold launch after fresh install
```bash
adb shell pm clear com.chkesava.spendly
```
*Launch app and login. Measures first-time setup, secure store initialization, and full network fetch.*

---

## 3. Repeatable Release APK Measurement Procedure

To record and compare performance metrics for each release candidate:

1. **Build Release APK with Perf Diagnostics Enabled**:
   ```bash
   EXPO_PUBLIC_PERF_MARKS=1 npm run android:test-build
   # OR for production releases:
   EXPO_PUBLIC_PERF_MARKS=1 npm run release
   ```
2. **Install and Prepare Logcat Stream**:
   ```bash
   adb install -r dist/Spendly-Test.apk
   # Clear logcat buffer and filter for perf lines
   adb logcat -c
   adb logcat -s "[perf]" "[perf:end]" "[perf:event]"
   ```
3. **Execute Cold Launch Benchmark**:
   ```bash
   adb shell am force-stop com.example.expensetracker.localtest
   adb shell monkey -p com.example.expensetracker.localtest -c android.intent.category.LAUNCHER 1
   ```
4. **Capture Milestones**:
   Collect the output timestamps:
   - `[perf] app_ready +Xms (total Yms)`
   - `[perf] splash_animation_done +Xms (total Yms)`
   - `[perf:event] dashboard_mounted (total Yms)`
   - `[perf] dashboard_data_ready +Xms (total Yms)`
   - `[perf] dashboard_hydrated +Xms (total Yms)`
5. **Verify Against Budget Contract**:
   Confirm all recorded metrics fall within the **Pass Budget** column of the matrix above. Any metric in the **Warn** zone must be flagged in the release QA report; any in the **Fail** zone blocks release candidate sign-off.

---

## 4. Historical Progression (SPENDLY-398 → SPENDLY-403)

### Milestone Progression Table (Scenario 1 Cold Launch)
| Milestone | SPENDLY-398 Baseline | SPENDLY-399 (Double Mount Fix) | SPENDLY-400 (Listener Deferral) | SPENDLY-401..403 (Progressive Dashboard) |
|---|---|---|---|---|
| `app_module` | 1925ms | 119ms | 119ms | 119ms |
| `fonts_ready` | 193ms | 162ms | 162ms | 162ms |
| `navigation_ready` | 1926ms | 181ms | 181ms | 181ms |
| `local_stores_ready`| 1935ms | 186ms | 186ms | 186ms |
| `auth_ready` | 776ms | 190ms | 190ms | 190ms |
| **`app_ready`** | **1938ms** | **193ms (-90%)** | **193ms** | **193ms** |
| `splash_animation_done` | 2769ms | 960ms | 960ms | 960ms |
| `dashboard_mounted` | 2157ms | ~220ms | ~220ms | ~220ms |
| `startup_listeners` | 17 immediate | 17 immediate | 11 immediate (6 deferred) | 11 immediate |
| `feature_providers` | 3 global | 3 global | 3 global | 0 global (on-demand) |
| `dashboard_widgets` | Monolithic mount | Monolithic mount | Monolithic mount | Staggered LazyMount + React.memo |

---

## 5. Manual Testing Guide

1. **Verify Automated Budgets**:
   ```bash
   npm run perf:verify
   ```
2. **Force-Stop & Cold Launch**:
   - Force-stop the app, reopen, confirm splash hides cleanly under 300ms.
   - Verify dashboard above-the-fold widgets (`Safe to Spend`, `Quick Add`, `Recent Activity`) appear immediately.
3. **Scroll FPS Check**:
   - Fling the Dashboard and Ledger lists; verify that `fps:dashboard` and `fps:ledger` log ≥ 55 FPS in logcat / console.
4. **Feature-Scoped Providers Check**:
   - Verify that leaving the Dashboard for Borrowings or Credit Cards connects the respective listeners on demand and tears down cleanly after navigating away.

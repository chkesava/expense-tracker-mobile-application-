# Performance baseline — Phase 19 (Startup + Hot Screens)

Measurement is gated: enabled in `__DEV__`, or set `EXPO_PUBLIC_PERF_MARKS=1` in `.env` for release builds.

Watch Metro / `adb logcat` for lines prefixed `[perf]`.

## Benchmark Suite Scenarios

Execute the following scenarios using a **Release build** (`npm run release` -> `adb install -r releases/app-release.apk`) to ensure React overhead is representative of production.

### 1. Cold online launch after force-stop
```bash
adb shell am force-stop com.chkesava.spendly
```
*Launch app from launcher. Measures full native -> JS -> Network boundary.*

### 2. Warm/background resume
*Press Home button, wait 5 seconds, launch app from launcher or recents.*
*Measures JS thread unblocking and React reconciliation on resume.*

### 3. Cold launch with existing local cache
*Ensure app has loaded data recently.*
```bash
adb shell am force-stop com.chkesava.spendly
```
*Launch app. Measures Firestore local cache read speed vs server roundtrips.*

### 4. Cold offline launch
```bash
adb shell svc wifi disable
adb shell svc data disable
adb shell am force-stop com.chkesava.spendly
```
*Launch app. Measures time to first meaning UI when network fails immediately.*

### 5. Cold launch after fresh install
```bash
adb shell pm clear com.chkesava.spendly
```
*Launch app and login. Measures first-time setup, secure store initialization, and full network fetch.*

---

## Startup Timeline Measurements (SPENDLY-398 Baseline)

*Fill in these tables using the `[perf]` logs from your device for Scenario 1 (Cold online launch).*

**Device Details:**
- **Model:** [e.g. Pixel 6]
- **Android Version:** [e.g. 14]
- **Network:** [e.g. WiFi / 5G / Offline]

### Phase Durations (ms)
| Metric | Duration (ms) | Success/Failure | Notes |
|--------|---------------|-----------------|-------|
| `firebase_init` | 1ms | Success | |
| `auth_init` | 614ms | Success | Took longest on initial launch |
| `local_stores_init` | 31ms | Success | |
| `navigation_init` | 66ms | Success | |

### Absolute Timeline (ms from app start)
| Milestone | Timestamp (ms) | Delta from previous |
|-----------|----------------|---------------------|
| `app_start` (T0/T1) | 0 | - |
| `app_module` (T2) | 1925 | +1925 |
| `auth_ready` (T5) | 776 | - |
| `local_stores_ready` (T7) | 1935 | +10 |
| `navigation_ready` (T9) | 1926 | - |
| `app_ready` (Gate passed) | 1938 | +3 |
| `dashboard_mounted` (T14)| 2157 | +219 |
| `splash_animation_done` (T15) | 2769 | +612 |

### Firestore Startup Workload
| Collection | Listeners Started | First Snapshot Received | Doc Count | From Cache? |
|------------|-------------------|-------------------------|-----------|-------------|
| expenses | 2057ms | 4878ms | 0 | No |
| incomes | 2057ms | - | 0 | No |
| accounts | | | | |
| accountTypes | | | | |

---

## Hot Screens Baseline (pre / post)

| Metric | Before (approx intent) | After (fill on device) |
|--------|------------------------|-------------------------|
| Cold start → `app_ready` | Auth blocked on category seed; splash waited settings/userDoc | Auth unblocks immediately; splash waits auth+fonts+local+nav |
| Splash overlay | ~750ms + 350ms fade | ~450ms + 280ms fade |
| Ledger scroll | SectionList | FlashList + sticky headers |
| Portfolio holdings | ScrollView `.map` | FlashList + focus-gated listeners |
| SIP history / positions | `.map` | FlashList + focus-gated / staged SIP listeners |
| Dashboard | All widgets mount | Above-fold immediate; below-fold `LazyMount` |
| Finance expenses | 200 → full on idle 800ms | `limit(300)` first paint, unbounded after idle (~1.2–2.8s); upgrade does not flip loading (SPENDLY-12) |

Record your device numbers here after testing:

| Screen / mark | Dev FPS or ms | Release FPS or ms |
|---------------|---------------|-------------------|
| `app_ready` | | |
| `splash_animation_done` | | |
| `fps:ledger` | | |
| `fps:portfolio_holdings` | | |
| `fps:sip_history` | | |
| `fps:dashboard` | | |

## Manual Testing Guide

1. Force-stop the app, reopen, confirm splash then home without long blank wait.
2. Ledger: scroll rapidly with many transactions — expect near-60 FPS feel; sticky day headers.
3. Portfolio: open Holdings, fling list; switch to Expenses tab — PortfolioDashboard unmounts and portfolio listeners tear down.
4. SIP: Positions + History tabs scroll smoothly; leaving SIP tab unmounts SipDashboard.
5. Dashboard: overview appears immediately; lower widgets appear shortly after without blocking first paint.
6. Email/password and Google sign-in still work.

**Commands:** Dev — `npx expo start` / `npx expo run:android` (uninstall release APK first if signature conflict). Release check — `npm run release` then `adb install -r releases/app-release.apk`. No extra commands for hot-reload of JS-only changes under a matching debug install.

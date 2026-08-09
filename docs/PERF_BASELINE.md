# Performance baseline — Phase 19 (Startup + Hot Screens)

Measurement is gated: enabled in `__DEV__`, or set `EXPO_PUBLIC_PERF_MARKS=1` in `.env` for release builds.

Watch Metro / `adb logcat` for lines prefixed `[perf]`.

## How to capture

1. **Cold start (dev):** uninstall/reinstall or force-stop app → open → note marks:
   - `app_module`, `local_stores_ready`, `fonts_ready`, `auth_ready`, `navigation_ready`, `app_ready`, `splash_animation_done`
2. **Cold start (release):** build with `EXPO_PUBLIC_PERF_MARKS=1` via release env, install APK, same marks in logcat (`adb logcat | findstr /i perf`).
3. **Scroll FPS:** fling lists on Ledger / Portfolio holdings / SIP / Dashboard; logs `fps:<label>`.

## Baseline (pre / post)

| Metric | Before (approx intent) | After (fill on device) |
|--------|------------------------|-------------------------|
| Cold start → `app_ready` | Auth blocked on category seed; splash waited settings/userDoc | Auth unblocks immediately; splash waits auth+fonts+local+nav |
| Splash overlay | ~750ms + 350ms fade | ~450ms + 280ms fade |
| Ledger scroll | SectionList | FlashList + sticky headers |
| Portfolio holdings | ScrollView `.map` | FlashList + focus-gated listeners |
| SIP history / positions | `.map` | FlashList + focus-gated / staged SIP listeners |
| Dashboard | All widgets mount | Above-fold immediate; below-fold `LazyMount` |
| Finance expenses | 200 → full on idle 800ms | Idle ~1.2s; upgrade does not flip loading |

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

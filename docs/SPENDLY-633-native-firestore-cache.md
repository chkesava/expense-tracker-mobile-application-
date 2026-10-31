# SPENDLY-633 — Durable on-device Firestore cache (native SDK)

Epic branch: `feature/SPENDLY-633-native-firestore-cache` (from `main` ed57efe2).
Android only (no iOS project exists). Web stays on the Firebase JS SDK.

## Why
The Firebase JS SDK persists only to IndexedDB, which React Native lacks, so
native builds run on a memory cache: every cold start re-reads everything from
the server, and queued writes rely on the AsyncStorage outbox (`commitMutations`).
Found during SPENDLY-632.

## Stories

| Key | Story | State |
|---|---|---|
| SPENDLY-634 | Spike: @react-native-firebase go/no-go | GO on 24.0.0; merged into epic (06435450, test fix 492f0523) |
| SPENDLY-635 | Firestore platform adapter + import codemod | Merged into epic (84569ea3) |
| SPENDLY-636 | Native auth adapter + session migration | Merged into epic (334d5bec) |
| SPENDLY-637 | Native Storage, Functions, App Check | Merged into epic (5ac6d6d4) |
| SPENDLY-638 | Native cutover: Firestore, Auth, Storage on the native SDKs | Merged into epic (149fe311) |
| SPENDLY-639 | Offline / outbox / freshness integrity | Merged into epic (d4b8534e) |
| SPENDLY-640 | Measure, device QA (3 apps), staged release | Partial: configs verified, release plan written; timings not taken (stopped by owner) |
| SPENDLY-641 | Keep or retire the SPENDLY-632 dashboard snapshot | To Do |

## Decisions
- Android only; all three native apps switch together in code, Expense is released first (owner, 2026-10-30).
- Session migration: one re-sign-in after the update with a short note; no token bridge (owner confirmed 2026-10-30, SPENDLY-636).
- Functions has no callers; the native cutover leaves it out (SPENDLY-637).
- Native App Check is wired but off (`NATIVE_APP_CHECK_ENABLED`); console enforcement is a separate owner decision (SPENDLY-637).
- Auth, Storage and Functions switch to native **together with Firestore in SPENDLY-638**: they share the signed-in user, and the rules only see `request.auth` from the SDK that signed in (SPENDLY-636).
- The `commitMutations` outbox no longer journals when the SDK queue is durable (web and native): a second copy risked double-applying increments. Replay still drains entries left by older JS-SDK builds (SPENDLY-639).
- **@react-native-firebase pinned to 24.0.0** (see spike finding 1).
- `shared/` mutation helpers import field values from `@/lib/firestore` (resolved per platform) instead of emitting descriptors (SPENDLY-635).
- The outbox encoder (`lib/firestoreSentinel.ts`) reads native `FieldValue`s; `lib/firestore.native.ts` keeps array-transform elements for it (SPENDLY-638). Outbox × native queue replay is verified in SPENDLY-639.

## SPENDLY-634 spike results (2026-10-30)

Device: CPH2661 (Android), Spendly Test against the emulator suite (`demo-spendly`).
Probe: `lib/rnfbSpike.native.ts`, Spendly Test only, results shown in an
on-screen alert (logcat dropped JS lines on this device).

### Findings
1. **Version: @react-native-firebase 27.x does not build here; 24.0.0 does.**
   RNFB 27.1 defaults to Firebase BoM 35.0.2; its `firebase-auth` 25.0.0 is
   compiled with Kotlin 2.4 metadata, while RN 0.86 pins Kotlin 2.1.20
   (reads ≤ 2.2). Lowering the BoM under 27.x fails instead in the Firestore
   module (it calls Pipeline APIs only in firestore 27 / BoM 35). RNFB
   26.x defaults to BoM 34.15–34.18 (auth 24.1–24.2, Kotlin 2.3 metadata —
   also too new). RNFB **24.0.0** (BoM 34.10.0, auth 24.0.1 = Kotlin 2.1)
   compiles and runs. Upgrading RNFB later is tied to a project Kotlin bump.
2. **API difference:** in RNFB 24 `initializeFirestore` returns a `Promise`
   (the JS SDK's is synchronous). The adapter (635/638) must initialise
   asynchronously before the first listener.
3. **Auth emulator on a real phone:** RNFB rewrites `127.0.0.1`/`localhost`
   to `10.0.2.2` (Android emulator host). Bypassed with
   `firebase.json → "react-native": { "android_bypass_emulator_url_remap": true }`
   (read only by RNFB; no effect on production hosts).
4. **Spendly Test needs a services file:** `google-services.localtest.json`
   (demo project only, no production keys) wired in `app.config.js`'s
   local-test branch, plus the RNFB app/auth plugins there only.
5. JS SDK and native SDK coexist: the app's own (JS SDK) path ran unchanged
   alongside the native default app.

### Measurements

| Check | Result |
|---|---|
| Native app init | `[DEFAULT]`, projectId `demo-spendly`, ~40 ms |
| Session survives force-stop | yes (`restored: true` every relaunch) |
| Disk cache after force-stop | 4/4 accounts from cache at ~190–230 ms |
| First listener snapshot | from cache at ~220–264 ms; server snapshot ~330–380 ms |
| Rules see native `request.auth` | yes (server snapshots of `users/{uid}/accounts` allowed) |
| Offline (Firestore + Auth ports cut) | cache read 4/4 at 200 ms, listener `fromCache`, write queued (`hasPendingWrites`) |
| Offline write survives force-stop | yes: next online launch showed it pending, then acked; counter 4 → 5 with no double apply |
| APK size (Spendly Test) | 84.2 MB vs 82.2 MB (+2.0 MB) |
| Build time | incremental ~4–5 min (unchanged); a prebuild is needed once when native deps change |

### Not covered by the spike (carried forward)
- A release-variant build with RNFB autolinked (638/640): the release config
  needs the RNFB plugins and the existing `google-services.json`.
- Google sign-in, phone auth, duress (636); Storage/Functions/App Check (637).
- Read counts per launch, under/over 30 min (640).

### Recommendation
**GO**, on RNFB 24.0.0 with the BoM it ships (34.10.0). Persistence, offline
writes across a force-stop, native auth with rules and emulator testing all
work on the device.

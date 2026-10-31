# SPENDLY-638 — Native cutover: Firestore, Auth and Storage on the native SDKs

Epic: SPENDLY-633. Branch: `feature/SPENDLY-638-native-cutover`.

## What changed
Android/iOS now run Firebase on `@react-native-firebase/*` 24.0.0; web and
the vitest suite keep the Firebase JS SDK. Metro picks the `.native.ts`
files; type-checking always sees the web ones.

| File | Role |
|---|---|
| `lib/firebase.native.ts` | Native bootstrap: default app from `google-services.json` (Spendly Test: the demo file), native Auth/Firestore/Storage, emulators in Spendly Test, no Functions (unused). Same exports as `lib/firebase.ts`. |
| `lib/firestore.native.ts` | Re-exports the native SDK; `arrayUnion`/`arrayRemove` keep their plain elements for the write outbox. |
| `lib/auth.native.ts`, `lib/storage.native.ts` | Re-export the native SDKs. |
| `lib/nativeAuthFlag(.native).ts` | `NATIVE_AUTH_ENABLED` — true on native, so the one-time re-sign-in note (SPENDLY-636) is live there. |
| `app.config.js`, `app.json` | RNFB app/auth config plugins for every native build (previously Spendly Test only). |

### Behaviour that had to be adapted
- **Error codes**: the native SDK reports `firestore/permission-denied`;
  `errorCode()` (`lib/errors.ts`) now reads it as `permission-denied`, so
  every classifier keeps one vocabulary (tests added).
- **Write outbox**: `lib/firestoreSentinel.ts` now also serialises native
  FieldValues (`_type`/`_elements`), and array transforms from the plain
  elements the native adapter keeps (tests with native-shaped values).
- **Document-id queries**: `useDashboardCashFlow` used the JS-only
  `where("__name__", …)` string; it now uses `documentId()`, which both SDKs
  support.
- **Sign-out** (`recycleFirestoreAfterLogout`): `terminate` then
  `clearPersistence`, so one user's cached data never stays on the phone for
  the next. Pending writes are still flushed first by `logout`.
- **Write queue**: `setWriteQueueDurable(true)` on native — the native SDK
  persists queued writes (spike: an offline write survived a force-stop and
  applied once). The AsyncStorage outbox stays as a second net (SPENDLY-639).
- Removed: `lib/createAuth.native.ts` (the native SDK keeps its own session)
  and the SPENDLY-634 spike probe.

### Unchanged on purpose
- Web: same JS SDK, IndexedDB cache, reCAPTCHA App Check.
- Native App Check stays off (`NATIVE_APP_CHECK_ENABLED`): minting tokens
  needs Play Integrity set up in the console; enforcement is an owner decision.
- Ganesh phone sign-in keeps its browser verification page; on native the
  resulting phone credential now signs in through the native SDK.
- Duress: `createDuressUser` prototypes the real user, which works with the
  native `User` class; the decoy session only reads `duressUid` paths.

## Device verification (Spendly Test on CPH2661, emulator suite, 2026-10-30)

| # | Check | Result |
|---|---|---|
| 1 | Upgrade from a signed-in JS-SDK build (install over, data kept) | **Pass** — "Please sign in once more" note shown; still shown after a relaunch; after "Got it" it never returns and the old session record is removed. |
| 2 | Sign in on the native SDK | **Pass** — dashboard loads (net worth ₹6,08,930); "Today's net worth is saved" = a native write accepted by the rules. |
| 3 | Cold start with Firebase unreachable (emulator ports cut) | **Pass** — the full dashboard draws from the on-device cache (not the SPENDLY-632 snapshot: no "saved figures" label). |
| 4 | Offline write → force-stop → online → applied once | **Pass** in SPENDLY-639 (balance increment applied exactly once). |
| 5 | Sign out → sign in again in the same session | **Pass** after two fixes below; cache clear logs no warning. |

### Found on device and fixed
- **Release signing after a prebuild** (`scripts/verify-gradle.js`): the
  regex started at the `release {` inside `signingConfigs` and re-pointed the
  *debug* build type, so the first build after every prebuild was
  debug-signed and would not install over the real app. Now scoped to
  `buildTypes`; regression test `scripts/verifyGradle.test.ts`. Likely the
  cause of the earlier "silently not installed" APKs.
- **Cache clear on sign-out** failed with `failed-precondition`: a settings
  listener restarted Firestore before the clear ran. Sign-out now blocks
  re-creation until terminate + clear finish (`recycling` in
  `firebase.native.ts`); `clearIndexedDbPersistence` replaces the deprecated
  `clearPersistence`.
- **Same-session re-sign-in in Spendly Test** showed the first-run welcome
  modal: RNFB applies `useEmulator` once and never to the instance created
  after `terminate`, so the new instance talked to the (non-existent) cloud
  `demo-spendly`. Fixed with `patches/@react-native-firebase+firestore+24.0.0.patch`
  (terminate forgets the emulator flag) and re-connecting after sign-out.
  Production has no emulator, so it was test-only — but the patch keeps the
  sign-out path testable.

### Not explained
On the very first upgrade run (22:57) the note never appeared and the
"dismissed" flag was already set before any tap. A controlled, hands-off
repeat behaved correctly three times. Worth watching in SPENDLY-640 QA.

## Checks
- Focused: adapter contracts, import guard, migration, sentinel (17), errors,
  local test mode, auth helpers, commitMutations, verify-gradle — passing.
- `npm run typecheck`, `npm run typecheck:shared`: clean.
- Full `npm test`: 6489 passed. Three wall-clock "stays fast" tests
  (`decisionJournal.qa`, `feeDetection`, `whatIf.qa`) tripped on this machine
  while the emulators and Gradle daemons were running; all 106 tests in those
  files passed on a rerun, and none of them is touched by this story.

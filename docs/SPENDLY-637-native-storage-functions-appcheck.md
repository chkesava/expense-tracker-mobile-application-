# SPENDLY-637 — Native Storage, Functions and App Check

Epic: SPENDLY-633. Branch: `feature/SPENDLY-637-native-storage-functions`.

## Findings
- **Storage** has one runtime user: `lib/apkUpdate.ts` resolves the APK
  download URL from `releases/…`. `storage.rules` requires `request.auth`
  there, so once SPENDLY-638 moves sign-in to the native SDK the JS Storage
  SDK would see no user and quietly fall back to the GitHub release URL. Hence
  Storage needs the native SDK too. (Ganesh and other uploads already moved
  to Supabase and are not Firebase Storage.)
- **Functions**: `getFirebaseFunctions()` exists in `lib/firebase.ts` but has
  **no callers** — the app makes no callable-function requests. Nothing to
  migrate; SPENDLY-638's native `lib/firebase` can leave Functions out.
- **App Check** was already split per platform (`appCheck.web.ts` reCAPTCHA;
  native a no-op because the JS SDK cannot mint native tokens).

## What changed
- `@react-native-firebase/storage` and `@react-native-firebase/app-check`
  **24.0.0** added (same pin as the rest, see SPENDLY-634).
- **`lib/storage.ts`**: the one Storage import path (re-exports the JS SDK —
  no runtime change). `lib/apkUpdate.ts` and `lib/firebase.ts` moved onto it.
- **`lib/firebaseImportGuard.test.ts`** now also blocks direct
  `firebase/storage` imports.
- **`lib/storageAdapterContract.test.ts`**: every Storage name used
  (`getDownloadURL`, `ref`, `getStorage`, `connectStorageEmulator`) exists in
  the native SDK — no gaps.
- **`lib/appCheck.ts`** (native): Play Integrity provider on the native app,
  debug provider in Spendly Test, behind `NATIVE_APP_CHECK_ENABLED = false`;
  the native modules load only when enabled. `lib/appCheck.test.ts` covers
  both paths. Turning it on is part of SPENDLY-638's cutover; **enforcing**
  App Check in the Firebase console remains a separate owner decision.

## Invariant
No runtime change on any platform: the adapters re-export the JS SDK and the
native App Check path is off. Storage paths, metadata and rules unchanged.

## Note
The two new packages autolink into native builds (unused until SPENDLY-638);
the next Spendly Test / release build needs a prebuild.

## Checks
- `npm test`: 490 files / 6482 tests passed.
- `npm run typecheck:shared`, `npm run typecheck`: clean.

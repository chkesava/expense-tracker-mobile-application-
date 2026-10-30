# SPENDLY-636 — Native auth adapter and session migration

Epic: SPENDLY-633. Branch: `feature/SPENDLY-636-native-auth`.

## What changed
- **`lib/auth.ts`**: the one Firebase Auth import path for app code. It
  re-exports the JS SDK, so **behaviour is unchanged** in this story (Metro
  still resolves `firebase/auth`'s React Native build behind it, so
  `getReactNativePersistence` keeps working).
- **Codemod**: 14 imports moved from `firebase/auth` to `@/lib/auth`
  (including `reauthenticate.ts`'s dynamic import).
- **`lib/firebaseImportGuard.test.ts`** (renamed from the Firestore-only
  guard): no direct `firebase/firestore` or `firebase/auth` imports outside
  the adapters, rules tests and scripts.
- **`lib/authAdapterContract.test.ts`**: every Auth name used at runtime
  exists in `@react-native-firebase/auth` 24, except three JS-only names
  allowed only where SPENDLY-638 replaces them with a native flow:
  `getReactNativePersistence` (`createAuth.native.ts`), `RecaptchaVerifier`
  (Ganesh phone sign-in) and `reauthenticateWithPopup` (web Google re-auth).
  Type-only imports are skipped: type-checking always sees the web SDK.
  The contract helpers now live in `lib/testing/sdkAdapterContract.ts`
  (shared with the Firestore contract test).
- **Session migration** (owner decision 2026-10-30: one re-sign-in, no token
  bridge):
  - `shared/utils/nativeAuthMigration.ts`: when to show the note and when the
    leftover JS-SDK session record (`firebase:authUser:<apiKey>:[DEFAULT]`) can
    be removed.
  - `lib/nativeAuthMigration.ts`: reads/clears that record and the
    "dismissed" flag; `NATIVE_AUTH_ENABLED = false` until SPENDLY-638.
  - `app/(auth)/login.tsx` (Expense/Nutrition): a one-time "Please sign in
    once more" note above the form, shown only when enabled and an old
    session record exists.
  - Offline writes are not lost: the outbox is kept per user and
    `replayWriteOutbox(uid)` replays it on that user's next sign-in.

## Why the native switch is not in this story
Firebase Storage and Functions read the signed-in user from the same Auth
instance, and the Firestore rules only see `request.auth` from the SDK that
signed in. Switching Auth alone would break uploads, callables and every rule
check, so SPENDLY-638 switches Firestore, Auth, Storage and Functions on
native together.

## Carried to SPENDLY-638
- `createAuth.native.ts` goes away (the native SDK persists its own session).
- Ganesh phone sign-in moves to the native SDK's phone verification; its
  re-sign-in note belongs with that rework (Ganesh UI rules apply).
- Native Google re-auth uses `reauthenticateWithCredential` with a Google
  credential instead of the popup.
- Duress: `createDuressUser` / `duressUid` are client-side over the signed-in
  user; re-check them against the native `User` object.

## Checks
- Focused: contract tests, import guard, migration tests (11) — passing.
- `npm test`: 488 files / 6478 tests passed.
- `npm run typecheck:shared`, `npm run typecheck`: clean.

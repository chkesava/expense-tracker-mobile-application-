# SPENDLY-635 — Firestore platform adapter and import codemod

Epic: SPENDLY-633. Branch: `feature/SPENDLY-635-firestore-adapter`.

## What changed
- **`lib/firestore.ts`**: the one Firestore import path for app code. It
  re-exports the Firebase JS SDK on every platform, so **behaviour is
  unchanged** in this story. SPENDLY-638 adds `lib/firestore.native.ts`
  (mapping to `@react-native-firebase/firestore`) together with native auth,
  so the rules keep seeing `request.auth`.
- **Codemod**: 142 files / 149 import sites moved from `firebase/firestore`
  to `@/lib/firestore` (static imports, `import type`, and `await import()`).
  Untouched by design: `firestore/*.rules.test.ts` and `scripts/` (web SDK
  against the emulator), and `vi.mock("firebase/firestore", …)` in tests,
  which still applies because the adapter re-exports that module.
- **`lib/firestoreImportGuard.test.ts`**: fails on any direct
  `firebase/firestore` import outside the allowed places (stands in for a
  lint rule; the repo has no ESLint setup).
- **`lib/firestoreAdapterContract.test.ts`**: resolves the native SDK's real
  export list with the TypeScript compiler and fails if app code uses a
  Firestore name it lacks. The only gaps are the JS SDK cache-setup helpers
  (`persistentLocalCache`, `memoryLocalCache`, `persistentSingleTabManager`,
  `persistentMultipleTabManager`), allowed solely in `lib/firebase.ts`.

## Decisions
- **`shared/` imports the adapter instead of emitting descriptors.** The
  story planned plain mutation descriptors for `balanceMutations`,
  `dashboardMutations` and `epfMutations`. Not needed: they now import
  `increment`/`serverTimestamp` from `@/lib/firestore`, which Metro resolves
  per platform, so native writes get native sentinels. `shared/` code stays
  free of React Native at type level and runs unchanged under vitest.
- No `.native.ts` yet: wiring native Firestore without native Auth would make
  every rule check see an unauthenticated user.

## Carried to SPENDLY-638 / 639
- `lib/firestoreSentinel.ts` (outbox encoding) reads JS SDK sentinel
  internals (`_methodName`). Native SDK `FieldValue`s carry `_type` /
  `_elements`, and `arrayUnion`/`arrayRemove` store elements already
  serialised for the bridge — the native adapter must keep the plain
  elements recoverable (e.g. a non-enumerable copy) before the outbox can
  encode them.
- RNFB 24 `initializeFirestore` is async (SPENDLY-634).

## Checks
- `npm test`: 485 files / 6465 tests passed (one earlier run tripped the
  wall-clock threshold in `shared/utils/whatIf.qa.test.ts` under load; it
  passed 3/3 alone and the rerun of the full suite was green).
- `npm run typecheck:shared`, `npm run typecheck`: clean.

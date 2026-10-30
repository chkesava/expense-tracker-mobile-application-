/**
 * SPENDLY-637 — the one Firebase Storage import path for app code
 * (`lib/firebaseImportGuard.test.ts`). It re-exports the JS SDK, so behaviour
 * is unchanged. SPENDLY-638 switches native builds to
 * `@react-native-firebase/storage` together with Auth: Storage reads under
 * `releases/` require `request.auth`, which only the SDK that signed in can
 * supply.
 */
export * from "firebase/storage";

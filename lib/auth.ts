/**
 * SPENDLY-636 — the one Firebase Auth import path for app code.
 *
 * Every module imports Auth from `@/lib/auth`, never from `firebase/auth`
 * directly (`lib/firebaseImportGuard.test.ts`). Today this re-exports the
 * Firebase JS SDK, so behaviour is unchanged. SPENDLY-638 switches native
 * builds to `@react-native-firebase/auth` together with Firestore, Storage
 * and Functions (they read the signed-in user from the same Auth instance,
 * and the rules only see `request.auth` from it), so the swap happens once.
 *
 * Metro still resolves `firebase/auth`'s React Native build behind this
 * re-export, so `getReactNativePersistence` keeps working in
 * `createAuth.native.ts`.
 */
export * from "firebase/auth";

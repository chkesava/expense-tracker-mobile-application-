/**
 * SPENDLY-636 — the one Firebase Auth import path for app code.
 *
 * Every module imports Auth from `@/lib/auth`, never from `firebase/auth`
 * directly (`lib/firebaseImportGuard.test.ts`). This file is the web/vitest
 * side (Firebase JS SDK); Android/iOS resolve `auth.native.ts`
 * (`@react-native-firebase/auth`, SPENDLY-638), switched together with
 * Firestore and Storage because they share the signed-in user.
 */
export * from "firebase/auth";

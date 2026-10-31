/**
 * SPENDLY-638 — Auth on Android/iOS is the native SDK
 * (`@react-native-firebase/auth`): its session lives in the native keystore,
 * and Firestore/Storage requests carry it, so the security rules see
 * `request.auth`. Web and vitest resolve `lib/auth.ts` (the JS SDK);
 * `lib/authAdapterContract.test.ts` keeps the two in step.
 */
export * from "@react-native-firebase/auth";

/**
 * SPENDLY-638 — Storage on Android/iOS is the native SDK
 * (`@react-native-firebase/storage`), so `releases/` reads carry the native
 * sign-in. Web and vitest resolve `lib/storage.ts` (the JS SDK);
 * `lib/storageAdapterContract.test.ts` keeps the two in step.
 */
export * from "@react-native-firebase/storage";

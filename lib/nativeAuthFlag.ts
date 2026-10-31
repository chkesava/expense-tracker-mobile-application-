/**
 * SPENDLY-638 — whether Auth runs on the native SDK. False on web and in
 * vitest (this file); true on Android/iOS (`nativeAuthFlag.native.ts`).
 */
export const NATIVE_AUTH_ENABLED = false;

/**
 * SPENDLY-635 — the one Firestore import path for app code.
 *
 * Every module imports Firestore from `@/lib/firestore`, never from
 * `firebase/firestore` directly (`lib/firebaseImportGuard.test.ts`). Today
 * this re-exports the Firebase JS SDK on every platform, so behaviour is
 * unchanged. SPENDLY-638 adds `firestore.native.ts`, mapping the same API to
 * `@react-native-firebase/firestore` so native builds get a durable on-device
 * cache; web and the vitest suite keep resolving to this file.
 *
 * Exceptions: the rules tests (`firestore/*.rules.test.ts`) and Node scripts
 * talk to the emulator with the web SDK, and `vi.mock("firebase/firestore")`
 * in tests still applies because this module re-exports it.
 */
export * from "firebase/firestore";

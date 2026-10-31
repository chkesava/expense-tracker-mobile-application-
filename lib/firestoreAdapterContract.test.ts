import { describe, expect, it } from "vitest";

import { contractProblems, moduleExports, namesImportedFrom } from "@/lib/testing/sdkAdapterContract";

/**
 * SPENDLY-635 — every Firestore name app code imports from `@/lib/firestore`
 * must exist in `@react-native-firebase/firestore`'s modular API too, so
 * SPENDLY-638 can map native onto it without surprises.
 *
 * The only gaps are the JS SDK's cache-setup helpers, allowed solely in
 * `lib/firebase.ts`, which SPENDLY-638 splits per platform (native configures
 * persistence through `initializeFirestore`).
 */
const JS_ONLY: Record<string, readonly string[]> = {
  memoryLocalCache: ["lib/firebase.ts"],
  persistentLocalCache: ["lib/firebase.ts"],
  persistentMultipleTabManager: ["lib/firebase.ts"],
  persistentSingleTabManager: ["lib/firebase.ts"],
};

describe("Firestore adapter contract (SPENDLY-635)", () => {
  it("every Firestore name the app uses exists in the native SDK", () => {
    const native = moduleExports("@react-native-firebase/firestore");
    expect(native.size).toBeGreaterThan(50);
    expect(contractProblems(namesImportedFrom("@/lib/firestore", "lib/firestore.ts"), native, JS_ONLY)).toEqual([]);
  }, 60_000);
});

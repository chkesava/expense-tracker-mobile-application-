import { describe, expect, it } from "vitest";

import { contractProblems, moduleExports, namesImportedFrom } from "@/lib/testing/sdkAdapterContract";

/**
 * SPENDLY-637 — every Storage name app code uses at runtime through
 * `@/lib/storage` must exist in `@react-native-firebase/storage` 24, so
 * SPENDLY-638 can switch native Storage together with native Auth.
 */
describe("Storage adapter contract (SPENDLY-637)", () => {
  it("every Storage name the app uses exists in the native SDK", () => {
    const native = moduleExports("@react-native-firebase/storage");
    expect(native.size).toBeGreaterThan(10);
    expect(contractProblems(namesImportedFrom("@/lib/storage", "lib/storage.ts"), native, {})).toEqual([]);
  }, 60_000);
});

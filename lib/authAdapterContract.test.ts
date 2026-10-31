import { describe, expect, it } from "vitest";

import { contractProblems, moduleExports, namesImportedFrom } from "@/lib/testing/sdkAdapterContract";

/**
 * SPENDLY-636 — every Auth name app code uses at runtime through
 * `@/lib/auth` must exist in `@react-native-firebase/auth` too, so
 * SPENDLY-638 can map native onto it.
 *
 * Web/JS-SDK-only names are allowed solely where SPENDLY-638 replaces them
 * with a native flow:
 * - `RecaptchaVerifier`: Ganesh's browser-based phone sign-in; native uses
 *   the SDK's own phone verification.
 * - `reauthenticateWithPopup`: web Google re-auth; native re-authenticates
 *   with a Google credential instead.
 */
const JS_ONLY: Record<string, readonly string[]> = {
  RecaptchaVerifier: ["app/(ganesh-auth)/login.tsx", "app/ganesh-phone-auth.tsx", "lib/ganeshPhoneAuth.ts"],
  reauthenticateWithPopup: ["lib/reauthenticate.ts"],
};

/**
 * `lib/reauthenticate.ts` loads the module as a namespace inside a
 * `Promise.all` (it must stay loadable in vitest), which the import scan does
 * not follow; its names are listed here. Keep in sync with that file.
 */
const NAMESPACE_USES: Record<string, string> = {
  EmailAuthProvider: "lib/reauthenticate.ts",
  GoogleAuthProvider: "lib/reauthenticate.ts",
  reauthenticateWithCredential: "lib/reauthenticate.ts",
  reauthenticateWithPopup: "lib/reauthenticate.ts",
};

describe("Auth adapter contract (SPENDLY-636)", () => {
  it("every Auth name the app uses at runtime exists in the native SDK", () => {
    const native = moduleExports("@react-native-firebase/auth");
    expect(native.size).toBeGreaterThan(40);

    const used = namesImportedFrom("@/lib/auth", "lib/auth.ts");
    for (const [name, file] of Object.entries(NAMESPACE_USES)) {
      if (!used.has(name)) used.set(name, new Set());
      used.get(name)!.add(file);
    }
    expect(contractProblems(used, native, JS_ONLY)).toEqual([]);
  }, 60_000);
});

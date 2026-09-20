import { describe, expect, it } from "vitest";
import type { User } from "firebase/auth";
import {
  authErrorMessage,
  createDuressUser,
  shouldIgnoreAuthUidChange,
} from "./authHelpers";

function mockUser(uid: string): User {
  return {
    uid,
    email: "user@example.com",
    displayName: "Test User",
    photoURL: "https://example.com/a.png",
    emailVerified: true,
    providerData: [{ providerId: "google.com" }],
    // The real Firebase User carries this; the duress proxy must keep it
    // reachable (SPENDLY-22).
    getIdToken: async () => "token",
  } as unknown as User;
}

describe("authHelpers", () => {
  describe("authErrorMessage", () => {
    it("maps Firebase auth codes instead of leaking the SDK string", () => {
      const error = new Error("Firebase: Error (auth/invalid-credential).") as Error & {
        code: string;
      };
      error.code = "auth/invalid-credential";

      const message = authErrorMessage(error, "Email login failed");
      expect(message).toBe("Incorrect email or password.");
      expect(message).not.toMatch(/firebase/i);
    });

    it("reads message from error-like objects", () => {
      expect(authErrorMessage({ message: "Invalid password" }, "fallback")).toBe(
        "Invalid password"
      );
    });

    it("uses fallback for empty message or non-objects", () => {
      expect(authErrorMessage({ message: "" }, "fallback")).toBe("fallback");
      expect(authErrorMessage(null, "fallback")).toBe("fallback");
      expect(authErrorMessage("boom", "fallback")).toBe("fallback");
    });
  });

  describe("createDuressUser", () => {
    it("proxies uid with _duress suffix", () => {
      const real = mockUser("abc123");
      const duress = createDuressUser(real);

      expect(duress.uid).toBe("abc123_duress");
      expect(real.uid).toBe("abc123");
    });

    // SPENDLY-22 (AUTH-04). These used to pass through from the real user and
    // were rendered on the profile screen, the side drawer and Nutrition's
    // profile — and stamped onto documents created in the duress tree.
    it("does not leak the real identity", () => {
      const real = mockUser("abc123");
      const duress = createDuressUser(real);

      expect(duress.email).toBeNull();
      expect(duress.displayName).toBeNull();
      expect(duress.photoURL).toBeNull();
      expect(duress.emailVerified).toBe(false);
      expect(duress.providerData).toEqual([]);

      // The real user is untouched.
      expect(real.email).toBe("user@example.com");
      expect(real.displayName).toBe("Test User");
    });

    it("keeps User prototype methods reachable", () => {
      // The masking must not tempt anyone into returning a plain object:
      // consumers call getIdToken() on this.
      const real = mockUser("abc123");
      const duress = createDuressUser(real);
      expect(typeof duress.getIdToken).toBe("function");
    });

    it("does not mutate the real user uid", () => {
      const real = mockUser("uid-1");
      createDuressUser(real);
      expect(real.uid).toBe("uid-1");
    });
  });

  describe("shouldIgnoreAuthUidChange", () => {
    it("ignores token-refresh callbacks for the same uid", () => {
      expect(shouldIgnoreAuthUidChange("abc", "abc")).toBe(true);
    });

    it("does not ignore the first auth event or a real sign-out", () => {
      expect(shouldIgnoreAuthUidChange(undefined, "abc")).toBe(false);
      expect(shouldIgnoreAuthUidChange("abc", null)).toBe(false);
    });
  });
});

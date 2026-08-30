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
  } as User;
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
    it("proxies uid with _duress suffix while preserving other fields", () => {
      const real = mockUser("abc123");
      const duress = createDuressUser(real);

      expect(duress.uid).toBe("abc123_duress");
      expect(real.uid).toBe("abc123");
      expect(duress.email).toBe("user@example.com");
      expect(duress.displayName).toBe("Test User");
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

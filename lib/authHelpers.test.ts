import { describe, expect, it } from "vitest";
import type { User } from "firebase/auth";
import { authErrorMessage, createDuressUser } from "./authHelpers";

function mockUser(uid: string): User {
  return {
    uid,
    email: "user@example.com",
    displayName: "Test User",
  } as User;
}

describe("authHelpers", () => {
  describe("authErrorMessage", () => {
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
});

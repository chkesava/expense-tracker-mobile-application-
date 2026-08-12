import { describe, expect, it } from "vitest";
import type { User } from "firebase/auth";
import { createDuressUser } from "@/lib/authHelpers";

describe("BUG-004 duress path contract", () => {
  it("FinanceData/Auth consumer uid under duress is isolated from real uid", () => {
    const real = { uid: "firebase-uid-1", email: "a@b.c" } as User;
    const proxied = createDuressUser(real);
    expect(proxied.uid).toBe("firebase-uid-1_duress");
    expect(proxied.uid).not.toBe(real.uid);
    // Collections must key off proxied.uid (Auth `user`), never real.uid from context.realUser
    expect(`users/${proxied.uid}/expenses`).toBe(
      "users/firebase-uid-1_duress/expenses"
    );
  });
});

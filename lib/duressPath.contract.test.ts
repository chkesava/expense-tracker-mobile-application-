import { describe, expect, it } from "vitest";
import type { User } from "firebase/auth";
import { createDuressUser } from "@/lib/authHelpers";
import { DURESS_UID_SUFFIX, duressUid, isDuressUid } from "@/shared/utils/duress";

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

  // SPENDLY-20: the EPF cron skips duress trees server-side using
  // `isDuressUid`. That only works if the server's rule and the client's
  // proxied uid are the same rule, so pin them to each other here.
  it("auth proxy and the shared helper agree", () => {
    const real = { uid: "firebase-uid-1" } as User;
    const proxied = createDuressUser(real);
    expect(proxied.uid).toBe(duressUid(real.uid));
    expect(isDuressUid(proxied.uid)).toBe(true);
    expect(isDuressUid(real.uid)).toBe(false);
  });

  it("pins the suffix `firestore.rules` hard-codes", () => {
    // `firestore.rules` writes `request.auth.uid + '_duress'` and cannot import
    // this constant. If one side changes, this test is the only thing that
    // notices before a user's decoy tree stops matching its own rules.
    expect(DURESS_UID_SUFFIX).toBe("_duress");
  });
});

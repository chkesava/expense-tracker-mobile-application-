import { describe, expect, it } from "vitest";

import { MAX_PUSH_REFS, parsePushRequest, PUSHABLE_COLLECTIONS, pushRefFromPath } from "./pushRefs";

describe("push refs (SPENDLY-583)", () => {
  it("pushable collections are exactly the synced (Wave 1) ones", () => {
    expect([...PUSHABLE_COLLECTIONS].sort()).toEqual([
      "accountEntries", "accountPayments", "accountTransfers", "accountTypes", "accounts",
      "categories", "creditCardBills", "expenses", "incomes", "ledgerEvents",
    ]);
  });

  it("turns the signed-in user's synced document paths into refs, and nothing else", () => {
    expect(pushRefFromPath("users/u1/expenses/e1", "u1")).toEqual({ collection: "expenses", docId: "e1" });
    expect(pushRefFromPath("users/u2/expenses/e1", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1_duress/expenses/e1", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1/expenses/e1", "u1_duress")).toBeNull();
    expect(pushRefFromPath("users/u1/borrowings/b1", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1/meta/outbox/acks/x", "u1")).toBeNull();
    expect(pushRefFromPath("users/u1", "u1")).toBeNull();
  });

  it("parses refs, de-duplicates them, and caps the count", () => {
    const parsed = parsePushRequest({ refs: [{ collection: "expenses", docId: "e1" }, { collection: "expenses", docId: "e1" }] });
    expect(parsed).toEqual({ ok: true, mode: "refs", refs: [{ collection: "expenses", docId: "e1" }] });
    expect(parsePushRequest({ refs: Array.from({ length: MAX_PUSH_REFS + 1 }, (_, i) => ({ collection: "expenses", docId: `e${i}` })) }).ok).toBe(false);
    expect(parsePushRequest({ mode: "user", refs: "ignored" })).toEqual({ ok: true, mode: "user" });
  });
});

import { describe, expect, it } from "vitest";

import {
  validateSubscriptionInput,
  type SubscriptionFormValues,
} from "./subscriptionInput";

function values(
  overrides: Partial<SubscriptionFormValues> = {}
): SubscriptionFormValues {
  return {
    name: "Netflix",
    amount: "649",
    type: "subscription",
    frequency: "monthly",
    dayOfMonth: "10",
    intervalDays: "2",
    startMonth: "",
    startYear: "",
    endMonth: "",
    endYear: "",
    accountId: "acc-1",
    toAccountId: "",
    ...overrides,
  };
}

describe("validateSubscriptionInput", () => {
  it("accepts a plain monthly subscription and returns coerced values", () => {
    const result = validateSubscriptionInput(values());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe("Netflix");
    expect(result.amount).toBe(649);
    expect(result.effectiveFrequency).toBe("monthly");
    expect(result.dayOfMonth).toBe(10);
    expect(result.startKey).toBeUndefined();
  });

  it("trims the name and rejects a blank one", () => {
    const ok = validateSubscriptionInput(values({ name: "  Gym  " }));
    expect(ok.ok && ok.name).toBe("Gym");

    const bad = validateSubscriptionInput(values({ name: "   " }));
    expect(bad).toMatchObject({ ok: false, field: "name" });
  });

  it("rejects a zero, negative or unparseable amount", () => {
    for (const amount of ["0", "-5", "abc", ""]) {
      expect(validateSubscriptionInput(values({ amount }))).toMatchObject({
        ok: false,
        field: "amount",
      });
    }
  });

  describe("billing day", () => {
    it("accepts 1-31, including days that do not exist in every month", () => {
      // The auto-poster clamps to the real month length, so 31 already means
      // "last day" for existing items. Rejecting it would block their edits.
      for (const dayOfMonth of ["1", "29", "30", "31"]) {
        expect(validateSubscriptionInput(values({ dayOfMonth }))).toMatchObject({
          ok: true,
        });
      }
    });

    it("rejects out-of-range and unparseable days", () => {
      for (const dayOfMonth of ["0", "32", "abc", ""]) {
        expect(validateSubscriptionInput(values({ dayOfMonth }))).toMatchObject({
          ok: false,
          field: "dayOfMonth",
        });
      }
    });

    it("ignores the billing day entirely for an every-N-days item", () => {
      const result = validateSubscriptionInput(
        values({ frequency: "every_n_days", dayOfMonth: "99", intervalDays: "3" })
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("interval", () => {
    it("accepts 1-365 and rejects anything outside it", () => {
      const base = { frequency: "every_n_days" as const };
      expect(
        validateSubscriptionInput(values({ ...base, intervalDays: "1" })).ok
      ).toBe(true);
      expect(
        validateSubscriptionInput(values({ ...base, intervalDays: "365" })).ok
      ).toBe(true);
      for (const intervalDays of ["0", "366", "abc"]) {
        expect(
          validateSubscriptionInput(values({ ...base, intervalDays }))
        ).toMatchObject({ ok: false, field: "intervalDays" });
      }
    });
  });

  describe("first debit month", () => {
    it("builds a zero-padded YYYY-MM key", () => {
      const result = validateSubscriptionInput(
        values({ startMonth: "9", startYear: "2026" })
      );
      expect(result.ok && result.startKey).toBe("2026-09");
    });

    it("leaves startKey undefined when both fields are blank", () => {
      const result = validateSubscriptionInput(values());
      expect(result.ok && result.startKey).toBeUndefined();
    });

    it("rejects only one of the two being filled", () => {
      expect(
        validateSubscriptionInput(values({ startMonth: "9" }))
      ).toMatchObject({ ok: false, field: "start" });
      expect(
        validateSubscriptionInput(values({ startYear: "2026" }))
      ).toMatchObject({ ok: false, field: "start" });
    });

    it("rejects an out-of-range month or year", () => {
      expect(
        validateSubscriptionInput(values({ startMonth: "13", startYear: "2026" }))
      ).toMatchObject({ ok: false, field: "start" });
      expect(
        validateSubscriptionInput(values({ startMonth: "9", startYear: "1999" }))
      ).toMatchObject({ ok: false, field: "start" });
    });

    it("never builds a startKey for an every-N-days item", () => {
      // An interval item has no month concept; a startMonth would make
      // isBeforeStartMonth suppress it.
      const result = validateSubscriptionInput(
        values({
          frequency: "every_n_days",
          intervalDays: "3",
          startMonth: "9",
          startYear: "2026",
        })
      );
      expect(result.ok && result.startKey).toBeUndefined();
    });
  });

  describe("EMI final term", () => {
    const emi = { type: "emi" as const, startMonth: "9", startYear: "2026" };

    it("accepts a term on or after the first debit", () => {
      expect(
        validateSubscriptionInput(
          values({ ...emi, endMonth: "9", endYear: "2026" })
        ).ok
      ).toBe(true);
      expect(
        validateSubscriptionInput(
          values({ ...emi, endMonth: "3", endYear: "2027" })
        ).ok
      ).toBe(true);
    });

    it("rejects a term before the first debit", () => {
      expect(
        validateSubscriptionInput(
          values({ ...emi, endMonth: "8", endYear: "2026" })
        )
      ).toMatchObject({ ok: false, field: "end" });
    });

    it("rejects a malformed term", () => {
      expect(
        validateSubscriptionInput(
          values({ ...emi, endMonth: "13", endYear: "2026" })
        )
      ).toMatchObject({ ok: false, field: "end" });
    });

    it("treats an EMI as monthly even if the frequency says otherwise", () => {
      const result = validateSubscriptionInput(
        values({ type: "emi", frequency: "every_n_days", dayOfMonth: "5" })
      );
      expect(result.ok && result.effectiveFrequency).toBe("monthly");
    });
  });

  describe("transfers", () => {
    it("rejects the same account on both sides", () => {
      expect(
        validateSubscriptionInput(
          values({ type: "transfer", accountId: "a", toAccountId: "a" })
        )
      ).toMatchObject({ ok: false, field: "accounts" });
    });

    it("allows different accounts", () => {
      expect(
        validateSubscriptionInput(
          values({ type: "transfer", accountId: "a", toAccountId: "b" })
        ).ok
      ).toBe(true);
    });
  });
});

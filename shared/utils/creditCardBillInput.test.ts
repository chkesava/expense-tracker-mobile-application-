import { describe, expect, it } from "vitest";

import { validateCreditCardBillInput } from "./creditCardBillInput";

const TODAY = "2026-08-22";

const valid = {
  accountId: "cc-slice",
  statementAmount: "28101",
  minimumDue: "1405.05",
  statementDate: "2026-08-20",
  dueDate: "2026-08-25",
  periodStart: "2026-07-21",
  periodEnd: "2026-08-20",
};

const reject = (overrides: Partial<typeof valid>) =>
  validateCreditCardBillInput({ ...valid, ...overrides }, TODAY);

describe("validateCreditCardBillInput", () => {
  it("accepts a well-formed statement and coerces the amounts", () => {
    const result = validateCreditCardBillInput(valid, TODAY);
    expect(result).toEqual({
      ok: true,
      statementAmount: 28101,
      minimumDueAmount: 1405.05,
    });
  });

  it("accepts a statement closing today", () => {
    expect(
      reject({ statementDate: TODAY, dueDate: "2026-08-27", periodEnd: TODAY }).ok
    ).toBe(true);
  });

  it("treats a blank minimum due as zero", () => {
    const result = reject({ minimumDue: "" });
    expect(result).toMatchObject({ ok: true, minimumDueAmount: 0 });
  });

  it("requires a card", () => {
    expect(reject({ accountId: "   " })).toMatchObject({ ok: false });
  });

  it("rejects a non-numeric statement amount instead of passing NaN through", () => {
    expect(reject({ statementAmount: "abc" })).toMatchObject({ ok: false });
    expect(reject({ statementAmount: "" })).toMatchObject({ ok: false });
  });

  it("rejects a zero or negative statement amount", () => {
    expect(reject({ statementAmount: "0" })).toMatchObject({ ok: false });
    expect(reject({ statementAmount: "-500" })).toMatchObject({ ok: false });
  });

  it("rejects a minimum due above the statement amount", () => {
    expect(reject({ minimumDue: "30000" })).toMatchObject({ ok: false });
  });

  it("rejects a non-numeric or negative minimum due", () => {
    expect(reject({ minimumDue: "abc" })).toMatchObject({ ok: false });
    expect(reject({ minimumDue: "-1" })).toMatchObject({ ok: false });
  });

  it("rejects a malformed statement date", () => {
    expect(reject({ statementDate: "20-08-2026" })).toMatchObject({ ok: false });
    expect(reject({ statementDate: "2026-02-30" })).toMatchObject({ ok: false });
    expect(reject({ statementDate: "" })).toMatchObject({ ok: false });
  });

  // This is what made the stored-amountPaid and payment-stamping bugs reachable:
  // a statement that has not closed yet cannot be owed or settled.
  it("rejects a statement dated in the future", () => {
    const result = reject({
      statementDate: "2026-09-20",
      dueDate: "2026-09-25",
      periodEnd: "2026-09-20",
      periodStart: "2026-08-21",
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toMatch(/future/i);
  });

  it("rejects a malformed due date", () => {
    expect(reject({ dueDate: "not-a-date" })).toMatchObject({ ok: false });
  });

  it("rejects a due date before the statement date", () => {
    expect(reject({ dueDate: "2026-08-19" })).toMatchObject({ ok: false });
  });

  it("allows a due date in the future", () => {
    expect(reject({ dueDate: "2026-09-05" }).ok).toBe(true);
  });

  it("allows the billing period to be omitted", () => {
    expect(reject({ periodStart: "", periodEnd: "" }).ok).toBe(true);
  });

  it("rejects a malformed billing period", () => {
    expect(reject({ periodStart: "2026-13-01" })).toMatchObject({ ok: false });
    expect(reject({ periodEnd: "2026-08-32" })).toMatchObject({ ok: false });
  });

  it("rejects an inverted billing period", () => {
    expect(
      reject({ periodStart: "2026-08-20", periodEnd: "2026-07-21" })
    ).toMatchObject({ ok: false });
  });

  // A window running past its own close date would bill spend that belongs to
  // the next statement, double-counting it.
  it("rejects a billing period that ends after the statement date", () => {
    expect(reject({ periodEnd: "2026-08-21" })).toMatchObject({ ok: false });
  });

  it("rejects a billing period that starts after the statement date", () => {
    expect(
      reject({ periodStart: "2026-08-21", periodEnd: "" })
    ).toMatchObject({ ok: false });
  });
});

import { describe, expect, it } from "vitest";
import {
  canDeleteAccount,
  countLinkedAccountRecords,
  totalPendingSyncCount,
  validateAccountMoneyMove,
} from "./ledgerGuards";

describe("ledgerGuards", () => {
  it("sums pending sync collection counts", () => {
    expect(totalPendingSyncCount([])).toBe(0);
    expect(totalPendingSyncCount([1, 2, 3])).toBe(6);
    expect(totalPendingSyncCount([1, Number.NaN, 2])).toBe(3);
  });

  it("validates account money moves", () => {
    expect(
      validateAccountMoneyMove({
        fromAccountId: "a",
        toAccountId: "b",
        amount: 10,
        date: "2026-08-11",
      })
    ).toEqual({ ok: true });

    expect(
      validateAccountMoneyMove({
        fromAccountId: "a",
        toAccountId: "a",
        amount: 10,
        date: "2026-08-11",
      }).ok
    ).toBe(false);

    expect(
      validateAccountMoneyMove({
        fromAccountId: "a",
        toAccountId: "b",
        amount: 0,
        date: "2026-08-11",
      }).ok
    ).toBe(false);

    expect(
      validateAccountMoneyMove({
        fromAccountId: "a",
        toAccountId: "b",
        amount: 10,
        date: "2026-02-29",
      }).ok
    ).toBe(false);
  });

  it("blocks account delete when linked records exist", () => {
    expect(countLinkedAccountRecords([1, 0, 2])).toBe(3);
    expect(canDeleteAccount(0)).toBe(true);
    expect(canDeleteAccount(3)).toBe(false);
  });
});

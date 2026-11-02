import { describe, expect, it } from "vitest";
import {
  LEND_SOURCE_ALREADY_DEDUCTED,
  isAlreadyDeducted,
  lockLendSource,
  normalizeLendSource,
  resolveLendSource,
} from "./receivableSource";

describe("SPENDLY-668 resolveLendSource", () => {
  it("maps an account pick to an account-backed source", () => {
    expect(resolveLendSource("hdfc")).toEqual({
      ok: true,
      fields: { sourceMode: "account", sourceAccountId: "hdfc" },
    });
  });

  it("maps None to an already-deducted source with no account", () => {
    expect(resolveLendSource(LEND_SOURCE_ALREADY_DEDUCTED)).toEqual({
      ok: true,
      fields: { sourceMode: "already_deducted", sourceAccountId: null },
    });
  });

  it("still requires a choice", () => {
    expect(resolveLendSource("").ok).toBe(false);
    expect(resolveLendSource("  ").ok).toBe(false);
  });
});

describe("SPENDLY-668 isAlreadyDeducted", () => {
  it("is only true for the explicit mode; legacy rows read as account-backed", () => {
    expect(isAlreadyDeducted({ sourceMode: "already_deducted" })).toBe(true);
    expect(isAlreadyDeducted({ sourceMode: "account" })).toBe(false);
    expect(isAlreadyDeducted({})).toBe(false);
  });
});

describe("SPENDLY-668 normalizeLendSource", () => {
  it("drops an account from an already-deducted lend", () => {
    expect(
      normalizeLendSource({ sourceMode: "already_deducted", sourceAccountId: "hdfc" })
    ).toEqual({ sourceMode: "already_deducted", sourceAccountId: null });
  });

  it("leaves account-backed and legacy lends alone", () => {
    const row = { sourceMode: "account" as const, sourceAccountId: "hdfc" };
    expect(normalizeLendSource(row)).toBe(row);
    const legacy = { sourceAccountId: "hdfc" };
    expect(normalizeLendSource(legacy)).toBe(legacy);
  });
});

describe("SPENDLY-668 lockLendSource", () => {
  it("never lets an edit attach an account to an already-deducted lend", () => {
    expect(
      lockLendSource(
        { sourceMode: "already_deducted" },
        { sourceAccountId: "hdfc", sourceMode: "account", originalAmount: 900 }
      )
    ).toEqual({ originalAmount: 900 });
  });

  it("never lets an edit switch an account-backed lend to already deducted", () => {
    expect(
      lockLendSource(
        { sourceMode: "account" },
        { sourceMode: "already_deducted", sourceAccountId: "icici" }
      )
    ).toEqual({ sourceAccountId: "icici" });
  });

  it("passes ordinary edits through untouched", () => {
    const updates = { originalAmount: 500 };
    expect(lockLendSource({}, updates)).toBe(updates);
  });
});

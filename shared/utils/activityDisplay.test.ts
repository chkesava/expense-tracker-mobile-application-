import { describe, expect, it } from "vitest";
import {
  accountKindSubtitle,
  activitySubtypeLabel,
  activityTitle,
  formatActivityDateLabel,
  formatClockLabel,
  resolveActivityClockTime,
} from "./activityDisplay";

describe("activityDisplay", () => {
  it("formats ledger dates like the account screen reference", () => {
    expect(formatActivityDateLabel("2026-08-17")).toBe("17 Aug 2026");
    expect(formatActivityDateLabel("2026-08-16")).toBe("16 Aug 2026");
  });

  it("formats 24h and 12h clock strings with padded hours", () => {
    expect(formatClockLabel("09:35")).toBe("09:35 AM");
    expect(formatClockLabel("21:12")).toBe("09:12 PM");
    expect(formatClockLabel("12:00 pm")).toBe("12:00 PM");
    expect(formatClockLabel("00:05")).toBe("12:05 AM");
  });

  it("prefers explicit time over createdAt", () => {
    expect(
      resolveActivityClockTime("08:12", new Date("2026-08-16T17:47:00"))
    ).toBe("08:12 AM");
  });

  it("uses createdAt only when it has a real time of day", () => {
    expect(resolveActivityClockTime(undefined, new Date("2026-08-16T17:47:00"))).toBe(
      "05:47 PM"
    );
    expect(resolveActivityClockTime(undefined, new Date("2026-08-16T00:00:00"))).toBe(
      undefined
    );
    expect(resolveActivityClockTime(undefined, undefined)).toBeUndefined();
  });

  it("labels transfer vs category subtypes without inventing titles", () => {
    expect(activityTitle({ note: "Dokra money" })).toBe("Dokra money");
    expect(
      activitySubtypeLabel({
        type: "credit",
        isTransfer: true,
        category: "Health",
      })
    ).toBe("Transfer");
    expect(
      activitySubtypeLabel({
        type: "debit",
        category: "Health",
      })
    ).toBe("Health");
  });

  it("uses a personal-account subtitle for bank-like accounts", () => {
    expect(accountKindSubtitle(false, "Bank")).toBe("Personal Account");
    expect(accountKindSubtitle(true, "Credit Card")).toBe("Credit Card");
    expect(accountKindSubtitle(false, "Cash")).toBe("Cash Account");
  });
});

import { describe, expect, it } from "vitest";

import { DPDP_NOTICE_VERSION } from "../../lib/dpdpConfig";
import {
  buildAcceptedConsent,
  needsNoticeAcceptance,
  parseDpdpConsent,
  redactSensitiveUserFields,
} from "./dpdpConsent";

describe("parseDpdpConsent", () => {
  it("returns null when dpdp is missing", () => {
    expect(parseDpdpConsent({ email: "a@b.com" })).toBeNull();
    expect(parseDpdpConsent(null)).toBeNull();
  });

  it("parses a stored consent record", () => {
    const consent = parseDpdpConsent({
      dpdp: {
        noticeVersion: "1.0",
        acceptedAt: "2026-08-18T00:00:00.000Z",
        isAdult: true,
        purposes: { core: true, sms: true, nutritionAi: false, notifications: false },
      },
    });
    expect(consent?.purposes.sms).toBe(true);
    expect(consent?.purposes.nutritionAi).toBe(false);
    expect(consent?.isAdult).toBe(true);
  });
});

describe("needsNoticeAcceptance", () => {
  it("requires acceptance when missing, under-age, stale version, or no core purpose", () => {
    expect(needsNoticeAcceptance(null)).toBe(true);
    expect(
      needsNoticeAcceptance({
        noticeVersion: DPDP_NOTICE_VERSION,
        acceptedAt: "2026-01-01T00:00:00.000Z",
        isAdult: false,
        purposes: { core: true, sms: false, nutritionAi: false, notifications: false },
      })
    ).toBe(true);
    expect(
      needsNoticeAcceptance({
        noticeVersion: "0.9",
        acceptedAt: "2026-01-01T00:00:00.000Z",
        isAdult: true,
        purposes: { core: true, sms: false, nutritionAi: false, notifications: false },
      })
    ).toBe(true);
    expect(
      needsNoticeAcceptance({
        noticeVersion: DPDP_NOTICE_VERSION,
        acceptedAt: "2026-01-01T00:00:00.000Z",
        isAdult: true,
        purposes: { core: false, sms: false, nutritionAi: false, notifications: false },
      })
    ).toBe(true);
  });

  it("is satisfied by a current adult core consent", () => {
    expect(
      needsNoticeAcceptance({
        noticeVersion: DPDP_NOTICE_VERSION,
        acceptedAt: "2026-01-01T00:00:00.000Z",
        isAdult: true,
        purposes: { core: true, sms: false, nutritionAi: false, notifications: false },
      })
    ).toBe(false);
  });
});

describe("buildAcceptedConsent", () => {
  it("sets current notice version and preserves optional purposes", () => {
    const next = buildAcceptedConsent({
      noticeVersion: "0.9",
      acceptedAt: "2020-01-01T00:00:00.000Z",
      isAdult: true,
      purposes: { core: true, sms: true, nutritionAi: true, notifications: false },
    });
    expect(next.noticeVersion).toBe(DPDP_NOTICE_VERSION);
    expect(next.purposes.core).toBe(true);
    expect(next.purposes.sms).toBe(true);
    expect(next.purposes.nutritionAi).toBe(true);
  });
});

describe("redactSensitiveUserFields", () => {
  it("drops PIN hashes and keeps the rest", () => {
    expect(
      redactSensitiveUserFields({
        email: "a@b.com",
        privacyPin: "abc",
        fakePin: "def",
        upiId: "name@upi",
      })
    ).toEqual({ email: "a@b.com", upiId: "name@upi" });
  });
});

import { describe, expect, it } from "vitest";

import {
  buildDeviceFields,
  deviceWriteNeeded,
  isExpoPushToken,
  isInstallId,
  parseRegistrationRecord,
  pushRegistrationSkipReason,
} from "./pushDevice";

const TOKEN = "ExponentPushToken[abcDEF123456xyz]";

describe("isExpoPushToken", () => {
  it("accepts Expo push tokens", () => {
    expect(isExpoPushToken(TOKEN)).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abcDEF123456xyz]")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const t of ["", "abc", "ExponentPushToken[]", "ExponentPushToken[a b c d e f g h]", "fcm-raw-token", 42, null]) {
      expect(isExpoPushToken(t)).toBe(false);
    }
  });
});

describe("isInstallId", () => {
  it("accepts generated ids and rejects path-like or short ones", () => {
    expect(isInstallId("a1B2c3D4e5F6g7H8")).toBe(true);
    expect(isInstallId("short")).toBe(false);
    expect(isInstallId("../../users/x/devices")).toBe(false);
  });
});

describe("buildDeviceFields", () => {
  it("builds the Spendly device document fields", () => {
    expect(buildDeviceFields({ token: TOKEN, platform: "android", appVersion: "5.1.0", locale: "en-IN" })).toEqual({
      token: TOKEN,
      tokenType: "expo",
      platform: "android",
      product: "expense",
      appVersion: "5.1.0",
      locale: "en-IN",
    });
  });

  it("fills and clips missing or oversized values", () => {
    const f = buildDeviceFields({ token: TOKEN, platform: "ios", appVersion: null, locale: "x".repeat(80) });
    expect(f.appVersion).toBe("unknown");
    expect(f.locale).toHaveLength(35);
  });
});

describe("pushRegistrationSkipReason", () => {
  const ok = {
    uid: "u1",
    platform: "android",
    activeProduct: "expense",
    localTestBuild: false,
    expoGo: false,
    duress: false,
    permissionGranted: true,
  };

  it("registers a signed-in Expense or combined build with permission", () => {
    expect(pushRegistrationSkipReason(ok)).toBeNull();
    expect(pushRegistrationSkipReason({ ...ok, activeProduct: null })).toBeNull();
    expect(pushRegistrationSkipReason({ ...ok, platform: "ios" })).toBeNull();
  });

  it.each([
    [{ uid: null }, "signed-out"],
    [{ platform: "web" }, "web"],
    [{ activeProduct: "ganesh" }, "not-spendly"],
    [{ activeProduct: "nutrition" }, "not-spendly"],
    [{ localTestBuild: true }, "local-test-build"],
    [{ expoGo: true }, "expo-go"],
    [{ duress: true }, "duress"],
    [{ permissionGranted: false }, "no-permission"],
  ] as const)("skips %o as %s", (patch, reason) => {
    expect(pushRegistrationSkipReason({ ...ok, ...patch })).toBe(reason);
  });
});

describe("deviceWriteNeeded", () => {
  const fields = buildDeviceFields({ token: TOKEN, platform: "android", appVersion: "5.1.0", locale: "en-IN" });
  const record = { uid: "u1", token: TOKEN, appVersion: "5.1.0", locale: "en-IN", writtenOn: "2026-11-06" };

  it("creates for a new install or a different user", () => {
    expect(deviceWriteNeeded(null, { uid: "u1", fields, today: "2026-11-06" })).toBe("create");
    expect(deviceWriteNeeded(record, { uid: "u2", fields, today: "2026-11-06" })).toBe("create");
  });

  it("refreshes when the token, version or locale changed, or once a day", () => {
    expect(deviceWriteNeeded({ ...record, token: "ExponentPushToken[oldOLD123456]" }, { uid: "u1", fields, today: "2026-11-06" })).toBe("refresh");
    expect(deviceWriteNeeded({ ...record, appVersion: "5.0.9" }, { uid: "u1", fields, today: "2026-11-06" })).toBe("refresh");
    expect(deviceWriteNeeded({ ...record, locale: "te-IN" }, { uid: "u1", fields, today: "2026-11-06" })).toBe("refresh");
    expect(deviceWriteNeeded(record, { uid: "u1", fields, today: "2026-11-07" })).toBe("refresh");
  });

  it("does nothing when unchanged on the same day", () => {
    expect(deviceWriteNeeded(record, { uid: "u1", fields, today: "2026-11-06" })).toBe("none");
  });
});

describe("parseRegistrationRecord", () => {
  it("reads a stored record and rejects bad input", () => {
    const rec = { uid: "u1", token: TOKEN, appVersion: "1", locale: "en", writtenOn: "2026-11-06" };
    expect(parseRegistrationRecord(JSON.stringify(rec))).toEqual(rec);
    expect(parseRegistrationRecord(null)).toBeNull();
    expect(parseRegistrationRecord("{not json")).toBeNull();
    expect(parseRegistrationRecord(JSON.stringify({ uid: "u1" }))).toBeNull();
  });
});

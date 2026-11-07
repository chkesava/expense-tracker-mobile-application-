import { describe, expect, it } from "vitest";

import { PERMISSION_COPY, nextPermissionStep, toPermissionState } from "./permissionFlow";

describe("toPermissionState", () => {
  it("maps the phone's answer", () => {
    expect(toPermissionState({ platform: "android", status: "granted", canAskAgain: true })).toBe("granted");
    expect(toPermissionState({ platform: "android", status: "undetermined", canAskAgain: true })).toBe("undetermined");
    expect(toPermissionState({ platform: "ios", status: "denied", canAskAgain: true })).toBe("denied");
    expect(toPermissionState({ platform: "android", status: "denied", canAskAgain: false })).toBe("blocked");
    expect(toPermissionState({ platform: "web", status: "granted" })).toBe("unavailable");
  });
});

describe("nextPermissionStep", () => {
  const now = Date.parse("2026-11-07T00:00:00Z");
  const day = 86_400_000;

  it("explains first whenever the phone can still ask", () => {
    expect(nextPermissionStep("undetermined", { explicit: true, nowMs: now })).toBe("pre-prompt");
    expect(nextPermissionStep("denied", { explicit: true, nowMs: now })).toBe("pre-prompt");
  });

  it("offers Open settings once the phone won't ask again", () => {
    expect(nextPermissionStep("blocked", { explicit: true, nowMs: now })).toBe("open-settings");
  });

  it("does nothing when granted or on the web", () => {
    expect(nextPermissionStep("granted", { explicit: true, nowMs: now })).toBe("none");
    expect(nextPermissionStep("unavailable", { explicit: true, nowMs: now })).toBe("unavailable");
  });

  it("an automatic ask waits 14 days after Not now; one the user started doesn't", () => {
    expect(nextPermissionStep("undetermined", { explicit: false, lastDeclinedMs: now - 13 * day, nowMs: now })).toBe("snoozed");
    expect(nextPermissionStep("undetermined", { explicit: false, lastDeclinedMs: now - 15 * day, nowMs: now })).toBe("pre-prompt");
    expect(nextPermissionStep("undetermined", { explicit: true, lastDeclinedMs: now - 1 * day, nowMs: now })).toBe("pre-prompt");
  });

  it("has an explanation for every reason", () => {
    for (const copy of Object.values(PERMISSION_COPY)) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.message.length).toBeGreaterThan(0);
    }
  });
});

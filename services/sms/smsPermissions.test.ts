import { describe, expect, it } from "vitest";

import { SMS_AUTOMATION_PREFS_DEFAULTS } from "@/services/sms/smsAutomationPrefs";
import {
  ANDROID_PERMISSION_RESULTS,
  resolveSmsCheckDetails,
  resolveSmsCheckStatus,
  resolveSmsRequestStatus,
} from "@/services/sms/smsPermissionStatus";
import { isSmsPermissionGranted } from "@/services/sms/smsPermissions";
import { stubSmsReader } from "@/services/sms/smsReader";

describe("sms permission helpers", () => {
  it("treats only granted as allowed", () => {
    expect(isSmsPermissionGranted("granted")).toBe(true);
    expect(isSmsPermissionGranted("denied")).toBe(false);
    expect(isSmsPermissionGranted("blocked")).toBe(false);
    expect(isSmsPermissionGranted("unavailable")).toBe(false);
  });
});

describe("sms permission check — READ_SMS and RECEIVE_SMS", () => {
  it("permission granted when both Android SMS permissions are present", () => {
    const details = resolveSmsCheckDetails({
      platformSupported: true,
      readGranted: true,
      receiveGranted: true,
    });
    expect(details.status).toBe("granted");
    expect(details.readSms).toBe(true);
    expect(details.receiveSms).toBe(true);
    expect(resolveSmsRequestStatus({
      platformSupported: true,
      readResult: ANDROID_PERMISSION_RESULTS.GRANTED,
      receiveResult: ANDROID_PERMISSION_RESULTS.GRANTED,
    })).toBe("granted");
  });

  it("permission denied when the user refuses the system prompt", () => {
    expect(
      resolveSmsRequestStatus({
        platformSupported: true,
        readResult: ANDROID_PERMISSION_RESULTS.DENIED,
        receiveResult: ANDROID_PERMISSION_RESULTS.DENIED,
      })
    ).toBe("denied");
    expect(
      resolveSmsCheckStatus({
        platformSupported: true,
        readGranted: false,
        receiveGranted: false,
      })
    ).toBe("denied");
  });

  it("permission denied if only one of READ_SMS or RECEIVE_SMS is granted", () => {
    expect(
      resolveSmsCheckStatus({
        platformSupported: true,
        readGranted: true,
        receiveGranted: false,
      })
    ).toBe("denied");
    expect(
      resolveSmsCheckDetails({
        platformSupported: true,
        readGranted: false,
        receiveGranted: true,
      })
    ).toMatchObject({
      status: "denied",
      readSms: false,
      receiveSms: true,
    });
  });

  it("permission revoked when a later check no longer has both grants", () => {
    const before = resolveSmsCheckStatus({
      platformSupported: true,
      readGranted: true,
      receiveGranted: true,
    });
    expect(before).toBe("granted");

    const after = resolveSmsCheckDetails({
      platformSupported: true,
      readGranted: false,
      receiveGranted: true,
    });
    expect(after.status).toBe("denied");
    expect(after.readSms).toBe(false);
  });

  it("no SMS permission on platforms that do not support it", () => {
    expect(
      resolveSmsCheckStatus({
        platformSupported: false,
        readGranted: false,
        receiveGranted: false,
      })
    ).toBe("unavailable");
    expect(
      resolveSmsCheckDetails({
        platformSupported: false,
        readGranted: true,
        receiveGranted: true,
      })
    ).toEqual({
      status: "unavailable",
      readSms: false,
      receiveSms: false,
    });
    expect(
      resolveSmsRequestStatus({
        platformSupported: false,
        readResult: ANDROID_PERMISSION_RESULTS.GRANTED,
        receiveResult: ANDROID_PERMISSION_RESULTS.GRANTED,
      })
    ).toBe("unavailable");
  });

  it("maps never-ask-again to blocked", () => {
    expect(
      resolveSmsRequestStatus({
        platformSupported: true,
        readResult: ANDROID_PERMISSION_RESULTS.GRANTED,
        receiveResult: ANDROID_PERMISSION_RESULTS.NEVER_ASK_AGAIN,
      })
    ).toBe("blocked");
  });
});

describe("sms reader without permission", () => {
  it("does not read messages when SMS access is unavailable", async () => {
    expect(stubSmsReader.getCapability().supported).toBe(false);
    expect(await stubSmsReader.hasPermission()).toBe(false);
    expect(await stubSmsReader.requestPermission()).toBe(false);
    expect(await stubSmsReader.readMessages()).toEqual([]);
  });
});

describe("sms automation prefs defaults", () => {
  it("starts disabled with review-before-adding on", () => {
    expect(SMS_AUTOMATION_PREFS_DEFAULTS.enabled).toBe(false);
    expect(SMS_AUTOMATION_PREFS_DEFAULTS.handlingMode).toBe("review");
    expect(SMS_AUTOMATION_PREFS_DEFAULTS.autoAdd).toBe(false);
    expect(SMS_AUTOMATION_PREFS_DEFAULTS.reviewBeforeAdding).toBe(true);
  });
});

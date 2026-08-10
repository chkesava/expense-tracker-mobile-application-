import { describe, expect, it } from "vitest";

import {
  SMS_AUTOMATION_PREFS_DEFAULTS,
  type SmsAutomationPrefs,
} from "@/services/sms/smsAutomationPrefs";
import { isSmsPermissionGranted } from "@/services/sms/smsPermissions";

describe("sms permission helpers", () => {
  it("treats only granted as allowed", () => {
    expect(isSmsPermissionGranted("granted")).toBe(true);
    expect(isSmsPermissionGranted("denied")).toBe(false);
    expect(isSmsPermissionGranted("blocked")).toBe(false);
    expect(isSmsPermissionGranted("unavailable")).toBe(false);
  });
});

describe("sms automation prefs defaults", () => {
  it("starts disabled with review-before-adding on", () => {
    const prefs: SmsAutomationPrefs = { ...SMS_AUTOMATION_PREFS_DEFAULTS };
    expect(prefs.enabled).toBe(false);
    expect(prefs.autoAdd).toBe(false);
    expect(prefs.reviewBeforeAdding).toBe(true);
  });
});

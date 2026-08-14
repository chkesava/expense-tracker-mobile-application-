/**
 * Pure SMS permission status rules.
 * Native code calls PermissionsAndroid; tests cover grant / deny / revoke / none.
 */

export type SmsPermissionStatus =
  | "granted"
  | "denied"
  | "blocked"
  | "unavailable";

export type SmsPermissionDetails = {
  status: SmsPermissionStatus;
  readSms: boolean;
  receiveSms: boolean;
};

/** Android PermissionsAndroid.RESULTS values. */
export const ANDROID_PERMISSION_RESULTS = {
  GRANTED: "granted",
  DENIED: "denied",
  NEVER_ASK_AGAIN: "never_ask_again",
} as const;

export function emptySmsPermissionDetails(
  status: SmsPermissionStatus = "unavailable"
): SmsPermissionDetails {
  return { status, readSms: false, receiveSms: false };
}

/**
 * Runtime check: both READ_SMS and RECEIVE_SMS must be granted.
 * A later check that returns false after a grant is treated as revoked → denied.
 */
export function resolveSmsCheckStatus(input: {
  platformSupported: boolean;
  readGranted: boolean;
  receiveGranted: boolean;
}): SmsPermissionStatus {
  if (!input.platformSupported) return "unavailable";
  if (input.readGranted && input.receiveGranted) return "granted";
  return "denied";
}

export function resolveSmsCheckDetails(input: {
  platformSupported: boolean;
  readGranted: boolean;
  receiveGranted: boolean;
}): SmsPermissionDetails {
  const status = resolveSmsCheckStatus(input);
  if (status === "unavailable") {
    return emptySmsPermissionDetails("unavailable");
  }
  return {
    status,
    readSms: input.readGranted,
    receiveSms: input.receiveGranted,
  };
}

export function resolveSmsRequestStatus(input: {
  platformSupported: boolean;
  readResult?: string;
  receiveResult?: string;
}): SmsPermissionStatus {
  if (!input.platformSupported) return "unavailable";
  const granted = ANDROID_PERMISSION_RESULTS.GRANTED;
  const neverAsk = ANDROID_PERMISSION_RESULTS.NEVER_ASK_AGAIN;
  if (input.readResult === granted && input.receiveResult === granted) {
    return "granted";
  }
  if (input.readResult === neverAsk || input.receiveResult === neverAsk) {
    return "blocked";
  }
  return "denied";
}

export function isSmsPermissionGranted(status: SmsPermissionStatus): boolean {
  return status === "granted";
}

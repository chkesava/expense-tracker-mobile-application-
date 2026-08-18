/**
 * Android runtime SMS permission helpers (PermissionsAndroid).
 * Checks and requests both READ_SMS and RECEIVE_SMS.
 */

import {
  Linking,
  PermissionsAndroid,
  Platform,
  type Permission,
} from "react-native";

import {
  emptySmsPermissionDetails,
  resolveSmsCheckDetails,
  resolveSmsRequestStatus,
  type SmsPermissionDetails,
  type SmsPermissionStatus,
} from "./smsPermissionStatus";

export type { SmsPermissionDetails, SmsPermissionStatus } from "./smsPermissionStatus";
export {
  emptySmsPermissionDetails,
  isSmsPermissionGranted,
} from "./smsPermissionStatus";

function isAndroid(): boolean {
  return Platform.OS === "android";
}

function smsPermissionKeys(): { read: Permission; receive: Permission } | null {
  if (!isAndroid()) return null;
  const read = PermissionsAndroid.PERMISSIONS.READ_SMS;
  const receive = PermissionsAndroid.PERMISSIONS.RECEIVE_SMS;
  if (!read || !receive) return null;
  return { read, receive };
}

export function getSmsPermissionPlatformStatus(): SmsPermissionStatus | "supported" {
  if (!isAndroid() || !smsPermissionKeys()) return "unavailable";
  return "supported";
}

export async function checkSmsPermissionDetails(): Promise<SmsPermissionDetails> {
  const keys = smsPermissionKeys();
  if (!keys) return emptySmsPermissionDetails("unavailable");

  try {
    const [readGranted, receiveGranted] = await Promise.all([
      PermissionsAndroid.check(keys.read),
      PermissionsAndroid.check(keys.receive),
    ]);
    return resolveSmsCheckDetails({
      platformSupported: true,
      readGranted,
      receiveGranted,
    });
  } catch {
    return emptySmsPermissionDetails("denied");
  }
}

export async function checkSmsPermission(): Promise<SmsPermissionStatus> {
  const details = await checkSmsPermissionDetails();
  return details.status;
}

const SMS_RATIONALE = {
  title: "SMS access for transaction tracking",
  message:
    "Spendly reads bank and UPI SMS on this device to detect transactions. Raw SMS stays on the device and is not uploaded.",
  buttonPositive: "Allow",
  buttonNegative: "Deny",
} as const;

export async function requestSmsPermission(): Promise<SmsPermissionStatus> {
  const keys = smsPermissionKeys();
  if (!keys) return "unavailable";

  try {
    const readResult = await PermissionsAndroid.request(keys.read, SMS_RATIONALE);
    const receiveResult = await PermissionsAndroid.request(
      keys.receive,
      SMS_RATIONALE
    );
    return resolveSmsRequestStatus({
      platformSupported: true,
      readResult,
      receiveResult,
    });
  } catch {
    return "denied";
  }
}

export async function openSmsPermissionSettings(): Promise<void> {
  await Linking.openSettings();
}

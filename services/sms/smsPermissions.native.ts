/**
 * Android runtime SMS permission helpers (PermissionsAndroid).
 * Phase 1: grant / check / open settings to revoke. No inbox reads.
 */

import {
  Linking,
  PermissionsAndroid,
  Platform,
  type Permission,
} from "react-native";

export type SmsPermissionStatus =
  | "granted"
  | "denied"
  | "blocked"
  | "unavailable";

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

export async function checkSmsPermission(): Promise<SmsPermissionStatus> {
  const keys = smsPermissionKeys();
  if (!keys) return "unavailable";

  try {
    const readGranted = await PermissionsAndroid.check(keys.read);
    return readGranted ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export async function requestSmsPermission(): Promise<SmsPermissionStatus> {
  const keys = smsPermissionKeys();
  if (!keys) return "unavailable";

  try {
    const result = await PermissionsAndroid.requestMultiple([
      keys.read,
      keys.receive,
    ]);

    const read = result[keys.read];
    const receive = result[keys.receive];

    if (
      read === PermissionsAndroid.RESULTS.GRANTED &&
      receive === PermissionsAndroid.RESULTS.GRANTED
    ) {
      return "granted";
    }

    if (
      read === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
      receive === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
    ) {
      return "blocked";
    }

    return "denied";
  } catch {
    return "denied";
  }
}

export async function openSmsPermissionSettings(): Promise<void> {
  await Linking.openSettings();
}

export function isSmsPermissionGranted(status: SmsPermissionStatus): boolean {
  return status === "granted";
}

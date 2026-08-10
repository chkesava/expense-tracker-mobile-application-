/**
 * SMS permission status types + web/default stubs.
 * Native Android implementation: `smsPermissions.native.ts`.
 */

export type SmsPermissionStatus =
  | "granted"
  | "denied"
  | "blocked"
  | "unavailable";

export function getSmsPermissionPlatformStatus(): SmsPermissionStatus | "supported" {
  return "unavailable";
}

export async function checkSmsPermission(): Promise<SmsPermissionStatus> {
  return "unavailable";
}

export async function requestSmsPermission(): Promise<SmsPermissionStatus> {
  return "unavailable";
}

export async function openSmsPermissionSettings(): Promise<void> {
  // no-op on web / node
}

export function isSmsPermissionGranted(status: SmsPermissionStatus): boolean {
  return status === "granted";
}

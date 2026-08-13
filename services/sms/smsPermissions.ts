/**
 * SMS permission status types + web/default stubs.
 * Native Android implementation: `smsPermissions.native.ts`.
 */

import {
  emptySmsPermissionDetails,
  type SmsPermissionDetails,
  type SmsPermissionStatus,
} from "./smsPermissionStatus";

export type { SmsPermissionDetails, SmsPermissionStatus } from "./smsPermissionStatus";
export {
  emptySmsPermissionDetails,
  isSmsPermissionGranted,
} from "./smsPermissionStatus";

export function getSmsPermissionPlatformStatus(): SmsPermissionStatus | "supported" {
  return "unavailable";
}

export async function checkSmsPermissionDetails(): Promise<SmsPermissionDetails> {
  return emptySmsPermissionDetails("unavailable");
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

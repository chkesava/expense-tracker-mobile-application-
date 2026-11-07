/**
 * When and how Spendly asks for notification permission (SPENDLY-225).
 *
 * - Never on launch, never from background work: only when the user turns
 *   something on (a reminder switch, the Notifications card), and always with
 *   a short explanation first (the system dialog can only be shown a couple of
 *   times on Android 13+ before the phone stops asking for good).
 * - Once the phone won't ask again ("blocked"), the app offers "Open settings"
 *   instead of a dead switch.
 * - "Not now" is remembered: an automatic ask (not one the user started)
 *   waits at least 14 days.
 */

export type PermissionState = "granted" | "undetermined" | "denied" | "blocked" | "unavailable";

export const PERMISSION_SNOOZE_DAYS = 14;

/** expo-notifications' permission response → our state. */
export function toPermissionState(input: { platform: string; status?: string; canAskAgain?: boolean }): PermissionState {
  if (input.platform !== "android" && input.platform !== "ios") return "unavailable";
  if (input.status === "granted") return "granted";
  if (input.canAskAgain === false) return "blocked";
  return input.status === "denied" ? "denied" : "undetermined";
}

export type PermissionStep = "none" | "pre-prompt" | "open-settings" | "snoozed" | "unavailable";

export function nextPermissionStep(
  state: PermissionState,
  opts: { explicit: boolean; lastDeclinedMs?: number | null; nowMs: number }
): PermissionStep {
  if (state === "granted") return "none";
  if (state === "unavailable") return "unavailable";
  if (state === "blocked") return "open-settings";
  if (!opts.explicit && opts.lastDeclinedMs && opts.nowMs - opts.lastDeclinedMs < PERMISSION_SNOOZE_DAYS * 86_400_000) return "snoozed";
  return "pre-prompt";
}

export type PermissionReason = "bills" | "calendar" | "goals" | "general";

/** The explanation shown before the system dialog, in Spendly's voice. */
export const PERMISSION_COPY: Record<PermissionReason, { title: string; message: string }> = {
  bills: {
    title: "Get bill reminders on your phone?",
    message: "Spendly reminds you before a card bill is due, and stops as soon as it's paid. Allow notifications to get them.",
  },
  calendar: {
    title: "Get calendar reminders on your phone?",
    message: "Spendly reminds you about what you've planned, and about loans, money owed and payments due. Allow notifications to get them.",
  },
  goals: {
    title: "Get savings goal nudges?",
    message: "Spendly can nudge you to save for your goals and tell you when one has gone quiet. Allow notifications to get them.",
  },
  general: {
    title: "Turn on Spendly notifications?",
    message: "Reminders before bills are due, updates on your SIPs, EPF and shared money, and nothing else. You choose which ones in Settings.",
  },
};

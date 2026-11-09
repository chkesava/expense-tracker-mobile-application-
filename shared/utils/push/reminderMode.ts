/**
 * Who delivers this phone's reminders (SPENDLY-693): the server push or the
 * on-device scheduler. Never both (no duplicates), and never neither while
 * the server isn't sending (no silent gap).
 *
 * Push only when BOTH:
 * - push reminders are live for this user: `system_settings/global.pushRemindersLive`
 *   (everyone), or the user is in `pushRemindersLiveFor` (the staged rollout's
 *   testers, SPENDLY-233). Set by the owner at switch-on (go-live checklist
 *   C4) and turned off again with the kill switch, so phones fall back to
 *   their own reminders; and
 * - this install is registered for the signed-in user with notification
 *   permission (SPENDLY-224).
 * Otherwise the phone keeps scheduling its own reminders, as before.
 */

export type ReminderMode = "push" | "local";

export function pushRemindersLiveForUser(input: { pushRemindersLive: unknown; pushRemindersLiveFor?: unknown; uid: string | null | undefined }): boolean {
  if (input.pushRemindersLive === true) return true;
  return Boolean(input.uid) && Array.isArray(input.pushRemindersLiveFor) && input.pushRemindersLiveFor.includes(input.uid);
}

export function reminderMode(input: {
  pushRemindersLive: unknown;
  pushRemindersLiveFor?: unknown;
  uid?: string | null;
  registeredForUser: boolean;
  permissionGranted: boolean;
}): ReminderMode {
  const live = pushRemindersLiveForUser({ pushRemindersLive: input.pushRemindersLive, pushRemindersLiveFor: input.pushRemindersLiveFor, uid: input.uid });
  return live && input.registeredForUser && input.permissionGranted ? "push" : "local";
}

/**
 * SPENDLY-746 (epic SPENDLY-735): whether a local reminder scheduler (calendar,
 * goals) may load its data. Only once the mode is known and it is "local": in
 * push mode the server sends the reminders, so the phone neither schedules
 * nor keeps listeners for them; while the mode is unknown it waits (it never
 * cancels or schedules on a guess either).
 */
export function localReminderSourcesEnabled(input: { mode: ReminderMode; loading: boolean }): boolean {
  return !input.loading && input.mode === "local";
}

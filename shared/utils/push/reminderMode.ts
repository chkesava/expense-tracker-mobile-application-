/**
 * Who delivers this phone's reminders (SPENDLY-693): the server push or the
 * on-device scheduler. Never both (no duplicates), and never neither while
 * the server isn't sending (no silent gap).
 *
 * Push only when BOTH:
 * - push reminders are live: `system_settings/global.pushRemindersLive`, set
 *   by the owner at switch-on (go-live checklist C4) and turned off again
 *   with the kill switch, so phones fall back to their own reminders; and
 * - this install is registered for the signed-in user with notification
 *   permission (SPENDLY-224).
 * Otherwise the phone keeps scheduling its own reminders, as before.
 */

export type ReminderMode = "push" | "local";

export function reminderMode(input: { pushRemindersLive: unknown; registeredForUser: boolean; permissionGranted: boolean }): ReminderMode {
  return input.pushRemindersLive === true && input.registeredForUser && input.permissionGranted ? "push" : "local";
}

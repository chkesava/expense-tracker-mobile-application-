/**
 * SPENDLY-606/615 — the Save Goals screen flag and its staged rollout.
 *
 * `system_settings/global` is admin-only (clients can only read it):
 *   - `enableSaveGoalsFor: string[]` — internal / staged users by uid
 *     (stages 1 and 2 of docs/features/save-goals/ROLLOUT.md);
 *   - `enableSaveGoals: true` — everyone (stage 3).
 * Development builds always show the screens.
 *
 * The flag gates screens only: goal writes always use the audited model, so
 * turning it off (rollback) leaves every goal readable by the dashboard widget,
 * the Money section, the optimizer and the calendar.
 */
export function saveGoalsEnabled(
  system: { enableSaveGoals?: unknown; enableSaveGoalsFor?: unknown },
  isDev: boolean,
  uid?: string | null
): boolean {
  if (isDev || system.enableSaveGoals === true) return true;
  return Boolean(uid) && Array.isArray(system.enableSaveGoalsFor) && system.enableSaveGoalsFor.includes(uid);
}

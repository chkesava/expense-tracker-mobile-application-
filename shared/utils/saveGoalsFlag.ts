/** SPENDLY-606 — Save Goals screen flag. Off by default; always on in development. */
export function saveGoalsEnabled(system: { enableSaveGoals?: unknown }, isDev: boolean): boolean {
  return isDev || system.enableSaveGoals === true;
}

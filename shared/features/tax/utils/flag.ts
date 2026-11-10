/**
 * SPENDLY-290 — the Tax & ITR Readiness Center screen flag (epic SPENDLY-288,
 * decision D9). Same shape as Save Goals (`shared/utils/saveGoalsFlag.ts`).
 *
 * `system_settings/global` is admin-only (clients can only read it):
 *   - `enableTaxCenterFor: string[]` — internal / staged users by uid;
 *   - `enableTaxCenter: true` — everyone.
 * Development builds always show the screens.
 *
 * The flag gates screens only. Turning it off (rollback) hides the center and
 * leaves every stored tax record as it was.
 */
export function taxCenterEnabled(
  system: { enableTaxCenter?: unknown; enableTaxCenterFor?: unknown },
  isDev: boolean,
  uid?: string | null
): boolean {
  if (isDev || system.enableTaxCenter === true) return true;
  return Boolean(uid) && Array.isArray(system.enableTaxCenterFor) && system.enableTaxCenterFor.includes(uid);
}

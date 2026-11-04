/**
 * SPENDLY-672 — what the scheduled nightly run does.
 *
 * `READMODEL_NIGHTLY_MODE` (a repository variable) chooses:
 * - unset or "full" (the default, today's behaviour): a full pass every night;
 * - "safety-net": changed-only nights (the always-full account collections still
 *   run in full, and the divergence check runs on every page), plus a full pass
 *   once a week on Sunday (IST) for hard deletes and writers without timestamps.
 *
 * Switch to "safety-net" only once every writer dual-writes in production
 * (670/671 released and `readModel.clientWrites` on): until then the nightly
 * full pass is still the copier.
 */
export type NightlySetting = "full" | "safety-net";
export const WEEKLY_FULL_DAY_IST = 0; // Sunday

export function nightlySetting(raw: string | undefined): NightlySetting {
  return raw?.trim() === "safety-net" ? "safety-net" : "full";
}

/** The scheduled run's mode, from the setting and the run's start time. */
export function nightlyMode(raw: string | undefined, now: Date): "full" | "incremental" {
  if (nightlySetting(raw) === "full") return "full";
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return ist.getUTCDay() === WEEKLY_FULL_DAY_IST ? "full" : "incremental";
}

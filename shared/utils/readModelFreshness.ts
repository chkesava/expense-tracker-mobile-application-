/**
 * SPENDLY-511 — how fresh a read-model screen is, and what it may say.
 *
 * ADR §8: data is at most 3 hours old for creates and edits, and the user's
 * own writes show at once (the overlay). A screen never presents a stale
 * value as current:
 * - `stale`: never synced, or the last sync is older than the SLO. The banner
 *   reads "Data may be out of date — last synced HH:MM".
 * - `updating`: this device wrote something newer than the last sync. Those
 *   rows are overlaid and the badge reads "Updating…".
 * - `fresh`: nothing to say.
 */
export const READ_MODEL_SLO_MS = 3 * 3600 * 1000;

export type FreshnessState = "fresh" | "updating" | "stale";
export type Freshness = { state: FreshnessState; label: string | null };

export function readModelFreshness(input: {
  lastSyncedAtMs: number | null;
  newestLocalWriteMs: number | null;
  nowMs: number;
  sloMs?: number;
  formatTime: (ms: number) => string;
}): Freshness {
  const slo = input.sloMs ?? READ_MODEL_SLO_MS;
  if (input.lastSyncedAtMs === null) {
    return { state: "stale", label: "Data may be out of date — not synced yet" };
  }
  if (input.nowMs - input.lastSyncedAtMs > slo) {
    return { state: "stale", label: `Data may be out of date — last synced ${input.formatTime(input.lastSyncedAtMs)}` };
  }
  if (input.newestLocalWriteMs !== null && input.newestLocalWriteMs > input.lastSyncedAtMs) {
    return { state: "updating", label: "Updating…" };
  }
  return { state: "fresh", label: null };
}

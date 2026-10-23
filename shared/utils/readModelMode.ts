/**
 * SPENDLY-511 — which source a screen reads from.
 *
 * The configured mode is remote and per screen:
 * `system_settings/global.readModel.<screen>`, which clients can only read
 * (firestore.rules: `write: if false`), so flipping a screen back needs no
 * app release.
 * - `firestore` (the default and the fallback): today's queries, unchanged.
 * - `shadow`: serve Firestore, fetch Supabase in the background and log
 *   differences. For proving a screen before it flips.
 * - `supabase`: serve the read model, with Firestore as the fallback.
 *
 * Whatever is configured, a duress session, an offline device, a build
 * without the read model, or a session that already fell back reads
 * Firestore.
 */

export const READ_MODEL_MODES = ["firestore", "shadow", "supabase"] as const;
export type ReadModelMode = (typeof READ_MODEL_MODES)[number];

/**
 * Screens that have a read-model path, each with its own kill switch.
 * - `journal` (SPENDLY-511/512): month loads, older pages, filter matches.
 * - `insights` (SPENDLY-513): the Insights month.
 * - `cashFlow` (SPENDLY-513): the dashboard chart's older months.
 * - `audit` (SPENDLY-513): ledger audit history.
 * - `cashback` (SPENDLY-513): cashback history's linked purchases.
 */
export const READ_MODEL_SCREENS = ["journal", "insights", "cashFlow", "audit", "cashback"] as const;
export type ReadModelScreen = (typeof READ_MODEL_SCREENS)[number];

/** The configured mode for a screen; anything missing or unknown is `firestore`. */
export function configuredReadModelMode(readModelSetting: unknown, screen: ReadModelScreen): ReadModelMode {
  if (!readModelSetting || typeof readModelSetting !== "object") return "firestore";
  const value = (readModelSetting as Record<string, unknown>)[screen];
  return (READ_MODEL_MODES as readonly unknown[]).includes(value) ? (value as ReadModelMode) : "firestore";
}

export type ReadModelConditions = {
  configured: ReadModelMode;
  online: boolean;
  duress: boolean;
  /** The read-model client is configured in this build (and not a local test build). */
  available: boolean;
  /** This screen already fell back to Firestore in this session. */
  fellBack: boolean;
};

export function effectiveReadModelMode(c: ReadModelConditions): ReadModelMode {
  if (c.configured === "firestore") return "firestore";
  if (c.duress || !c.online || !c.available || c.fellBack) return "firestore";
  return c.configured;
}

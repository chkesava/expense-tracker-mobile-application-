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
 * - `goals` (SPENDLY-611): Save Goals analytics, exports and older goal
 *   history pages. A goal's saved amount never moves (current state, R4).
 * - `groupFundHistory` (SPENDLY-685): older Group Funds history pages. A
 *   fund's held amount never moves (current state, R4). Not `groupFunds`:
 *   that key is the fund list's per-collection switch.
 */
export const READ_MODEL_SCREENS = ["journal", "insights", "cashFlow", "audit", "cashback", "goals", "groupFundHistory"] as const;
export type ReadModelScreen = (typeof READ_MODEL_SCREENS)[number];

/**
 * The configured mode for a screen; anything missing or unknown is `firestore`.
 * SPENDLY-745: `shadow` only while readModel.deviceShadow is on, else `firestore`.
 */
export function configuredReadModelMode(readModelSetting: unknown, screen: ReadModelScreen): ReadModelMode {
  if (!readModelSetting || typeof readModelSetting !== "object") return "firestore";
  const value = (readModelSetting as Record<string, unknown>)[screen];
  return (READ_MODEL_MODES as readonly unknown[]).includes(value) ? withDeviceShadow(value as ReadModelMode, readModelSetting) : "firestore";
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

/**
 * SPENDLY-670: whether the app also writes its saves to the read model
 * (`system_settings/global.readModel.clientWrites`). Off unless exactly true,
 * so the setting doubles as the kill switch.
 */
export function clientWritesEnabled(readModelSetting: unknown): boolean {
  return !!readModelSetting && typeof readModelSetting === "object" && (readModelSetting as Record<string, unknown>).clientWrites === true;
}

/**
 * SPENDLY-593: whether the app listens for read-model change pings
 * (`system_settings/global.readModel.realtime`). Off unless exactly true.
 */
export function realtimeEnabled(readModelSetting: unknown): boolean {
  return !!readModelSetting && typeof readModelSetting === "object" && (readModelSetting as Record<string, unknown>).realtime === true;
}

/**
 * SPENDLY-594: whether the app keeps the on-device copy of its read-model rows
 * (`system_settings/global.readModel.localCopy`). Off unless exactly true.
 */
export function localCopyEnabled(readModelSetting: unknown): boolean {
  return !!readModelSetting && typeof readModelSetting === "object" && (readModelSetting as Record<string, unknown>).localCopy === true;
}

/**
 * SPENDLY-745 (epic SPENDLY-735): whether `shadow` mode compares on the device
 * (`system_settings/global.readModel.deviceShadow`). Off unless exactly true:
 * then `shadow` serves Firestore with no compare at all (no copy read, no
 * Supabase fetch), and the server's nightly verify/parity is the check. The
 * owner turns it on only for a drill.
 */
export function deviceShadowEnabled(readModelSetting: unknown): boolean {
  return !!readModelSetting && typeof readModelSetting === "object" && (readModelSetting as Record<string, unknown>).deviceShadow === true;
}

/** A configured mode with the device compares applied: `shadow` is `firestore` unless they are on. */
export function withDeviceShadow<M extends string>(mode: M, readModelSetting: unknown): M {
  return (mode === "shadow" && !deviceShadowEnabled(readModelSetting) ? "firestore" : mode) as M;
}

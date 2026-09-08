/**
 * HTTP contract for the Netlify festival-summary function (KAN-36).
 *
 * Cloud Functions need Blaze. This repo already hosts spendly-share on
 * Netlify, so the trusted rebuild lives there instead. The function still
 * writes with the Admin SDK; the client only asks.
 */

export type SummaryRemoteMode = "rebuild" | "seed" | "recompute";

export function ganeshSummaryFunctionUrl(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return base ? `${base}/.netlify/functions/ganesh-summary` : "";
}

export function parseSummaryRemoteMode(value: unknown): SummaryRemoteMode | null {
  if (value === "rebuild" || value === "seed" || value === "recompute") return value;
  return null;
}

/**
 * Mirrors the old Cloud Function checks. Rebuild is allowed for any active
 * member because it recomputes from the ledger — they cannot choose a total.
 */
export function canRequestFestivalSummary(
  mode: SummaryRemoteMode,
  member: { status?: unknown; role?: unknown; permissions?: unknown } | null | undefined
): boolean {
  if (!member || member.status !== "active") return false;
  if (mode === "rebuild") return true;

  const role = typeof member.role === "string" ? member.role : "";
  const permissions = member.permissions;
  const has = (perm: string) => (Array.isArray(permissions) ? permissions.includes(perm) : false);
  const isAdmin = role === "admin";

  if (mode === "seed") return isAdmin || has("festival.create");
  return isAdmin || has("festival.update") || (!Array.isArray(permissions) && role === "treasurer");
}

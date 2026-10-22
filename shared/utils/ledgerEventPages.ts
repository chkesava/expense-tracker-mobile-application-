/**
 * SPENDLY-501 — paging helpers for the `ledgerEvents` audit trail.
 *
 * The Audit tab streams a bounded newest-first window and fetches older pages
 * on demand (the SPENDLY-410 cursor pattern). Events are append-only (rules
 * forbid update and delete), so a row that leaves the realtime window was
 * pushed out by a newer event, never removed.
 */

export const LEDGER_EVENTS_PAGE_SIZE = 100;

type Row = { id: string };

/** Live window first, then older pages, each id once (live wins). */
export function mergeEventPages<T extends Row>(live: readonly T[], older: readonly T[]): T[] {
  const seen = new Set(live.map((row) => row.id));
  const merged = [...live];
  for (const row of older) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

/**
 * Rows in the previous live window that the next one no longer holds. Kept
 * newest-first, so they slot in at the head of the older pages and nothing
 * vanishes from a list the person has already scrolled.
 */
export function pushedOutRows<T extends Row>(previousLive: readonly T[], nextLive: readonly T[]): T[] {
  const stillLive = new Set(nextLive.map((row) => row.id));
  return previousLive.filter((row) => !stillLive.has(row.id));
}

/** A full page means there may be more; a short one means the trail is exhausted. */
export function pageMayHaveMore(pageLength: number, pageSize = LEDGER_EVENTS_PAGE_SIZE): boolean {
  return pageLength >= pageSize;
}

/** Newest first by `createdAt` (Firestore Timestamp, epoch ms or ISO string). */
export function sortEventsNewestFirst<T extends { createdAt?: unknown }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
}

function millis(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value && typeof value === "object") {
    const ts = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof ts.toMillis === "function") return ts.toMillis() || 0;
    if (typeof ts.seconds === "number") return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1e6);
  }
  return 0;
}

/**
 * SPENDLY-513 — how the audit trail is read for a read-model mode.
 * - `listener`: the bounded realtime listener (and Firestore cursor pages).
 * - `readModelPages`: one transaction in `supabase` mode: pages from the read
 *   model and **no listener**.
 * - `listenerThenReadModel`: the whole trail in `supabase` mode: the newest
 *   window stays a realtime listener; older pages come from the read model.
 * - `pending`: the mode is still being resolved; nothing is read yet.
 */
export type AuditStrategy = "listener" | "readModelPages" | "listenerThenReadModel" | "pending";

export function auditStrategy(mode: "firestore" | "shadow" | "supabase" | null, docId: string | undefined): AuditStrategy {
  if (mode === null) return "pending";
  if (mode !== "supabase") return "listener";
  return docId ? "readModelPages" : "listenerThenReadModel";
}

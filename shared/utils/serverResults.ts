/**
 * SPENDLY-747 (epic SPENDLY-735: the app only delivers) — results the server's
 * insights-daily job computes over the whole ledger and stores at
 * users/{uid}/serverResults/{id}, server-written and owner-read:
 *
 * - `feeRows-<n>`: the fee rows (`classifyFeeRows`), in parts so no document
 *   nears Firestore's 1 MB limit. The app resolves them with the user's
 *   current reviews (`resolveFeeRows`).
 * - `ledgerHealth`: the Journal health report (`runLedgerAudit`).
 *
 * Every document of one run carries the same `runId`; the app only uses a
 * fee set whose parts are all present.
 *
 * - `autoDebitShortfall` (SPENDLY-796, written by autodebit-daily): which
 *   paying accounts can't cover their coming auto-debits
 *   (`computeAutoDebitShortfall`), for the user's `today`.
 *
 * Pure.
 */

import type { AutoDebitShortfallResult } from "./autoDebitShortfall";
import type { LedgerAuditReport } from "./ledgerAudit";
import type { FeeRowSet, StoredFeeRow } from "./feeDetection";

export const SERVER_RESULTS_COLLECTION = "serverResults";
export const LEDGER_HEALTH_DOC = "ledgerHealth";
export const FEE_ROWS_PREFIX = "feeRows-";
export const AUTO_DEBIT_SHORTFALL_DOC = "autoDebitShortfall";
/** Bump when a stored shape or the computation changes: every user is recomputed. */
export const SERVER_RESULTS_VERSION = 1;
const MAX_ROWS_PER_DOC = 300;
/** Well under Firestore's 1 MB document limit. */
export const MAX_DOC_BYTES = 600_000;

export type ServerResultMeta = {
  runId: string;
  /** The newest change the copy had seen for this user's inputs when the run started. */
  inputsSyncedAt: string | null;
  version: number;
};

/** Firestore stores no `undefined`; results are plain JSON. */
export function plainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function jsonBytes(value: unknown): number {
  return JSON.stringify(value).length;
}

/** The fee rows as documents, split by count and size. */
export function feeRowDocs(set: FeeRowSet, meta: ServerResultMeta): Array<{ id: string; data: Record<string, unknown> }> {
  const rows = plainJson(set.rows);
  const parts: StoredFeeRow[][] = [];
  let current: StoredFeeRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = jsonBytes(row);
    if (current.length && (current.length >= MAX_ROWS_PER_DOC || bytes + size > MAX_DOC_BYTES)) {
      parts.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  parts.push(current);
  return parts.map((part, index) => ({
    id: `${FEE_ROWS_PREFIX}${index}`,
    data: {
      kind: "feeRows",
      ...meta,
      part: index,
      parts: parts.length,
      rows: part,
      scanned: set.scanned,
      engineVersion: set.engineVersion,
    },
  }));
}

type Doc = { id: string; data: Record<string, unknown> };

/** The newest complete fee set, or null when none is stored yet. */
export function feeRowSetFromDocs(docs: readonly Doc[]): (Pick<FeeRowSet, "rows" | "scanned" | "reclassified"> & { runId: string }) | null {
  const byRun = new Map<string, Doc[]>();
  for (const d of docs) {
    if (d.data.kind !== "feeRows" || typeof d.data.runId !== "string") continue;
    byRun.set(d.data.runId, [...(byRun.get(d.data.runId) ?? []), d]);
  }
  const complete = [...byRun.entries()]
    .filter(([, parts]) => parts.length === Number(parts[0]!.data.parts))
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
  if (!complete.length) return null;
  const [runId, parts] = complete[0]!;
  const ordered = [...parts].sort((a, b) => Number(a.data.part) - Number(b.data.part));
  return {
    runId,
    rows: ordered.flatMap((p) => (Array.isArray(p.data.rows) ? (p.data.rows as StoredFeeRow[]) : [])),
    scanned: Number(ordered[0]!.data.scanned) || 0,
    reclassified: 0,
  };
}

export function ledgerHealthDocData(report: LedgerAuditReport, meta: ServerResultMeta): Record<string, unknown> {
  return { kind: "ledgerHealth", ...meta, report: plainJson(report) };
}

/** The stored health report and when its run started, or null when none is stored yet. */
export function ledgerHealthFromDocs(docs: readonly Doc[]): { report: LedgerAuditReport; runId: string } | null {
  const d = docs.find((x) => x.id === LEDGER_HEALTH_DOC && x.data.kind === "ledgerHealth");
  if (!d || !d.data.report || typeof d.data.runId !== "string") return null;
  return { report: d.data.report as LedgerAuditReport, runId: d.data.runId };
}

// ─── SPENDLY-796: low-balance alerts before auto-debits ─────────────────────

export type StoredAutoDebitShortfall = AutoDebitShortfallResult & { runId: string };

export function autoDebitShortfallDocData(result: AutoDebitShortfallResult, meta: ServerResultMeta): Record<string, unknown> {
  return {
    kind: "autoDebitShortfall",
    ...meta,
    today: result.today,
    engineVersion: result.engineVersion,
    hasShortfall: result.hasShortfall,
    accounts: plainJson(result.accounts),
  };
}

/** The stored shortfall result, or null when none is stored yet. */
export function autoDebitShortfallFromDocs(docs: readonly Doc[]): StoredAutoDebitShortfall | null {
  const d = docs.find((x) => x.id === AUTO_DEBIT_SHORTFALL_DOC && x.data.kind === "autoDebitShortfall");
  if (!d || typeof d.data.runId !== "string" || typeof d.data.today !== "string" || !Array.isArray(d.data.accounts)) return null;
  return {
    runId: d.data.runId,
    today: d.data.today,
    engineVersion: Number(d.data.engineVersion) || 0,
    hasShortfall: d.data.hasShortfall === true,
    accounts: d.data.accounts as AutoDebitShortfallResult["accounts"],
  };
}

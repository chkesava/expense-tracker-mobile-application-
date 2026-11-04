import { mapDocument, type ReadModelRow, type TableSpec } from "./mapping";
import { typedDifferences } from "./parity";

/**
 * SPENDLY-673 — shadow mode: what Firestore served a screen vs what the
 * on-device copy holds for the same collection. Each Firestore document goes
 * through the shared mapper and is compared on the typed columns, exactly as
 * the nightly parity does (`typedDifferences`).
 *
 * The result has counts and column names only, never values or ids, so it is
 * safe to log.
 */
export type ShadowDoc = { id: string; data: Record<string, unknown> };
export type ShadowResult = {
  firestore: number;
  copy: number;
  /** In Firestore, not in the copy. */
  missing: number;
  /** In the copy, not in Firestore. */
  extra: number;
  /** In both, with typed columns that differ. */
  differing: number;
  /** How many rows differ in each column. */
  columns: Record<string, number>;
};

export const isClean = (r: ShadowResult) => r.missing === 0 && r.extra === 0 && r.differing === 0;

/** `docId` of a Firestore document as the copy keys it (nested rows are "{parentId}/{id}"). */
export function shadowCompare(spec: TableSpec, uid: string, firestore: ShadowDoc[], copy: ReadModelRow[], copyKey = (d: ShadowDoc) => d.id): ShadowResult {
  const local = new Map(copy.map((r) => [r.doc_id, r]));
  const seen = new Set<string>();
  const result: ShadowResult = { firestore: firestore.length, copy: copy.length, missing: 0, extra: 0, differing: 0, columns: {} };
  for (const d of firestore) {
    const key = copyKey(d);
    seen.add(key);
    const row = local.get(key);
    if (!row) {
      result.missing += 1;
      continue;
    }
    // The update time only feeds source_update_time, which isn't a typed column.
    const expected = mapDocument(spec, uid, { id: key, data: d.data, updateTime: 1 });
    const diff = typedDifferences(spec, expected, row);
    if (!diff.length) continue;
    result.differing += 1;
    for (const column of diff) result.columns[column] = (result.columns[column] ?? 0) + 1;
  }
  for (const key of local.keys()) if (!seen.has(key)) result.extra += 1;
  return result;
}

import { isDuressUid } from "../duress";
import { mapDocument, type SourceDoc, type TableSpec } from "./mapping";
import { typedDifferences } from "./parity";

/**
 * SPENDLY-520 — has the read model converged on Firestore?
 *
 * The oracle is the mapper applied to the current Firestore documents (as in
 * SPENDLY-510 field parity). For every table and user, the live read-model
 * rows (not `source_deleted`) must be exactly the source documents, and each
 * row's typed columns must equal what the mapper builds. Duress trees must
 * hold nothing. Purged users are expected to hold nothing either.
 *
 * Returns counts and doc ids only, never values (drill logs are committed).
 */
export type ModelRow = Record<string, unknown> & { uid: string; doc_id: string; source_deleted: boolean };

export type ConvergenceIssue =
  | { kind: "missing"; table: string; docId: string }
  | { kind: "extra"; table: string; docId: string }
  | { kind: "differs"; table: string; docId: string; columns: string[] }
  | { kind: "duress"; table: string; docId: string }
  | { kind: "purged"; table: string; docId: string };

export type ConvergenceReport = { converged: boolean; checkedRows: number; issues: ConvergenceIssue[] };

export function convergence(input: {
  specs: TableSpec[];
  /** Firestore documents per (uid, collection). */
  source: Map<string, Map<string, SourceDoc[]>>;
  /** All read-model rows per table, tombstones included. */
  model: Map<string, ModelRow[]>;
  /** Users whose rows must be gone (account deleted). */
  purgedUids?: Set<string>;
}): ConvergenceReport {
  const issues: ConvergenceIssue[] = [];
  let checkedRows = 0;
  const purged = input.purgedUids ?? new Set<string>();

  for (const spec of input.specs) {
    const rows = input.model.get(spec.table) ?? [];
    const live = new Map<string, ModelRow>();
    for (const row of rows) {
      if (isDuressUid(row.uid)) issues.push({ kind: "duress", table: spec.table, docId: row.doc_id });
      else if (purged.has(row.uid)) issues.push({ kind: "purged", table: spec.table, docId: row.doc_id });
      else if (!row.source_deleted) live.set(`${row.uid}/${row.doc_id}`, row);
    }

    const expectedKeys = new Set<string>();
    for (const [uid, byCollection] of input.source) {
      if (isDuressUid(uid) || purged.has(uid)) continue;
      for (const doc of byCollection.get(spec.collection) ?? []) {
        const key = `${uid}/${doc.id}`;
        expectedKeys.add(key);
        checkedRows += 1;
        const expected = mapDocument(spec, uid, doc);
        const actual = live.get(key);
        if (!actual) {
          issues.push({ kind: "missing", table: spec.table, docId: doc.id });
          continue;
        }
        const columns = typedDifferences(spec, expected, actual);
        if (columns.length) issues.push({ kind: "differs", table: spec.table, docId: doc.id, columns });
      }
    }
    for (const [key, row] of live) {
      if (!expectedKeys.has(key)) issues.push({ kind: "extra", table: spec.table, docId: row.doc_id });
    }
  }
  return { converged: issues.length === 0, checkedRows, issues };
}

/** One line per issue kind and table, for drill logs. */
export function summarizeConvergence(report: ConvergenceReport): string {
  if (report.converged) return `converged: ${report.checkedRows} rows match, 0 issues`;
  const counts = new Map<string, number>();
  for (const issue of report.issues) counts.set(`${issue.kind} ${issue.table}`, (counts.get(`${issue.kind} ${issue.table}`) ?? 0) + 1);
  return `NOT converged: ${[...counts].map(([k, n]) => `${n} ${k}`).join(", ")}`;
}

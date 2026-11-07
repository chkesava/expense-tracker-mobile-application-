/**
 * SPENDLY-289 — document ids and ownership paths for the tax collections.
 *
 * Reviews and snapshots have derived ids, so a second review of the same item
 * overwrites the first instead of counting twice (fee-review precedent), and a
 * retried snapshot write is idempotent.
 */

import {
  TAX_SOURCE_KINDS,
  type FinancialYearKey,
  type TaxSourceKind,
  type TaxSourceRef,
} from "../types";
import { isFinancialYearKey } from "./taxYear";

export const TAX_ID_SEPARATOR = "__";

/** The five stored collections, all under `users/{uid}`. */
export const TAX_COLLECTIONS = [
  "taxProfiles",
  "taxEntries",
  "taxReviews",
  "taxDocuments",
  "taxSnapshots",
] as const;
export type TaxCollection = (typeof TAX_COLLECTIONS)[number];

const ID_MAX = 200;

/** A Firestore-safe id segment: no "/", not "." or "..", not `__…__`, at most 200 characters. */
export function isValidTaxIdSegment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= ID_MAX &&
    !value.includes("/") &&
    value !== "." &&
    value !== ".." &&
    !/^__.*__$/.test(value)
  );
}

export function isTaxSourceKind(value: unknown): value is TaxSourceKind {
  return typeof value === "string" && (TAX_SOURCE_KINDS as readonly string[]).includes(value);
}

/** `taxProfiles/{fy}` — one profile per year. */
export function taxProfileDocId(fy: FinancialYearKey): string {
  return fy;
}

/** `taxReviews/{fy}__{kind}__{id}` — one review per derived item per year. */
export function taxReviewDocId(fy: FinancialYearKey, source: TaxSourceRef): string {
  return `${fy}${TAX_ID_SEPARATOR}${source.kind}${TAX_ID_SEPARATOR}${source.id}`;
}

export function parseTaxReviewDocId(
  docId: string
): { fy: FinancialYearKey; source: TaxSourceRef } | null {
  const first = docId.indexOf(TAX_ID_SEPARATOR);
  if (first <= 0) return null;
  const second = docId.indexOf(TAX_ID_SEPARATOR, first + TAX_ID_SEPARATOR.length);
  if (second <= first) return null;
  const fy = docId.slice(0, first);
  const kind = docId.slice(first + TAX_ID_SEPARATOR.length, second);
  const id = docId.slice(second + TAX_ID_SEPARATOR.length);
  if (!isFinancialYearKey(fy) || !isTaxSourceKind(kind) || !id) return null;
  return { fy, source: { kind, id } };
}

/** `taxSnapshots/{fy}__{createdAtMs}` — append-only, ordered by time. */
export function taxSnapshotDocId(fy: FinancialYearKey, createdAtMs: number): string {
  return `${fy}${TAX_ID_SEPARATOR}${Math.trunc(createdAtMs)}`;
}

export function taxDocPath(uid: string, collection: TaxCollection, docId: string): string {
  return `users/${uid}/${collection}/${docId}`;
}

/** True only for a document in one of this user's tax collections. */
export function isOwnTaxDocPath(uid: string, path: string): boolean {
  if (!isValidTaxIdSegment(uid)) return false;
  const parts = path.split("/");
  return (
    parts.length === 4 &&
    parts[0] === "users" &&
    parts[1] === uid &&
    (TAX_COLLECTIONS as readonly string[]).includes(parts[2]) &&
    isValidTaxIdSegment(parts[3])
  );
}

/** Storage prefix of a user's tax documents in `spendly-files` (SPENDLY-298). */
export function taxStoragePrefix(uid: string): string {
  return `users/${uid}/tax/`;
}

/** `users/{uid}/tax/{documentId}/{fileName}` and nothing else. */
export function isOwnTaxStoragePath(uid: string, documentId: string, path: string): boolean {
  if (!isValidTaxIdSegment(uid) || !isValidTaxIdSegment(documentId)) return false;
  const prefix = `${taxStoragePrefix(uid)}${documentId}/`;
  if (!path.startsWith(prefix)) return false;
  return isValidTaxIdSegment(path.slice(prefix.length));
}

/**
 * SPENDLY-709 — tax documents → outbox ops (`commitMutations`).
 *
 * - A create is a `set` stamped with `createdAt` and `updatedAt` server
 *   timestamps (READ_MODEL_RULES R1.2).
 * - A correction is an `update` of every field, `deleteField()` for a field
 *   the new version no longer has, and a fresh `updatedAt`. `createdAt` is
 *   never rewritten.
 * - The `id` lives in the path, never in the document.
 *
 * Pure: the Firestore field values are injected, so this stays SDK-free and
 * the rules tests can run the exact ops the app sends.
 */

import type { MutationOp } from "@/shared/types/mutations";
import type {
  TaxDocument,
  TaxEntry,
  TaxProfile,
  TaxReview,
  TaxSnapshot,
} from "../types";
import { taxDocPath, type TaxCollection } from "./ids";

export type TaxSentinels = {
  serverTimestamp: () => unknown;
  deleteField: () => unknown;
};

/** Written by the server, or by the ops below; never part of a builder's output. */
const STAMP_FIELDS = new Set(["id", "createdAt", "updatedAt"]);

function documentData(doc: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (STAMP_FIELDS.has(key) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function createOp(
  uid: string,
  collection: TaxCollection,
  doc: { id: string },
  s: TaxSentinels
): MutationOp {
  return {
    op: "set",
    ref: { path: taxDocPath(uid, collection, doc.id) },
    data: { ...documentData(doc), createdAt: s.serverTimestamp(), updatedAt: s.serverTimestamp() },
  };
}

function updateOp(
  uid: string,
  collection: TaxCollection,
  next: { id: string },
  previous: object,
  s: TaxSentinels
): MutationOp {
  const data: Record<string, unknown> = documentData(next);
  for (const key of Object.keys(documentData(previous))) {
    if (!(key in data)) data[key] = s.deleteField();
  }
  data.updatedAt = s.serverTimestamp();
  return { op: "update", ref: { path: taxDocPath(uid, collection, next.id) }, data };
}

function writeOp<T extends { id: string }>(
  uid: string,
  collection: TaxCollection,
  next: T,
  previous: T | null | undefined,
  s: TaxSentinels
): MutationOp {
  if (previous && previous.id !== next.id) {
    throw new Error(`tax write: ${collection} id changed (${previous.id} -> ${next.id})`);
  }
  return previous ? updateOp(uid, collection, next, previous, s) : createOp(uid, collection, next, s);
}

export function taxEntryWriteOps(
  uid: string,
  entry: TaxEntry,
  previous: TaxEntry | null | undefined,
  s: TaxSentinels
): MutationOp[] {
  return [writeOp(uid, "taxEntries", entry, previous, s)];
}

export function taxReviewWriteOps(
  uid: string,
  review: TaxReview,
  previous: TaxReview | null | undefined,
  s: TaxSentinels
): MutationOp[] {
  return [writeOp(uid, "taxReviews", review, previous, s)];
}

/** Undoing a review: the item goes back to what Spendly derives. */
export function taxReviewDeleteOps(uid: string, reviewId: string): MutationOp[] {
  return [{ op: "delete", ref: { path: taxDocPath(uid, "taxReviews", reviewId) } }];
}

export function taxProfileWriteOps(
  uid: string,
  profile: TaxProfile,
  previous: TaxProfile | null | undefined,
  s: TaxSentinels
): MutationOp[] {
  return [writeOp(uid, "taxProfiles", profile, previous, s)];
}

export function taxDocumentWriteOps(
  uid: string,
  document: TaxDocument,
  previous: TaxDocument | null | undefined,
  s: TaxSentinels
): MutationOp[] {
  return [writeOp(uid, "taxDocuments", document, previous, s)];
}

/** Metadata only; the stored file is removed first by the document store (SPENDLY-298). */
export function taxDocumentDeleteOps(uid: string, documentId: string): MutationOp[] {
  return [{ op: "delete", ref: { path: taxDocPath(uid, "taxDocuments", documentId) } }];
}

/** Append-only: a snapshot is created once and never updated (`CREATE_ONLY_SEGMENTS`). */
export function taxSnapshotWriteOps(
  uid: string,
  snapshot: TaxSnapshot,
  s: TaxSentinels
): MutationOp[] {
  return [createOp(uid, "taxSnapshots", snapshot, s)];
}

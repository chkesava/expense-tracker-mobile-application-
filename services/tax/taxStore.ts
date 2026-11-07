import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocFromCache,
  serverTimestamp,
} from "@/lib/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type {
  TaxDocument,
  TaxEntry,
  TaxProfile,
  TaxReview,
  TaxSnapshot,
} from "@/shared/features/tax/types";
import {
  buildTaxEntry,
  buildTaxProfile,
  buildTaxReview,
  buildTaxSnapshot,
  softDeleteTaxEntry,
  type TaxBuildResult,
} from "@/shared/features/tax/utils/builders";
import {
  taxDocumentFromDoc,
  taxEntryFromDoc,
  taxProfileFromDoc,
  taxReviewFromDoc,
} from "@/shared/features/tax/utils/docs";
import { taxProfileDocId, taxReviewDocId, type TaxCollection } from "@/shared/features/tax/utils/ids";
import { validateTaxDocument, type TaxIssue, type TaxValidationContext } from "@/shared/features/tax/utils/validation";
import {
  taxDocumentDeleteOps,
  taxDocumentWriteOps,
  taxEntryWriteOps,
  taxProfileWriteOps,
  taxReviewDeleteOps,
  taxReviewWriteOps,
  taxSnapshotWriteOps,
  type TaxSentinels,
} from "@/shared/features/tax/utils/writes";

/**
 * Persisting the Tax & ITR Readiness Center (SPENDLY-709, epic SPENDLY-288).
 *
 * Every write goes through `commitMutations`: Firestore first, then the
 * read-model copy through the outbox and `rm_client_apply` (READ_MODEL_RULES
 * R1). Each write is built by the pure builders (SPENDLY-289), which refuse
 * anything invalid; firestore.rules check it again.
 *
 * R4.3a: a correction builds on the document as Firestore has it (cache, then
 * server), never on a read-model copy, so a stale copy can't undo a newer
 * correction. A review's `sourceAmount` comes from the caller: a caller whose
 * derived value came from the copy verifies it on Firestore first.
 */

export class TaxWriteInvalidError extends Error {
  constructor(readonly issues: TaxIssue[]) {
    super(`Invalid tax write: ${issues.map((i) => `${i.field}:${i.code}`).join(", ")}`);
    this.name = "TaxWriteInvalidError";
  }
}

const SENTINELS: TaxSentinels = { serverTimestamp, deleteField };

function db() {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  return database;
}

function unwrap<T>(result: TaxBuildResult<T>): T {
  if (!result.ok) throw new TaxWriteInvalidError(result.issues);
  return result.value;
}

/** A fresh document id. Mint it once per user submit and reuse it on retry (idempotency). */
export function newTaxDocId(uid: string, collectionName: "taxEntries" | "taxDocuments"): string {
  return doc(collection(db(), "users", uid, collectionName)).id;
}

async function loadFromFirestore(
  uid: string,
  collectionName: TaxCollection,
  id: string
): Promise<Record<string, unknown> | null> {
  const ref = doc(db(), "users", uid, collectionName, id);
  let snap;
  try {
    snap = await getDocFromCache(ref);
  } catch {
    snap = await getDoc(ref);
  }
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

export async function loadTaxEntry(uid: string, id: string): Promise<TaxEntry | null> {
  const data = await loadFromFirestore(uid, "taxEntries", id);
  return data ? taxEntryFromDoc(id, data) : null;
}

export async function loadTaxReview(uid: string, id: string): Promise<TaxReview | null> {
  const data = await loadFromFirestore(uid, "taxReviews", id);
  return data ? taxReviewFromDoc(id, data) : null;
}

export async function loadTaxProfile(uid: string, fy: string): Promise<TaxProfile | null> {
  const id = taxProfileDocId(fy);
  const data = await loadFromFirestore(uid, "taxProfiles", id);
  return data ? taxProfileFromDoc(id, data) : null;
}

export async function loadTaxDocument(uid: string, id: string): Promise<TaxDocument | null> {
  const data = await loadFromFirestore(uid, "taxDocuments", id);
  return data ? taxDocumentFromDoc(id, data) : null;
}

type Commit = { label?: string; onLateFailure?: (error: unknown) => void };

/** Create (fresh id) or correct (existing id) an entry. */
export async function saveTaxEntry(
  uid: string,
  id: string,
  draft: Parameters<typeof buildTaxEntry>[0]["draft"],
  options: Commit & { ctx?: TaxValidationContext } = {}
): Promise<{ entry: TaxEntry; outcome: WriteOutcome }> {
  const previous = await loadTaxEntry(uid, id);
  const entry = unwrap(buildTaxEntry({ id, draft, previous, nowMs: Date.now(), ctx: options.ctx }));
  const outcome = await commitMutations(uid, taxEntryWriteOps(uid, entry, previous, SENTINELS), {
    label: options.label ?? "tax entry",
    onLateFailure: options.onLateFailure,
  });
  return { entry, outcome };
}

/** Soft delete: kept for the audit trail, out of every total. */
export async function deleteTaxEntry(uid: string, id: string, options: Commit = {}): Promise<WriteOutcome> {
  const previous = await loadTaxEntry(uid, id);
  if (!previous) throw new TaxWriteInvalidError([{ field: "id", code: "required" }]);
  const now = new Date();
  const deleted = unwrap(softDeleteTaxEntry(previous, { ms: now.getTime(), iso: now.toISOString() }));
  return commitMutations(uid, taxEntryWriteOps(uid, deleted, previous, SENTINELS), {
    label: options.label ?? "tax entry delete",
    onLateFailure: options.onLateFailure,
  });
}

export async function saveTaxReview(
  uid: string,
  args: Omit<Parameters<typeof buildTaxReview>[0], "previous" | "nowMs">,
  options: Commit = {}
): Promise<{ review: TaxReview; outcome: WriteOutcome }> {
  const previous = await loadTaxReview(uid, taxReviewDocId(args.fy, args.source));
  const review = unwrap(buildTaxReview({ ...args, previous, nowMs: Date.now() }));
  const outcome = await commitMutations(uid, taxReviewWriteOps(uid, review, previous, SENTINELS), {
    label: options.label ?? "tax review",
    onLateFailure: options.onLateFailure,
  });
  return { review, outcome };
}

/** Undo a review: the item goes back to what Spendly derives. */
export function clearTaxReview(uid: string, reviewId: string, options: Commit = {}): Promise<WriteOutcome> {
  return commitMutations(uid, taxReviewDeleteOps(uid, reviewId), {
    label: options.label ?? "tax review undo",
    onLateFailure: options.onLateFailure,
  });
}

export async function saveTaxProfile(
  uid: string,
  draft: Parameters<typeof buildTaxProfile>[0]["draft"],
  options: Commit = {}
): Promise<{ profile: TaxProfile; outcome: WriteOutcome }> {
  const previous = await loadTaxProfile(uid, draft.fy);
  const profile = unwrap(buildTaxProfile({ draft, previous, nowMs: Date.now() }));
  const outcome = await commitMutations(uid, taxProfileWriteOps(uid, profile, previous, SENTINELS), {
    label: options.label ?? "tax profile",
    onLateFailure: options.onLateFailure,
  });
  return { profile, outcome };
}

/** Document metadata only (SPENDLY-298 uploads the file and drives pending → ready). */
export async function saveTaxDocumentMeta(
  uid: string,
  document: TaxDocument,
  options: Commit = {}
): Promise<WriteOutcome> {
  const issues = validateTaxDocument(uid, document);
  if (issues.length > 0) throw new TaxWriteInvalidError(issues);
  const previous = await loadTaxDocument(uid, document.id);
  if (previous && (previous.storagePath !== document.storagePath || previous.fy !== document.fy)) {
    throw new TaxWriteInvalidError([{ field: "storagePath", code: "not_allowed" }]);
  }
  const next: TaxDocument = previous ? { ...document, createdAtMs: previous.createdAtMs } : document;
  return commitMutations(uid, taxDocumentWriteOps(uid, next, previous, SENTINELS), {
    label: options.label ?? "tax document",
    onLateFailure: options.onLateFailure,
  });
}

export function deleteTaxDocumentMeta(uid: string, documentId: string, options: Commit = {}): Promise<WriteOutcome> {
  return commitMutations(uid, taxDocumentDeleteOps(uid, documentId), {
    label: options.label ?? "tax document delete",
    onLateFailure: options.onLateFailure,
  });
}

/** Freeze a calculation. The caller verifies its inputs on Firestore first (R4.3a). */
export async function saveTaxSnapshot(
  uid: string,
  args: Parameters<typeof buildTaxSnapshot>[0],
  options: Commit = {}
): Promise<{ snapshot: TaxSnapshot; outcome: WriteOutcome }> {
  const snapshot = unwrap(buildTaxSnapshot(args));
  const outcome = await commitMutations(uid, taxSnapshotWriteOps(uid, snapshot, SENTINELS), {
    label: options.label ?? "tax snapshot",
    onLateFailure: options.onLateFailure,
  });
  return { snapshot, outcome };
}

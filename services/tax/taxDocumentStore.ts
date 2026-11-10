import { collection, getDocs, limit, query, where } from "@/lib/firestore";

import { logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { logDirectRead } from "@/lib/firestoreReadDebug";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import {
  createDocumentSignedUrl,
  friendlyDocumentError,
  removeDocumentObject,
  uploadDocumentObject,
} from "@/services/accounts/spendlyFilesClient";
import {
  deleteTaxDocumentMeta,
  newTaxDocId,
  saveTaxDocumentMeta,
  saveTaxEntry,
} from "@/services/tax/taxStore";
import type { FinancialYearKey, TaxDocument, TaxDocumentCategory, TaxEntry } from "@/shared/features/tax/types";
import {
  editedTaxDocument,
  newTaxDocument,
  readyTaxDocument,
  taxFileRejection,
  type PickedTaxFile,
} from "@/shared/features/tax/utils/documents";
import { taxEntryFromDoc } from "@/shared/features/tax/utils/docs";
import { taxIssueMessage } from "@/shared/features/tax/utils/issueMessages";

/**
 * Tax documents (SPENDLY-298): Form 16, AIS, 26AS, proofs and receipts.
 *
 * The metadata row goes through the tax store (`commitMutations`: Firestore
 * first, then the read-model copy). The file goes to the private
 * `spendly-files` bucket through the existing Edge Function client, which
 * proves ownership by reading that row as the caller.
 *
 * Order, as for account documents (SPENDLY-88):
 *   - add: row (`pending`) → wait for the server → upload → row `ready`.
 *     A failure leaves a visible pending row to retry or remove, never an
 *     unreferenced file. Offline, the row is queued and the upload waits.
 *   - delete: file → links from entries → row. A failed file delete keeps the
 *     row, so the user can try again and nothing is stranded.
 * Account deletion removes every file under `users/{uid}/` (SPENDLY-711).
 */

export type TaxDocumentResult = { ok: true; id: string } | { ok: false; id?: string; error: string; pending?: boolean };

const OFFLINE_PENDING =
  "Saved on this device. The file uploads when you're back online: open it and choose Retry upload.";

async function upload(uid: string, document: TaxDocument, file: PickedTaxFile): Promise<TaxDocumentResult> {
  try {
    await uploadDocumentObject(document.storagePath, file.uri, document.mimeType, file.size);
  } catch (error) {
    logWarning("tax.documents.upload", error, { category: document.category });
    return {
      ok: false,
      id: document.id,
      pending: true,
      error: friendlyDocumentError(error, "Couldn't upload the document. Try again.").message,
    };
  }
  await saveTaxDocumentMeta(uid, readyTaxDocument(document, Date.now()), { label: "tax document ready" });
  return { ok: true, id: document.id };
}

export async function addTaxDocument(
  uid: string,
  input: { fy: FinancialYearKey; category: TaxDocumentCategory; name: string; note?: string; file: PickedTaxFile }
): Promise<TaxDocumentResult> {
  const rejection = taxFileRejection(input.file);
  if (rejection) return { ok: false, error: rejection };
  const id = newTaxDocId(uid, "taxDocuments");
  const built = newTaxDocument({ uid, id, nowMs: Date.now(), ...input });
  if (!built.ok) return { ok: false, error: built.reason ?? taxIssueMessage(built.issues[0]) };

  const outcome: WriteOutcome = await saveTaxDocumentMeta(uid, built.value, { label: "tax document" });
  // The Edge Function proves ownership from this row on the server; a queued
  // row would be refused, so the upload waits for a retry.
  if (outcome !== "acked") return { ok: false, id, pending: true, error: OFFLINE_PENDING };
  return upload(uid, built.value, input.file);
}

/** Upload again for a row whose file never landed, to the same path (it overwrites its own object). */
export async function retryTaxDocumentUpload(
  uid: string,
  document: TaxDocument,
  file: PickedTaxFile
): Promise<TaxDocumentResult> {
  const rejection = taxFileRejection(file);
  if (rejection) return { ok: false, id: document.id, error: rejection };
  return upload(uid, { ...document, mimeType: file.mimeType.toLowerCase(), sizeBytes: Math.trunc(file.size) }, file);
}

export function editTaxDocument(
  uid: string,
  document: TaxDocument,
  edit: { name: string; note?: string; category: TaxDocumentCategory }
): Promise<WriteOutcome> {
  return saveTaxDocumentMeta(uid, editedTaxDocument(document, edit, Date.now()), { label: "tax document edit" });
}

/**
 * Live entries of the year that link this document. One single-field filter
 * (`array-contains`, served by the automatic index; ids are unique, so the
 * year is checked here), bounded.
 */
async function entriesLinking(uid: string, document: TaxDocument): Promise<TaxEntry[]> {
  const database = getFirestoreDb();
  if (!database) return [];
  const snap = await getDocs(
    query(
      collection(database, "users", uid, "taxEntries"),
      where("documentIds", "array-contains", document.id),
      limit(50)
    )
  );
  logDirectRead(`users/${uid}/taxEntries`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
    feature: "tax",
    queryShape: "entries linking a document",
  });
  return snap.docs
    .map((d) => taxEntryFromDoc(d.id, d.data() as Record<string, unknown>))
    .filter((e): e is TaxEntry => !!e && e.fy === document.fy && !e.deletedAt);
}

/** Point an entry at a new set of documents (a correction of the entry, with history). */
export async function setEntryDocuments(uid: string, entry: TaxEntry, documentIds: string[]): Promise<WriteOutcome> {
  const { outcome } = await saveTaxEntry(
    uid,
    entry.id,
    {
      fy: entry.fy,
      kind: entry.kind,
      fields: entry.fields,
      label: entry.label,
      note: entry.note,
      documentIds,
      ...(entry.duplicateConfirmed ? { duplicateConfirmed: true } : {}),
    },
    { label: "tax entry documents" }
  );
  return outcome;
}

export async function deleteTaxDocument(uid: string, document: TaxDocument): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await removeDocumentObject(document.storagePath);
  } catch (error) {
    // A pending row's file may never have landed; only a ready one must be removed first.
    if (document.status === "ready") {
      logWarning("tax.documents.deleteObject", error, { category: document.category });
      return { ok: false, error: friendlyDocumentError(error, "Couldn't delete the document. Try again.").message };
    }
  }
  for (const entry of await entriesLinking(uid, document)) {
    await setEntryDocuments(uid, entry, (entry.documentIds ?? []).filter((id) => id !== document.id));
  }
  await deleteTaxDocumentMeta(uid, document.id, { label: "tax document delete" });
  return { ok: true };
}

/** A short-lived signed URL for viewing (5 minutes; never stored). */
export function taxDocumentUrl(document: TaxDocument): Promise<string> {
  return createDocumentSignedUrl(document.storagePath);
}

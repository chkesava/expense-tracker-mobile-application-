import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import { logWarning } from "@/lib/errors";
import {
  removeDocumentObject,
  uploadDocumentObject,
} from "@/services/accounts/spendlyFilesClient";
import type { AccountDocument } from "@/shared/types/expense";
import {
  buildAccountDocumentPath,
  documentRejectionReason,
  isDocumentMetadataValid,
  normalizeDocumentMetadata,
  sortAccountDocuments,
} from "@/shared/utils/accountDocuments";

/**
 * Account document metadata (SPENDLY-88).
 *
 * Firestore holds the record; the bytes live in the private `spendly-files`
 * bucket. Nothing binary is ever written here — the document carries an object
 * key, and never a URL, because the URLs for these objects expire in minutes.
 *
 * A one-shot read per account rather than a listener in `FinanceDataProvider`,
 * matching `accountNotesStore` and `accountReconciliationStore`: documents are
 * read on one screen by the subset of users who store them.
 *
 * Queried by `accountId` alone and sorted on the client. An `orderBy` beside
 * the `where` would need a composite index, and this repo's index file is a
 * known subset of what is deployed.
 */

const COLLECTION = "accountDocuments";

export interface PickedDocumentFile {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export async function listAccountDocuments(
  uid: string,
  accountId: string
): Promise<AccountDocument[]> {
  const database = getFirestoreDb();
  if (!database || !uid || !accountId) return [];

  const snapshot = await getDocs(
    query(
      collection(database, "users", uid, COLLECTION),
      where("accountId", "==", accountId)
    )
  );

  return sortAccountDocuments(
    snapshot.docs.map(
      (entry) => ({ id: entry.id, ...entry.data() }) as AccountDocument
    )
  );
}

/**
 * Stores a document: metadata first, then the bytes.
 *
 * The order is the decision worth explaining. Writing metadata first means a
 * failed upload leaves a visible `pending` row the user can retry or remove.
 * Uploading first would mean a failure between the two steps leaves an object
 * in the bucket that nothing references and nobody can see — an orphan, paid
 * for monthly, invisible to the person whose data it is.
 *
 * The trade is that the failure mode is a stale row instead of a stale object,
 * and a row is something the UI can show and the user can clear. That is why
 * there is no background sweeper: the cleanup path is in front of the person
 * who caused it.
 */
export async function addAccountDocument(
  uid: string,
  accountId: string,
  file: PickedDocumentFile,
  meta: { name: string; note: string }
): Promise<{ id: string; ok: boolean; error?: string }> {
  const database = getFirestoreDb();
  if (!database || !uid || !accountId) {
    return { id: "", ok: false, error: "Storage is unavailable right now." };
  }

  const rejection = documentRejectionReason(file);
  if (rejection) return { id: "", ok: false, error: rejection };

  const normalized = normalizeDocumentMetadata({
    // Fall back to the picked file's own name so a user who does not type one
    // still gets something readable rather than an untitled row.
    name: meta.name || file.fileName,
    note: meta.note,
  });
  if (!isDocumentMetadataValid(normalized)) {
    return { id: "", ok: false, error: "Give the document a name." };
  }

  const ref = doc(collection(database, "users", uid, COLLECTION));
  const storagePath = buildAccountDocumentPath({
    uid,
    accountId,
    documentId: ref.id,
    fileName: file.fileName,
  });
  const now = Date.now();

  await commitMutations(
    uid,
    [
      {
        op: "set",
        ref,
        data: {
          accountId,
          name: normalized.name,
          note: normalized.note,
          storagePath,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.size,
          status: "pending",
          uploadedAtMs: now,
          updatedAtMs: now,
          uploadedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      },
    ],
    { label: "account document" }
  );

  try {
    await uploadDocumentObject(storagePath, file.uri, file.mimeType, file.size);
  } catch (error) {
    logWarning("accountDocuments.upload", error, { accountId });
    return {
      id: ref.id,
      ok: false,
      error: error instanceof Error ? error.message : "Could not upload the document.",
    };
  }

  await markDocumentReady(uid, ref.id);
  return { id: ref.id, ok: true };
}

async function markDocumentReady(uid: string, documentId: string): Promise<void> {
  const database = getFirestoreDb();
  if (!database) return;
  await commitMutations(
    uid,
    [
      {
        op: "update",
        ref: doc(database, "users", uid, COLLECTION, documentId),
        data: { status: "ready", updatedAtMs: Date.now(), updatedAt: serverTimestamp() },
      },
    ],
    { label: "account document" }
  );
}

/**
 * Retries the upload for a row whose bytes never landed.
 *
 * Reuses the existing document's own `storagePath`, so a retry overwrites its
 * own half-written object rather than accumulating a new one per attempt.
 */
export async function retryAccountDocumentUpload(
  uid: string,
  document: AccountDocument,
  file: PickedDocumentFile
): Promise<{ ok: boolean; error?: string }> {
  if (!uid || !document.storagePath) {
    return { ok: false, error: "Storage is unavailable right now." };
  }
  const rejection = documentRejectionReason(file);
  if (rejection) return { ok: false, error: rejection };

  try {
    await uploadDocumentObject(document.storagePath, file.uri, file.mimeType, file.size);
  } catch (error) {
    logWarning("accountDocuments.retry", error, { accountId: document.accountId });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not upload the document.",
    };
  }
  await markDocumentReady(uid, document.id);
  return { ok: true };
}

/**
 * Edits the name and note. Never the storage path, the type or the size —
 * those describe the stored bytes, and the bytes are not being replaced.
 */
export async function updateAccountDocumentMeta(
  uid: string,
  documentId: string,
  meta: { name: string; note: string }
): Promise<boolean> {
  const database = getFirestoreDb();
  if (!database || !uid || !documentId) return false;

  const normalized = normalizeDocumentMetadata(meta);
  if (!isDocumentMetadataValid(normalized)) return false;

  await commitMutations(
    uid,
    [
      {
        op: "update",
        ref: doc(database, "users", uid, COLLECTION, documentId),
        data: {
          name: normalized.name,
          note: normalized.note,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
      },
    ],
    { label: "account document" }
  );
  return true;
}

/**
 * Deletes the bytes, then the record.
 *
 * That order is the safe one. If the object delete fails, the metadata row
 * stays and the user can try again — the file is still listed, still openable,
 * and still deletable. Deleting the record first would strand the object with
 * nothing pointing at it: the user would believe it was gone while it was not,
 * which for a bank statement is the worse of the two failures.
 *
 * A `pending` row is the one case that skips the object delete: its bytes never
 * landed, so there is nothing to remove, and asking Storage to delete a key
 * that was never written would fail the whole operation and leave the user
 * unable to clear a row that represents nothing.
 */
export async function deleteAccountDocument(
  uid: string,
  document: AccountDocument
): Promise<{ ok: boolean; error?: string }> {
  const database = getFirestoreDb();
  if (!database || !uid || !document.id) {
    return { ok: false, error: "Storage is unavailable right now." };
  }

  if (document.status !== "pending" && document.storagePath) {
    try {
      await removeDocumentObject(document.storagePath);
    } catch (error) {
      logWarning("accountDocuments.deleteObject", error, {
        accountId: document.accountId,
      });
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not delete the document.",
      };
    }
  }

  await commitMutations(
    uid,
    [{ op: "delete", ref: doc(database, "users", uid, COLLECTION, document.id) }],
    { label: "account document" }
  );
  return { ok: true };
}

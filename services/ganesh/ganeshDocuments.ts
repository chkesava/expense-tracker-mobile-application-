import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { commitWrite } from "@/lib/firestoreWrite";
import { newId } from "@/lib/id";
import type { GaneshWriter } from "@/services/ganesh/ganeshWriter";
import type {
  GaneshDocumentCategory,
  GaneshDocumentEntityType,
  GaneshFileMeta,
  PandalDocument,
  PandalDocumentAuditAction,
} from "@/shared/types/ganesh";
import {
  validateDocumentDescription,
  vaultDocumentId,
} from "@/shared/utils/ganeshDocuments";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import { pandalDocumentAuditsCol, pandalDocumentsCol } from "@/shared/utils/ganeshPaths";

export type GaneshActor = {
  uid: string;
  displayName: string;
  phone?: string;
};

export type CreateFestivalDocumentInput = {
  festivalId: string;
  category?: GaneshDocumentCategory;
  description?: string;
  clientOpId?: string;
};

export type VaultIndexInput = {
  pandalId: string;
  festivalId?: string;
  entityType: GaneshDocumentEntityType;
  entityId: string;
  category: GaneshDocumentCategory;
  file: GaneshFileMeta;
  description?: string;
};

function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

function documentAudit(
  batch: GaneshWriter,
  db: Firestore,
  pandalId: string,
  payload: {
    actorId: string;
    documentId: string;
    action: PandalDocumentAuditAction;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }
) {
  batch.set(
    pathRef(db, [...pandalDocumentAuditsCol(pandalId), newId()]),
    omitUndefined({
      ...payload,
      at: serverTimestamp(),
    })
  );
}

/**
 * Upsert a vault index row for an entity attachment (same storage path, no
 * second upload). Deterministic id so replaces update the same document.
 */
export function appendVaultIndexUpsert(
  batch: GaneshWriter,
  db: Firestore,
  actor: GaneshActor,
  input: VaultIndexInput
): string {
  const id = vaultDocumentId(input.entityType, input.entityId);
  const description = validateDocumentDescription(input.description);
  batch.set(
    pathRef(db, [...pandalDocumentsCol(input.pandalId), id]),
    omitUndefined({
      pandalId: input.pandalId,
      festivalId: input.festivalId?.trim() || undefined,
      entityType: input.entityType,
      entityId: input.entityId,
      category: input.category,
      fileName: input.file.fileName,
      mimeType: input.file.mimeType,
      fileSize: input.file.size,
      storagePath: input.file.path,
      status: "active" as const,
      description,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
  documentAudit(batch, db, input.pandalId, {
    actorId: actor.uid,
    documentId: id,
    action: "file",
    newValue: { storagePath: input.file.path, category: input.category },
  });
  return id;
}

/** Create a standalone festival document shell; file attaches via upload queue. */
export async function createFestivalDocument(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  input: CreateFestivalDocumentInput
): Promise<string> {
  const festivalId = input.festivalId.trim();
  if (!festivalId) throw new Error("Select a festival first.");
  const id = input.clientOpId?.trim() || newId();
  const description = validateDocumentDescription(input.description);
  const category: GaneshDocumentCategory = input.category ?? "festival_document";
  const batch = writeBatch(db);
  batch.set(
    pathRef(db, [...pandalDocumentsCol(pandalId), id]),
    omitUndefined({
      pandalId,
      festivalId,
      entityType: "festival" as const,
      entityId: id,
      category,
      fileName: "",
      mimeType: "image/jpeg" as const,
      fileSize: 0,
      storagePath: "",
      status: "active" as const,
      description,
      clientOpId: input.clientOpId?.trim() || undefined,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  documentAudit(batch, db, pandalId, {
    actorId: actor.uid,
    documentId: id,
    action: "created",
    newValue: { festivalId, category, description: description ?? null },
  });
  await commitWrite(() => batch.commit(), { label: "document create" });
  return id;
}

export async function attachDocumentFile(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  documentId: string,
  file: GaneshFileMeta,
  onLateFailure?: (error: unknown) => void
): Promise<string | undefined> {
  const ref = pathRef(db, [...pandalDocumentsCol(pandalId), documentId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Document not found.");
  const data = snap.data() as Omit<PandalDocument, "id">;
  if (data.status === "archived") throw new Error("This document is archived.");
  const previousPath = data.storagePath?.trim() || undefined;
  const batch = writeBatch(db);
  batch.update(ref, {
    fileName: file.fileName,
    mimeType: file.mimeType,
    fileSize: file.size,
    storagePath: file.path,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  documentAudit(batch, db, pandalId, {
    actorId: actor.uid,
    documentId,
    action: "file",
    oldValue: { storagePath: previousPath ?? null },
    newValue: { storagePath: file.path },
    reason: previousPath && previousPath !== file.path ? "File replaced" : "File attached",
  });
  const outcome = await commitWrite(() => batch.commit(), {
    label: "document file",
    onLateFailure,
  });
  return outcome === "acked" && previousPath && previousPath !== file.path
    ? previousPath
    : undefined;
}

export async function updatePandalDocument(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  documentId: string,
  patch: { description?: string; category?: GaneshDocumentCategory }
): Promise<void> {
  const ref = pathRef(db, [...pandalDocumentsCol(pandalId), documentId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Document not found.");
  const data = snap.data() as Omit<PandalDocument, "id">;
  if (data.status === "archived") throw new Error("This document is archived.");
  const description =
    patch.description !== undefined
      ? validateDocumentDescription(patch.description)
      : undefined;
  const batch = writeBatch(db);
  const update: Record<string, unknown> = {
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  };
  if (patch.description !== undefined) {
    update.description = description ?? deleteField();
  }
  if (patch.category !== undefined) {
    update.category = patch.category;
  }
  batch.update(ref, update);
  documentAudit(batch, db, pandalId, {
    actorId: actor.uid,
    documentId,
    action: "edited",
    newValue: omitUndefined({
      description: patch.description !== undefined ? description ?? null : undefined,
      category: patch.category,
    }),
  });
  await commitWrite(() => batch.commit(), { label: "document update" });
}

export async function archivePandalDocument(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  documentId: string,
  reason?: string
): Promise<void> {
  const ref = pathRef(db, [...pandalDocumentsCol(pandalId), documentId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Document not found.");
  const data = snap.data() as Omit<PandalDocument, "id">;
  if (data.status === "archived") return;
  const batch = writeBatch(db);
  batch.update(ref, {
    status: "archived",
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  documentAudit(batch, db, pandalId, {
    actorId: actor.uid,
    documentId,
    action: "archived",
    oldValue: { status: data.status },
    newValue: { status: "archived" },
    reason: reason?.trim() || undefined,
  });
  await commitWrite(() => batch.commit(), { label: "document archive" });
}

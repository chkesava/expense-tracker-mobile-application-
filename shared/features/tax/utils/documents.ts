/**
 * SPENDLY-298 — tax documents: where the file goes, the metadata row, and how
 * documents are grouped and linked. Pure; the store does the I/O.
 *
 * The file lives in the private `spendly-files` bucket at
 * `users/{uid}/tax/{documentId}/{fileName}`. Its metadata row
 * (`taxDocuments/{documentId}`) is written first, as `pending`, and is what the
 * `spendly-files` Edge Function reads to prove the caller owns the path. So the
 * row must be on the server before an upload is asked for.
 *
 * The file name in the path is a sanitised object key; the name the user sees
 * is `name`, which keeps their own text.
 */

import {
  ALLOWED_DOCUMENT_TYPES,
  isSafeStorageSegment,
  MAX_DOCUMENT_BYTES,
  PENDING_DOCUMENT_STALE_MS,
  sanitizeDocumentFileName,
} from "@/shared/utils/accountDocuments";
import { TAX_DOCUMENT_CATEGORY_LABELS } from "../data/categories";
import {
  TAX_DOCUMENT_CATEGORIES,
  TAX_LIMITS,
  TAX_SCHEMA_VERSION,
  type FinancialYearKey,
  type TaxDocument,
  type TaxDocumentCategory,
} from "../types";
import { taxStoragePrefix } from "./ids";
import { validateTaxDocument, type TaxIssue } from "./validation";

export interface PickedTaxFile {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
}

/** `users/{uid}/tax/{documentId}/{fileName}`, with a safe object key. */
export function buildTaxDocumentPath(
  uid: string,
  documentId: string,
  originalFileName: string
): { storagePath: string; fileName: string } {
  if (!isSafeStorageSegment(uid)) throw new Error("Invalid user.");
  if (!isSafeStorageSegment(documentId)) throw new Error("Invalid document.");
  const fileName = sanitizeDocumentFileName(originalFileName, "document");
  return { storagePath: `${taxStoragePrefix(uid)}${documentId}/${fileName}`, fileName };
}

/** Why a picked file can't be stored, in words; `null` when it can. */
export function taxFileRejection(file: Pick<PickedTaxFile, "mimeType" | "size">): string | null {
  if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(file.mimeType.toLowerCase())) {
    return "Only PDFs and images (JPEG, PNG, WebP) can be stored.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return "That file looks empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "That file is larger than 10 MB.";
  return null;
}

/** The metadata row for a new upload, `pending` until the file lands. */
export function newTaxDocument(args: {
  uid: string;
  id: string;
  fy: FinancialYearKey;
  category: TaxDocumentCategory;
  name: string;
  note?: string;
  file: PickedTaxFile;
  nowMs: number;
}): { ok: true; value: TaxDocument } | { ok: false; issues: TaxIssue[]; reason?: string } {
  const rejection = taxFileRejection(args.file);
  if (rejection) return { ok: false, issues: [], reason: rejection };
  const { storagePath, fileName } = buildTaxDocumentPath(args.uid, args.id, args.file.fileName);
  const note = args.note?.trim();
  const document: TaxDocument = {
    id: args.id,
    fy: args.fy,
    category: args.category,
    name: (args.name.trim() || args.file.fileName).slice(0, TAX_LIMITS.nameMax),
    storagePath,
    fileName,
    mimeType: args.file.mimeType.toLowerCase(),
    sizeBytes: Math.trunc(args.file.size),
    status: "pending",
    schemaVersion: TAX_SCHEMA_VERSION,
    createdAtMs: args.nowMs,
    updatedAtMs: args.nowMs,
    ...(note ? { note } : {}),
  };
  const issues = validateTaxDocument(args.uid, document);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: document };
}

/** The same row once its file has landed. */
export function readyTaxDocument(document: TaxDocument, nowMs: number): TaxDocument {
  return { ...document, status: "ready", uploadedAtMs: nowMs, updatedAtMs: nowMs };
}

/** A new name or note (or category); never the stored file, path or year. */
export function editedTaxDocument(
  document: TaxDocument,
  edit: { name: string; note?: string; category: TaxDocumentCategory },
  nowMs: number
): TaxDocument {
  const { note: _old, ...rest } = document;
  const note = edit.note?.trim();
  return {
    ...rest,
    name: edit.name.trim().slice(0, TAX_LIMITS.nameMax) || document.name,
    category: edit.category,
    updatedAtMs: nowMs,
    ...(note ? { note } : {}),
  };
}

/** An upload that never finished and has sat long enough to call stuck. */
export function isStuckTaxDocument(document: TaxDocument, nowMs: number): boolean {
  return document.status === "pending" && nowMs - document.updatedAtMs > PENDING_DOCUMENT_STALE_MS;
}

export interface TaxDocumentGroup {
  category: TaxDocumentCategory;
  title: string;
  documents: TaxDocument[];
}

/** Documents by category, in the fixed category order; newest first within each. */
export function groupTaxDocuments(documents: readonly TaxDocument[]): TaxDocumentGroup[] {
  return TAX_DOCUMENT_CATEGORIES.map((category) => ({
    category,
    title: TAX_DOCUMENT_CATEGORY_LABELS[category],
    documents: documents
      .filter((d) => d.category === category)
      .sort((a, b) => b.createdAtMs - a.createdAtMs || a.id.localeCompare(b.id)),
  })).filter((g) => g.documents.length > 0);
}

/**
 * An entry's document links, resolved against the documents that exist.
 * A link to a deleted document is dropped, never shown as a broken file.
 */
export function linkedTaxDocuments(
  documentIds: readonly string[] | undefined,
  documents: readonly TaxDocument[]
): TaxDocument[] {
  const byId = new Map(documents.map((d) => [d.id, d]));
  return (documentIds ?? []).map((id) => byId.get(id)).filter((d): d is TaxDocument => !!d);
}

export function taxDocumentSubtitle(document: TaxDocument, formatSize: (bytes: number) => string): string {
  return [TAX_DOCUMENT_CATEGORY_LABELS[document.category], formatSize(document.sizeBytes)].join(" · ");
}

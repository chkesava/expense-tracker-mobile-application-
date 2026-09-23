import type { AccountDocument } from "../types/expense";

/**
 * Account documents (SPENDLY-88) — paths, limits and pure helpers.
 *
 * This module holds the *shape* of a stored document: where its bytes live,
 * what may be stored, and how the metadata list is ordered. It deliberately
 * knows nothing about Supabase, Firestore or React, so the path rules — the
 * security-critical half — can be tested directly rather than only by calling
 * a deployed function.
 *
 * The same path grammar is re-implemented inside the `spendly-files` Edge
 * Function. That duplication is intentional: the function must not trust a
 * client-supplied path, so it derives the owning uid from the path itself
 * using its own copy of these rules. The two are kept in step by
 * `spendly-files/handler.test.ts` and `accountDocuments.test.ts` asserting the
 * same cases.
 */

export const SPENDLY_FILES_BUCKET = "spendly-files";

/**
 * What a user may store against an account.
 *
 * PDFs matter more here than images do: the documents people keep against a
 * bank account are statements, sanction letters and tax certificates, and those
 * arrive as PDFs. Images are included for a photographed receipt or passbook
 * page.
 *
 * Mirrored by the bucket's own `allowed_mime_types` in
 * `supabase/spendly-files.bucket-limits.sql`. The bucket is the enforcement:
 * bytes never pass through the Edge Function, so the function only ever sees
 * what a client claims. Keep the two lists in step.
 */
export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedDocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];

/** Mirrored by the bucket's `file_size_limit`. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_NAME_MAX = 120;
export const DOCUMENT_NOTE_MAX = 500;

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_FILE = /^[A-Za-z0-9._-]{1,80}$/;

export function isSafeStorageSegment(value: string): boolean {
  return SAFE_SEGMENT.test(value);
}

/**
 * Reduce a picked file's name to something safe to put in a storage path.
 *
 * Returns the fallback rather than throwing: a user who picked a file named
 * entirely in Devanagari, or with only punctuation, should still be able to
 * store it. The name they see in the app comes from the Firestore metadata,
 * which keeps their original text — this only governs the object key.
 */
export function sanitizeDocumentFileName(fileName: string, fallback: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() || fallback;
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  if (!SAFE_FILE.test(cleaned)) return fallback;
  // A name that survived as nothing but separators ("…" becomes "_") is
  // technically safe and completely useless. Treat it as unrepresentable.
  if (!/[A-Za-z0-9]/.test(cleaned)) return fallback;
  return cleaned;
}

/**
 * `users/{uid}/accounts/{accountId}/{documentId}/{fileName}`
 *
 * The uid leads the path so that ownership is derivable from the path alone.
 * That is what lets the Edge Function authorize a request without trusting a
 * separately-supplied uid: it reads the uid out of position 1 and checks it
 * against the caller's own token.
 *
 * The document id is its own segment rather than being folded into the file
 * name, so two documents may carry the same original file name — which
 * "Statement.pdf", downloaded twelve months running, invariably does.
 */
export function buildAccountDocumentPath(input: {
  uid: string;
  accountId: string;
  documentId: string;
  fileName: string;
}): string {
  const { uid, accountId, documentId } = input;
  if (!SAFE_SEGMENT.test(uid)) throw new Error("Invalid user.");
  if (!SAFE_SEGMENT.test(accountId)) throw new Error("Invalid account.");
  if (!SAFE_SEGMENT.test(documentId)) throw new Error("Invalid document.");
  const fileName = sanitizeDocumentFileName(input.fileName, "document");
  return `users/${uid}/accounts/${accountId}/${documentId}/${fileName}`;
}

/**
 * The uid a path belongs to, or null if the path is not a well-formed
 * account-document path.
 *
 * Strict on purpose. The uid is taken *from the path*, so a malformed path must
 * never be able to smuggle a different segment into position 1 — hence the
 * explicit length check, the `..` and leading-slash rejections, and the
 * per-segment grammar rather than a prefix match.
 */
export function uidForAccountDocumentPath(path: unknown): string | null {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return null;
  if (path.includes("..") || path.startsWith("/")) return null;
  const parts = path.split("/");
  // users/{uid}/accounts/{accountId}/{documentId}/{fileName}
  if (parts.length !== 6) return null;
  if (parts[0] !== "users" || parts[2] !== "accounts") return null;
  if (!SAFE_SEGMENT.test(parts[1])) return null;
  if (!SAFE_SEGMENT.test(parts[3])) return null;
  if (!SAFE_SEGMENT.test(parts[4])) return null;
  if (!SAFE_FILE.test(parts[5])) return null;
  return parts[1];
}

/** The account a well-formed document path belongs to, or null. */
export function accountIdForAccountDocumentPath(path: unknown): string | null {
  if (uidForAccountDocumentPath(path) === null) return null;
  return (path as string).split("/")[3];
}

/**
 * Client-side guard, shown before a slow upload starts.
 *
 * Not the enforcement — see `ALLOWED_DOCUMENT_TYPES`. Its job is a clear,
 * immediate "that won't work" instead of a failure minutes later.
 */
export function documentRejectionReason(file: {
  mimeType?: string | null;
  size?: number | null;
}): string | null {
  const type = (file.mimeType ?? "").toLowerCase();
  if (!type) return "That file's type could not be read.";
  if (!ALLOWED_DOCUMENT_TYPES.includes(type as AllowedDocumentType)) {
    return "Only PDFs and images can be stored.";
  }
  const size = file.size;
  if (typeof size === "number" && Number.isFinite(size)) {
    if (size <= 0) return "That file is empty.";
    if (size > MAX_DOCUMENT_BYTES) return "That file is larger than 10 MB.";
  }
  return null;
}

/** "2.4 MB" / "812 KB". Sizes are shown, so they are formatted once, here. */
export function formatDocumentSize(bytes?: number): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "PDF" / "JPEG". The stored mime type is machine-facing; this is not. */
export function documentTypeLabel(mimeType?: string): string {
  switch ((mimeType ?? "").toLowerCase()) {
    case "application/pdf":
      return "PDF";
    case "image/jpeg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "image/webp":
      return "WebP";
    default:
      return "File";
  }
}

export function accountDocumentSortMs(document: AccountDocument): number {
  const uploaded = document.uploadedAtMs;
  if (typeof uploaded === "number" && Number.isFinite(uploaded)) return uploaded;
  return 0;
}

/** Newest first, ties broken on id so the order is stable across renders. */
export function sortAccountDocuments(documents: AccountDocument[]): AccountDocument[] {
  return [...documents].sort((a, b) => {
    const diff = accountDocumentSortMs(b) - accountDocumentSortMs(a);
    if (diff !== 0) return diff;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

/**
 * Documents belonging to one account, sorted.
 *
 * Defence in depth over the account-scoped query, for the same reason the notes
 * list has it: the screen holds the previous account's documents until the next
 * read lands, and showing those under a new account's name would be a
 * data-integrity bug.
 */
export function selectAccountDocuments(
  documents: AccountDocument[],
  accountId: string
): AccountDocument[] {
  if (!accountId) return [];
  return sortAccountDocuments(
    documents.filter((document) => document.accountId === accountId)
  );
}

/**
 * A document whose bytes never arrived.
 *
 * Metadata is written before the upload so that a failure leaves a visible
 * record instead of an unreferenced object in the bucket. The cost is that a
 * failed upload leaves a row in this state, which the UI has to offer to retry
 * or remove rather than silently listing as if it were readable.
 */
export function isPendingDocument(document: AccountDocument): boolean {
  return document.status === "pending";
}

export function isReadyDocument(document: AccountDocument): boolean {
  return document.status === "ready";
}

/**
 * Pending uploads older than this are treated as abandoned.
 *
 * Long enough that a genuinely slow upload on a bad connection is not swept up
 * mid-flight; short enough that the user is not left looking at a stuck row for
 * an afternoon.
 */
export const PENDING_DOCUMENT_STALE_MS = 15 * 60 * 1000;

export function isStalePendingDocument(
  document: AccountDocument,
  nowMs: number
): boolean {
  if (!isPendingDocument(document)) return false;
  const started = accountDocumentSortMs(document);
  if (!started) return true;
  return nowMs - started > PENDING_DOCUMENT_STALE_MS;
}

export function normalizeDocumentMetadata(input: {
  name?: string;
  note?: string;
}): { name: string; note: string } {
  return {
    name: (input.name ?? "").trim().slice(0, DOCUMENT_NAME_MAX),
    note: (input.note ?? "").trim().slice(0, DOCUMENT_NOTE_MAX),
  };
}

/** A document must be called something; the note is optional. */
export function isDocumentMetadataValid(input: { name?: string }): boolean {
  return normalizeDocumentMetadata(input).name.length > 0;
}

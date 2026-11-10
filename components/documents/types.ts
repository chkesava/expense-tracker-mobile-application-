/**
 * Document viewer types (SPENDLY-124).
 * Reusable across Account Detail, Transaction Detail, and Tax Documents.
 */

export interface DocumentViewerItem {
  id?: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  storagePath?: string;
  uri?: string;
  uploadedAtMs?: number;
  note?: string;
}

export type DocumentViewerKind = "image" | "pdf" | "unsupported";

export function resolveDocumentKind(mimeType?: string): DocumentViewerKind {
  if (!mimeType) return "unsupported";
  const normalized = mimeType.toLowerCase().trim();
  if (
    normalized.startsWith("image/") ||
    normalized === "image/jpeg" ||
    normalized === "image/png" ||
    normalized === "image/webp"
  ) {
    return "image";
  }
  if (normalized === "application/pdf") {
    return "pdf";
  }
  return "unsupported";
}

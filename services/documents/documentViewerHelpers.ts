import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { createDocumentSignedUrl } from "@/services/accounts/spendlyFilesClient";
import { sanitizeDocumentFileName } from "@/shared/utils/accountDocuments";

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

/**
 * Resolves the authenticated/signed URL for viewing a document.
 * URLs are minted per view (5-minute TTL) and never stored or logged.
 */
export async function resolveDocumentUrl(document: DocumentViewerItem): Promise<string> {
  if (document.uri) {
    return document.uri;
  }
  if (document.storagePath) {
    return createDocumentSignedUrl(document.storagePath);
  }
  throw new Error("No document path or location available.");
}

/**
 * Downloads a document from a signed URL to temporary cache on device for native rendering/sharing.
 * Not used on web (web renders and downloads directly via browser).
 */
export async function downloadDocumentToCache(
  url: string,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (Platform.OS === "web") {
    return url;
  }

  const dir = new Directory(Paths.cache, "document-previews");
  dir.create({ idempotent: true });

  const safeName = sanitizeDocumentFileName(fileName, "document");
  const extension = fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";
  const fileSafeName = safeName.endsWith(extension) ? safeName : `${safeName}${extension}`;
  const destination = new File(dir, `${Date.now()}_${fileSafeName}`);

  if (destination.exists) {
    try {
      destination.delete();
    } catch {
      // Best-effort cleanup
    }
  }

  const task = File.createDownloadTask(url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0 && onProgress) {
        onProgress(Math.min(100, Math.round((bytesWritten / totalBytes) * 100)));
      }
    },
  });

  const downloaded = await task.downloadAsync();
  if (!downloaded || !downloaded.exists) {
    throw new Error("Could not download the document to device cache.");
  }

  return downloaded.uri;
}

/**
 * Best-effort cleanup of temporary preview files.
 */
export function cleanupCachedFile(uri?: string): void {
  if (!uri || Platform.OS === "web" || !uri.startsWith("file://")) return;
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Ignore cleanup failures
  }
}

/**
 * Share or export a document using system share sheet.
 */
export async function shareDocumentFile(
  uri: string,
  mimeType: string,
  fileName: string
): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: fileName, url: uri });
        return;
      } catch {
        // Fall back to download
      }
    }
    triggerWebDownload(uri, fileName);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle: `Share ${fileName}`,
    UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : mimeType,
  });
}

/**
 * Trigger direct download in web browser without navigating away.
 */
export function triggerWebDownload(url: string, fileName: string): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;

  fetch(url)
    .then((res) => res.blob())
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName || "document";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    })
    .catch(() => {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "document";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
}

/**
 * User-facing error message without internal storage URLs or details.
 */
export function viewerFriendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/network|offline|failed to fetch|internet/i.test(message)) {
    return "No internet connection. Check your network and try again.";
  }
  if (/timeout|timed out/i.test(message)) {
    return "Taking too long to load. Please try again.";
  }
  if (/401|sign in|token|jwt/i.test(message)) {
    return "Session expired. Sign in again to view this document.";
  }
  if (/403|permission|denied/i.test(message)) {
    return "You do not have permission to view this document.";
  }
  if (/encrypted|password/i.test(message)) {
    return "This PDF is password-protected and cannot be displayed in-app.";
  }
  if (/corrupt|invalid|damaged/i.test(message)) {
    return "This document appears to be corrupted or invalid.";
  }
  return "Could not load this document. Please try again.";
}

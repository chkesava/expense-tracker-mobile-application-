import {
  ALLOWED_IMAGE_TYPES,
  MAX_ORIGINAL_BYTES,
  MAX_UPLOAD_BYTES,
  RECEIPT_MAX_EDGE,
  TARGET_MAX_BYTES,
  type AllowedImageType,
} from "@/services/ganesh/storage/storageTypes";

const MIME_BY_EXT: Record<string, AllowedImageType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function resolveImageMime(
  mimeType?: string | null,
  fileName?: string | null
): AllowedImageType {
  const normalized = (mimeType ?? "").toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(normalized)) {
    return normalized as AllowedImageType;
  }
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  throw new Error("Unsupported image format.");
}

export function extensionForMime(mimeType: AllowedImageType): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function shouldCompressGaneshImage(input: {
  size: number;
  width?: number | null;
  height?: number | null;
}): boolean {
  return (
    input.size > TARGET_MAX_BYTES
    || (input.width ?? 0) > RECEIPT_MAX_EDGE
    || (input.height ?? 0) > RECEIPT_MAX_EDGE
    || input.size > MAX_ORIGINAL_BYTES
  );
}

export function assertPreparedImageSize(size: number): void {
  if (size > MAX_UPLOAD_BYTES) {
    throw new Error("This image is still too large after compression.");
  }
}

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import {
  assertPreparedImageSize,
  extensionForMime,
  resolveImageMime,
  shouldCompressGaneshImage,
} from "@/services/ganesh/storage/imageRules";
import { RECEIPT_MAX_EDGE, type AllowedImageType, type PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";

export {
  assertPreparedImageSize,
  extensionForMime,
  resolveImageMime,
  shouldCompressGaneshImage,
} from "@/services/ganesh/storage/imageRules";

export async function bytesFromUri(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read the selected image.");
  return response.arrayBuffer();
}

/**
 * Prepare a picked image for upload, reading it from disk **once** (GS-097).
 *
 * It used to materialise the full file as an ArrayBuffer up to three times per
 * upload: once to measure the original when the picker gave no `fileSize`,
 * again to measure the compressed result, and a third time in `uploadObject`
 * for the payload. On a low-end Android that is a transient spike of roughly
 * 15 MB, which is where the occasional jank and out-of-memory came from.
 *
 * Two changes get it to one read on every path:
 *
 * - The bytes are carried on the result, so `uploadObject` reuses them instead
 *   of re-fetching the URI.
 * - The original is not measured at all when compression is already certain.
 *   `shouldCompressGaneshImage` returns true whenever either dimension exceeds
 *   `RECEIPT_MAX_EDGE`, regardless of size — so in that case the original's
 *   size cannot change the decision, and reading it is pure waste.
 */
export async function prepareGaneshImage(input: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  kind?: "receipt" | "photo";
}): Promise<PreparedGaneshImage> {
  const mimeType = resolveImageMime(input.mimeType, input.fileName);
  let width = input.width ?? 0;
  let height = input.height ?? 0;

  // Dimensions alone can force compression, in which case the original's size
  // is irrelevant and we never touch the file.
  const oversizedByDimension = width > RECEIPT_MAX_EDGE || height > RECEIPT_MAX_EDGE;

  let bytes: ArrayBuffer | undefined;
  let originalSize = input.fileSize ?? 0;
  if (!oversizedByDimension && originalSize <= 0) {
    bytes = await bytesFromUri(input.uri);
    originalSize = bytes.byteLength;
    if (originalSize <= 0) throw new Error("Could not read the selected image.");
  }

  let uri = input.uri;
  let size = originalSize;
  let compressed = false;

  if (oversizedByDimension || shouldCompressGaneshImage({ size: originalSize, width, height })) {
    const longest = Math.max(width, height, RECEIPT_MAX_EDGE);
    const scale = longest > RECEIPT_MAX_EDGE ? RECEIPT_MAX_EDGE / longest : 1;
    const nextWidth = width > 0 ? Math.round(width * scale) : RECEIPT_MAX_EDGE;
    const context = ImageManipulator.manipulate(input.uri);
    if (nextWidth > 0) context.resize({ width: nextWidth });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: input.kind === "receipt" ? 0.72 : 0.65,
      format: mimeType === "image/png" ? SaveFormat.PNG : SaveFormat.JPEG,
    });
    uri = saved.uri;
    // The compressed file is a different file, so this read replaces rather
    // than repeats the one above - and its result is what gets uploaded.
    bytes = await bytesFromUri(uri);
    size = bytes.byteLength;
    compressed = true;
  }

  if (size <= 0) throw new Error("Could not read the selected image.");
  assertPreparedImageSize(size);

  // An explicit flag, not `size !== originalSize` as before: that comparison
  // was asking "was this re-encoded?" and would answer no for a compression
  // that happened to land on the identical byte count, leaving a webp labelled
  // webp after being saved as JPEG.
  const ext = extensionForMime(compressed && mimeType === "image/webp" ? "image/jpeg" : mimeType);
  const outputMime: AllowedImageType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return {
    uri,
    mimeType: outputMime,
    fileName: `${input.kind === "photo" ? "photo" : "receipt"}.${ext}`,
    size,
    bytes,
  };
}

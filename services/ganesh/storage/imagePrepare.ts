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
  const originalSize = input.fileSize ?? (await bytesFromUri(input.uri)).byteLength;
  if (originalSize <= 0) throw new Error("Could not read the selected image.");

  let uri = input.uri;
  let size = originalSize;
  let width = input.width ?? 0;
  let height = input.height ?? 0;

  if (shouldCompressGaneshImage({ size: originalSize, width, height })) {
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
    size = (await bytesFromUri(uri)).byteLength;
  }

  assertPreparedImageSize(size);

  const ext = extensionForMime(size !== originalSize && mimeType === "image/webp" ? "image/jpeg" : mimeType);
  const outputMime: AllowedImageType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return {
    uri,
    mimeType: outputMime,
    fileName: `${input.kind === "photo" ? "photo" : "receipt"}.${ext}`,
    size,
  };
}

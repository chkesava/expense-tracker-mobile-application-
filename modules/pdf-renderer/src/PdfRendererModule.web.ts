import type { RenderPdfResult } from "./PdfRenderer.types";

export function isNativePdfRendererAvailable(): boolean {
  return false;
}

export async function renderPdfPagesNative(
  _filePath: string,
  _maxPages = 20,
  _maxDimension = 1600
): Promise<RenderPdfResult> {
  throw new Error("Native PDF rendering is not supported on web.");
}

export default null;

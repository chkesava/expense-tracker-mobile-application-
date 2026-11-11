import { NativeModule, requireNativeModule } from "expo";

import type { RenderPdfResult } from "./PdfRenderer.types";

declare class PdfRendererNativeModule extends NativeModule {
  renderPages(
    filePath: string,
    maxPages: number,
    maxDimension: number
  ): Promise<RenderPdfResult>;
}

let nativeModule: PdfRendererNativeModule | null = null;
try {
  nativeModule = requireNativeModule<PdfRendererNativeModule>("PdfRenderer");
} catch {
  nativeModule = null;
}

export function isNativePdfRendererAvailable(): boolean {
  return nativeModule !== null;
}

export async function renderPdfPagesNative(
  filePath: string,
  maxPages = 20,
  maxDimension = 1600
): Promise<RenderPdfResult> {
  if (!nativeModule) {
    throw new Error("Native PDF renderer is not available in this build.");
  }
  return nativeModule.renderPages(filePath, maxPages, maxDimension);
}

export default nativeModule;

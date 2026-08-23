import { describe, expect, it } from "vitest";

import {
  MAX_UPLOAD_BYTES,
  RECEIPT_MAX_EDGE,
  TARGET_MAX_BYTES,
} from "./storageTypes";
import {
  assertPreparedImageSize,
  resolveImageMime,
  shouldCompressGaneshImage,
} from "./imageRules";

describe("imageRules", () => {
  it("accepts jpeg, png, and webp", () => {
    expect(resolveImageMime("image/jpeg")).toBe("image/jpeg");
    expect(resolveImageMime("image/jpg")).toBe("image/jpeg");
    expect(resolveImageMime("image/png")).toBe("image/png");
    expect(resolveImageMime("image/webp")).toBe("image/webp");
    expect(resolveImageMime(undefined, "photo.PNG")).toBe("image/png");
  });

  it("rejects unsupported formats", () => {
    expect(() => resolveImageMime("image/gif")).toThrow("Unsupported image format.");
    expect(() => resolveImageMime("application/pdf", "bill.pdf")).toThrow("Unsupported image format.");
    expect(() => resolveImageMime("image/heic", "IMG_001.HEIC")).toThrow("Unsupported image format.");
  });

  it("compresses originals over 5 MB or very large dimensions", () => {
    expect(shouldCompressGaneshImage({ size: MAX_UPLOAD_BYTES + 1 })).toBe(true);
    expect(shouldCompressGaneshImage({ size: TARGET_MAX_BYTES + 10 })).toBe(true);
    expect(shouldCompressGaneshImage({ size: 200_000, width: RECEIPT_MAX_EDGE + 1, height: 800 })).toBe(
      true
    );
    expect(shouldCompressGaneshImage({ size: 200_000, width: 800, height: 600 })).toBe(false);
  });

  it("rejects files that remain over 5 MB after compression", () => {
    expect(() => assertPreparedImageSize(MAX_UPLOAD_BYTES + 1)).toThrow(
      "This image is still too large after compression."
    );
    expect(() => assertPreparedImageSize(400_000)).not.toThrow();
  });
});

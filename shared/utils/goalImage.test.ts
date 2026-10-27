import { describe, expect, it } from "vitest";

import {
  GOAL_IMAGE_MAX_BYTES,
  goalImageMeta,
  goalImagePath,
  isOwnGoalImagePath,
  resizeTarget,
  validatePickedImage,
  validatePreparedImage,
} from "./goalImage";

describe("goal image rules (SPENDLY-614)", () => {
  it("accepts common photo types, rejects others and tiny images", () => {
    expect(validatePickedImage({ mimeType: "image/heic", width: 4000, height: 3000 })).toBeNull();
    expect(validatePickedImage({ mimeType: null })).toBeNull();
    expect(validatePickedImage({ mimeType: "application/pdf" })).toBe("type");
    expect(validatePickedImage({ mimeType: "image/gif" })).toBe("type");
    expect(validatePickedImage({ mimeType: "image/png", width: 20, height: 500 })).toBe("too_small");
  });

  it("checks the normalised image against the 10 MB bucket limit", () => {
    expect(validatePreparedImage({ sizeBytes: 200_000, width: 1600, height: 1200 })).toBeNull();
    expect(validatePreparedImage({ sizeBytes: GOAL_IMAGE_MAX_BYTES + 1, width: 1600, height: 1200 })).toBe("too_large");
    expect(validatePreparedImage({ sizeBytes: 0, width: 1600, height: 1200 })).toBe("unreadable");
  });

  it("scales the longest edge to 1600 px, keeping the aspect ratio", () => {
    expect(resizeTarget(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(resizeTarget(1000, 3200)).toEqual({ width: 500, height: 1600 });
    expect(resizeTarget(1200, 800)).toBeNull();
  });

  it("builds safe paths only, and recognises only this user's image for this goal", () => {
    expect(goalImagePath("u1", "g1", "img1")).toBe("users/u1/goals/g1/img1/image.jpg");
    expect(() => goalImagePath("u1", "../g", "img")).toThrow();
    expect(() => goalImagePath("u1", "g1", "a/b")).toThrow();
    expect(isOwnGoalImagePath("users/u1/goals/g1/img1/image.jpg", "u1", "g1")).toBe(true);
    expect(isOwnGoalImagePath("users/u2/goals/g1/img1/image.jpg", "u1", "g1")).toBe(false);
    expect(isOwnGoalImagePath("users/u1/goals/g2/img1/image.jpg", "u1", "g1")).toBe(false);
    expect(isOwnGoalImagePath("users/u1/goals/g1/../x/image.jpg", "u1", "g1")).toBe(false);
  });

  it("records metadata, always as JPEG", () => {
    expect(goalImageMeta("p", { sizeBytes: 5, width: 100, height: 80 }, 9)).toEqual({ path: "p", mimeType: "image/jpeg", sizeBytes: 5, width: 100, height: 80, uploadedAtMs: 9 });
  });
});

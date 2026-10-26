/**
 * SPENDLY-614 — goal image rules (FRD FR-12), pure.
 *
 * Images live in the private `spendly-files` bucket (Supabase Storage) at
 * `users/{uid}/goals/{goalId}/{imageId}/image.jpg`, reachable only through the
 * `spendly-files` Edge Function, which proves ownership by reading the goal
 * document as the caller. The goal document stores only metadata (`image`),
 * validated again by firestore.rules (path must be this user's, this goal's).
 *
 * Every image is normalised before upload: JPEG, longest edge at most 1600 px,
 * quality 0.8 — so what is stored is small and predictable whatever was picked.
 */

import type { GoalImage } from "../types/goal";

export const GOAL_IMAGE_MAX_EDGE = 1600;
export const GOAL_IMAGE_MIN_EDGE = 64;
/** Mirrors the bucket and Edge Function limit. */
export const GOAL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const GOAL_IMAGE_QUALITY = 0.8;
export const GOAL_IMAGE_SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

export type GoalImageIssue = "type" | "too_small" | "too_large" | "unreadable";

export const GOAL_IMAGE_ISSUE_TEXT: Record<GoalImageIssue, string> = {
  type: "Choose a JPEG, PNG, WebP or HEIC photo.",
  too_small: `That image is too small. Use one at least ${GOAL_IMAGE_MIN_EDGE} px wide and tall.`,
  too_large: "That image is still over 10 MB after compressing. Choose a smaller one.",
  unreadable: "That image couldn't be read. Try another one.",
};

/** The picked file, before normalising. Unknown type is allowed (the picker often omits it). */
export function validatePickedImage(input: { mimeType?: string | null; width?: number | null; height?: number | null }): GoalImageIssue | null {
  const type = input.mimeType?.toLowerCase();
  if (type && !(GOAL_IMAGE_SOURCE_TYPES as readonly string[]).includes(type)) return "type";
  if (input.width && input.height && (input.width < GOAL_IMAGE_MIN_EDGE || input.height < GOAL_IMAGE_MIN_EDGE)) return "too_small";
  return null;
}

/** The normalised JPEG, right before upload. */
export function validatePreparedImage(input: { sizeBytes: number; width: number; height: number }): GoalImageIssue | null {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) return "unreadable";
  if (input.sizeBytes > GOAL_IMAGE_MAX_BYTES) return "too_large";
  if (input.width < GOAL_IMAGE_MIN_EDGE || input.height < GOAL_IMAGE_MIN_EDGE) return "too_small";
  return null;
}

/** Resize target keeping the aspect ratio: the longest edge becomes at most 1600 px. */
export function resizeTarget(width: number, height: number): { width: number; height: number } | null {
  const longest = Math.max(width, height);
  if (!longest || longest <= GOAL_IMAGE_MAX_EDGE) return null;
  const scale = GOAL_IMAGE_MAX_EDGE / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Storage path; every segment must be safe (the Edge Function re-checks). */
export function goalImagePath(uid: string, goalId: string, imageId: string): string {
  for (const s of [uid, goalId, imageId]) if (!SAFE_SEGMENT.test(s)) throw new Error("Unsafe goal image path segment");
  return `users/${uid}/goals/${goalId}/${imageId}/image.jpg`;
}

/** True when `path` is this user's image for this goal (what rules also check). */
export function isOwnGoalImagePath(path: string, uid: string, goalId: string): boolean {
  const prefix = `users/${uid}/goals/${goalId}/`;
  if (!path.startsWith(prefix)) return false;
  return /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9._-]{1,80}$/.test(path.slice(prefix.length));
}

export function goalImageMeta(path: string, prepared: { sizeBytes: number; width: number; height: number }, nowMs: number): GoalImage {
  return { path, mimeType: "image/jpeg", sizeBytes: prepared.sizeBytes, width: prepared.width, height: prepared.height, uploadedAtMs: nowMs };
}

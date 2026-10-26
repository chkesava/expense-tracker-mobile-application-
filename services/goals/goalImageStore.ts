import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { logWarning } from "@/lib/errors";
import { newId } from "@/lib/id";
import {
  bytesFromUri,
  createDocumentSignedUrl,
  removeDocumentObject,
  uploadDocumentObject,
} from "@/services/accounts/spendlyFilesClient";
import type { GoalImage } from "@/shared/types/goal";
import {
  GOAL_IMAGE_ISSUE_TEXT,
  GOAL_IMAGE_QUALITY,
  goalImageMeta,
  goalImagePath,
  resizeTarget,
  validatePickedImage,
  validatePreparedImage,
} from "@/shared/utils/goalImage";

/**
 * Goal images (SPENDLY-614, FRD FR-12): pick (library or camera), normalise,
 * validate, upload through the `spendly-files` Edge Function (private bucket,
 * ownership proven against the goal document), then record the metadata on
 * the goal. The order keeps goal state consistent:
 *
 *   1. upload the new object;
 *   2. save the metadata on the goal (the caller does this, via the goal store);
 *   3. only then delete the previous object (best effort, logged).
 *
 * If step 2 fails, the new object is deleted again, so a failed replacement
 * leaves the old image in place and no orphan behind. A cleanup that itself
 * fails is logged; no amounts or history are ever touched.
 */

export class GoalImageError extends Error {}

export type PickedImage = { uri: string; mimeType?: string | null; width: number; height: number };
export type PreparedGoalImage = { uri: string; sizeBytes: number; width: number; height: number };
export type UploadStage = "preparing" | "uploading" | "saving" | "done";

export async function pickGoalImage(source: "library" | "camera"): Promise<PickedImage | null> {
  const permission =
    source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new GoalImageError(
      source === "camera" ? "Camera access is off for Spendly. Turn it on in device settings to take a photo." : "Photo access is off for Spendly. Turn it on in device settings to choose a photo."
    );
  }
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 1 });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  const issue = validatePickedImage({ mimeType: a.mimeType, width: a.width, height: a.height });
  if (issue) throw new GoalImageError(GOAL_IMAGE_ISSUE_TEXT[issue]);
  return { uri: a.uri, mimeType: a.mimeType, width: a.width, height: a.height };
}

/** JPEG, longest edge ≤ 1600 px, quality 0.8; then checked against the 10 MB limit. */
export async function prepareGoalImage(picked: PickedImage): Promise<PreparedGoalImage> {
  const context = ImageManipulator.manipulate(picked.uri);
  const target = resizeTarget(picked.width, picked.height);
  if (target) context.resize({ width: target.width });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: GOAL_IMAGE_QUALITY, format: SaveFormat.JPEG });
  const bytes = await bytesFromUri(saved.uri);
  const prepared = { uri: saved.uri, sizeBytes: bytes.byteLength, width: saved.width, height: saved.height };
  const issue = validatePreparedImage(prepared);
  if (issue) throw new GoalImageError(GOAL_IMAGE_ISSUE_TEXT[issue]);
  return prepared;
}

/**
 * Upload a prepared image and hand its metadata to `save` (which writes the
 * goal). Cleans up on failure; deletes `previous` only after `save` succeeds.
 */
export async function replaceGoalImage(input: {
  uid: string;
  goalId: string;
  prepared: PreparedGoalImage;
  previous: GoalImage | null | undefined;
  save: (image: GoalImage) => Promise<boolean>;
  onStage?: (stage: UploadStage) => void;
  nowMs?: number;
}): Promise<boolean> {
  const path = goalImagePath(input.uid, input.goalId, newId().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || `${Date.now()}`);
  input.onStage?.("uploading");
  await uploadDocumentObject(path, input.prepared.uri, "image/jpeg", input.prepared.sizeBytes);
  input.onStage?.("saving");
  let saved = false;
  try {
    saved = await input.save(goalImageMeta(path, input.prepared, input.nowMs ?? Date.now()));
  } finally {
    if (!saved) await deleteQuietly(path, "goalImage.cleanupNew");
  }
  if (saved && input.previous?.path && input.previous.path !== path) {
    await deleteQuietly(input.previous.path, "goalImage.cleanupOld");
  }
  input.onStage?.("done");
  return saved;
}

/** Remove the image: clear the metadata first, then the object. */
export async function removeGoalImage(previous: GoalImage, save: () => Promise<boolean>): Promise<boolean> {
  const ok = await save();
  if (ok) await deleteQuietly(previous.path, "goalImage.remove");
  return ok;
}

async function deleteQuietly(path: string, scope: string): Promise<void> {
  try {
    await removeDocumentObject(path);
  } catch (error) {
    logWarning(scope, error);
  }
}

/** A short-lived URL for showing the image (5 minutes, never cached as a URL). */
export function goalImageUrl(path: string): Promise<string> {
  return createDocumentSignedUrl(path);
}

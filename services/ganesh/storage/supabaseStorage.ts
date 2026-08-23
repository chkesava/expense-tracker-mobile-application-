import { getSupabaseClient } from "@/lib/supabase";
import { bytesFromUri } from "@/services/ganesh/storage/imagePrepare";
import { GANESH_FILES_BUCKET } from "@/services/ganesh/storage/storageTypes";

function friendlyStorageError(error: unknown, fallback: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/network|fetch|offline|failed to fetch|internet/i.test(message)) {
    return new Error("No internet connection.");
  }
  if (/timeout|timed out/i.test(message)) {
    return new Error("Upload timed out. Please try again.");
  }
  if (/413|too large|payload|entity too large/i.test(message)) {
    return new Error("This image is too large.");
  }
  if (/401|403|row-level|policy|not allowed|denied|jwt/i.test(message)) {
    return new Error("You do not have permission to store this file.");
  }
  if (/bucket|not found|unavailable|configured/i.test(message)) {
    return new Error("Storage is unavailable right now.");
  }
  return new Error(fallback);
}

export async function uploadObject(path: string, uri: string, mimeType: string): Promise<void> {
  try {
    const bytes = await bytesFromUri(uri);
    const { error } = await getSupabaseClient().storage.from(GANESH_FILES_BUCKET).upload(path, bytes, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) throw error;
  } catch (error) {
    throw friendlyStorageError(error, "Could not upload the file. Please try again.");
  }
}

export async function createObjectSignedUrl(path: string, expiresIn = 60 * 30): Promise<string> {
  try {
    const { data, error } = await getSupabaseClient()
      .storage.from(GANESH_FILES_BUCKET)
      .createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) throw error ?? new Error("Signed URL failure.");
    return data.signedUrl;
  } catch (error) {
    throw friendlyStorageError(error, "Could not open this file.");
  }
}

export async function removeObject(path: string): Promise<void> {
  try {
    const { error } = await getSupabaseClient().storage.from(GANESH_FILES_BUCKET).remove([path]);
    if (error) throw error;
  } catch (error) {
    throw friendlyStorageError(error, "Could not delete the file.");
  }
}

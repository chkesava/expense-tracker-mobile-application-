import { getFirebaseAuth } from "@/lib/firebase";
import { env } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase";
import { bytesFromUri } from "@/services/ganesh/storage/imagePrepare";
import { GANESH_FILES_BUCKET } from "@/services/ganesh/storage/storageTypes";

/**
 * All three operations below route through the `ganesh-files` Supabase Edge
 * Function rather than calling Storage directly (GS-001).
 *
 * The Supabase publishable key used to be enough on its own: the bucket's RLS
 * policies granted `anon` full CRUD, because Firebase Auth is not a Supabase
 * session and RLS had no identity to gate on. The key is bundled into the APK,
 * so that was, in effect, public read/write/delete over every pandal's files.
 *
 * The function verifies the caller's Firebase ID token against Firestore (i.e.
 * against the Ganesh membership rules that already govern everything else) and
 * only then uses a service-role key that never reaches the client to mint a
 * short-lived signed URL. See `supabase/functions/ganesh-files/index.ts` for the
 * full mechanism and `docs/GANESH_STORAGE_LOCKDOWN.md` for the deploy runbook.
 *
 * Bytes never pass through the function: an upload gets a signed *upload* URL
 * and is sent straight to Storage, so the Edge Function request-size limit does
 * not apply.
 */

type FunctionResult = {
  path?: string;
  token?: string;
  signedUrl?: string;
  expiresIn?: number;
  error?: string;
};

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
  if (/401|403|row-level|policy|not allowed|denied|jwt|permission/i.test(message)) {
    return new Error("You do not have permission to store this file.");
  }
  if (/bucket|not found|unavailable|configured/i.test(message)) {
    return new Error("Storage is unavailable right now.");
  }
  return new Error(fallback);
}

/**
 * The Edge Function reads the caller's uid out of this token and re-verifies it
 * against Firestore itself — this call site does not need to, and does not, trust
 * anything about the token beyond "Firebase says this is the current session".
 */
async function requireIdToken(): Promise<string> {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) throw new Error("Sign in again to use files.");
  return user.getIdToken();
}

async function callGaneshFiles(
  operation: "upload" | "download" | "delete",
  path: string
): Promise<FunctionResult> {
  if (!env.supabase.url) throw new Error("Storage is not configured.");
  const idToken = await requireIdToken();
  const response = await fetch(`${env.supabase.url}/functions/v1/ganesh-files`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ operation, path }),
  });
  const body = (await response.json().catch(() => ({}))) as FunctionResult;
  if (!response.ok) {
    throw new Error(body.error ? `${response.status} ${body.error}` : `${response.status}`);
  }
  return body;
}

export async function uploadObject(path: string, uri: string, mimeType: string): Promise<void> {
  try {
    const bytes = await bytesFromUri(uri);
    const grant = await callGaneshFiles("upload", path);
    if (!grant.path || !grant.token) throw new Error("No signed upload URL.");
    const { error } = await getSupabaseClient()
      .storage.from(GANESH_FILES_BUCKET)
      .uploadToSignedUrl(grant.path, grant.token, bytes, { contentType: mimeType });
    if (error) throw error;
  } catch (error) {
    throw friendlyStorageError(error, "Could not upload the file. Please try again.");
  }
}

export async function createObjectSignedUrl(path: string): Promise<string> {
  try {
    const grant = await callGaneshFiles("download", path);
    if (!grant.signedUrl) throw new Error("No signed URL.");
    return grant.signedUrl;
  } catch (error) {
    throw friendlyStorageError(error, "Could not open this file.");
  }
}

export async function removeObject(path: string): Promise<void> {
  try {
    await callGaneshFiles("delete", path);
  } catch (error) {
    throw friendlyStorageError(error, "Could not delete the file.");
  }
}

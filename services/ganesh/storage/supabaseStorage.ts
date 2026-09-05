import { getFirebaseAuth } from "@/lib/firebase";
import { env } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase";
import { bytesFromUri } from "@/services/ganesh/storage/imagePrepare";
import { GANESH_FILES_BUCKET } from "@/services/ganesh/storage/storageTypes";

/**
 * Every operation below routes through the `ganesh-files` Supabase Edge
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
  results?: BatchSignedUrl[];
  error?: string;
};

/** One entry of a `downloadBatch` answer, positionally matched to the request. */
export type BatchSignedUrl = {
  path: string;
  signedUrl: string | null;
  error: string | null;
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
  path: string,
  /**
   * Declared for an upload so the function can refuse a type or size the
   * bucket would reject anyway, before any bytes move (GS-036). Advisory
   * only — the bucket's own limits are the enforcement, because this is the
   * client describing itself.
   */
  declared?: { contentType: string; declaredSize: number }
): Promise<FunctionResult> {
  return callGaneshFilesRaw({ operation, path, ...declared });
}

async function callGaneshFilesRaw(payload: Record<string, unknown>): Promise<FunctionResult> {
  if (!env.supabase.url) throw new Error("Storage is not configured.");
  const idToken = await requireIdToken();
  const response = await fetch(`${env.supabase.url}/functions/v1/ganesh-files`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as FunctionResult;
  if (!response.ok) {
    throw new Error(body.error ? `${response.status} ${body.error}` : `${response.status}`);
  }
  return body;
}

export async function uploadObject(
  path: string,
  uri: string,
  mimeType: string,
  // Already-read bytes from `prepareGaneshImage` (GS-097). Falls back to
  // reading the URI so any other caller keeps working unchanged.
  prepared?: ArrayBuffer
): Promise<void> {
  try {
    const bytes = prepared ?? (await bytesFromUri(uri));
    const grant = await callGaneshFiles("upload", path, {
      contentType: mimeType,
      declaredSize: bytes.byteLength,
    });
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

/**
 * Thrown when the deployed function does not know the `downloadBatch` action —
 * i.e. an app build carrying batching is talking to a function deployed before
 * it (GS-096).
 *
 * The Edge Function and the app ship on separate clocks: the function is
 * deployed by hand (`npm run supabase:deploy:ganesh-files`) and the app through
 * a store release. GS-001's rollout is the cautionary tale — the server half
 * landed first and broke photos in every installed copy. So the batch path
 * degrades to one request per file rather than failing, and thumbnails keep
 * working either way.
 */
export class BatchUnsupportedError extends Error {
  constructor() {
    super("ganesh-files does not support downloadBatch.");
    this.name = "BatchUnsupportedError";
  }
}

/**
 * Mint many download URLs in one request (GS-096).
 *
 * Returns one entry per requested path, in request order — the function
 * guarantees that mapping, and the caller relies on it to attach each URL to the
 * right row. A path the caller may not read comes back with `error` set rather
 * than failing the whole batch.
 */
export async function createObjectSignedUrls(paths: string[]): Promise<BatchSignedUrl[]> {
  let body: FunctionResult;
  try {
    body = await callGaneshFilesRaw({ operation: "downloadBatch", paths });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/^400 Unknown operation/.test(message)) throw new BatchUnsupportedError();
    throw friendlyStorageError(error, "Could not open these files.");
  }
  const results = body.results;
  // A well-formed answer is exactly as long as the request. Anything else means
  // the positional mapping is not trustworthy, and guessing which URL belongs to
  // which row is worse than re-minting them one at a time.
  if (!Array.isArray(results) || results.length !== paths.length) {
    throw new Error("Could not open these files.");
  }
  return results;
}

export async function removeObject(path: string): Promise<void> {
  try {
    await callGaneshFiles("delete", path);
  } catch (error) {
    throw friendlyStorageError(error, "Could not delete the file.");
  }
}

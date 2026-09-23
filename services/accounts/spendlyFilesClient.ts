import { getFirebaseAuth } from "@/lib/firebase";
import { env } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase";
import { SPENDLY_FILES_BUCKET } from "@/shared/utils/accountDocuments";

/**
 * The client half of account document storage (SPENDLY-88).
 *
 * Every operation routes through the `spendly-files` Supabase Edge Function
 * rather than calling Storage directly. The bucket grants nobody anything: the
 * publishable key is bundled into the app, so any RLS grant to `anon` would be
 * a public grant over people's bank statements. The function holds the
 * service-role key, verifies the caller's Firebase ID token against Firestore,
 * and only then mints a short-lived signed URL.
 *
 * See `supabase/functions/spendly-files/index.ts` for the mechanism and
 * `docs/SPENDLY_DOCUMENTS_STORAGE.md` for the deploy runbook.
 *
 * Bytes never pass through the function: an upload gets a signed *upload* URL
 * and is sent straight to Storage, so the Edge Function request-size limit does
 * not apply to a 10 MB statement.
 */

type FunctionResult = {
  path?: string;
  token?: string;
  signedUrl?: string;
  expiresIn?: number;
  ok?: boolean;
  error?: string;
};

/**
 * Turn transport and storage failures into something worth showing a user.
 *
 * The Edge Function already refuses to echo storage internals, so this is
 * mostly about the trip to it: an offline phone and an expired session are the
 * two failures that actually happen, and they need different advice.
 */
export function friendlyDocumentError(error: unknown, fallback: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/network|fetch|offline|failed to fetch|internet/i.test(message)) {
    return new Error("No internet connection.");
  }
  if (/timeout|timed out/i.test(message)) {
    return new Error("That took too long. Please try again.");
  }
  if (/\b401\b|sign in again|jwt/i.test(message)) {
    return new Error("Sign in again to use documents.");
  }
  if (/\b403\b|permission|denied|row-level|policy/i.test(message)) {
    return new Error("You do not have permission to open this document.");
  }
  if (/\b413\b|too large/i.test(message)) {
    return new Error("That file is larger than 10 MB.");
  }
  if (/\b415\b|only pdfs/i.test(message)) {
    return new Error("Only PDFs and images can be stored.");
  }
  if (/bucket|not found|unavailable|not configured/i.test(message)) {
    return new Error("Storage is unavailable right now.");
  }
  return new Error(fallback);
}

/**
 * The Edge Function reads the caller's uid out of this token and re-verifies it
 * against Firestore itself — this call site does not need to, and does not,
 * trust anything about the token beyond "Firebase says this is the current
 * session".
 */
async function requireIdToken(): Promise<string> {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) throw new Error("Sign in again to use documents.");
  return user.getIdToken();
}

async function callSpendlyFiles(payload: Record<string, unknown>): Promise<FunctionResult> {
  if (!env.supabase.url) throw new Error("Storage is not configured.");
  const idToken = await requireIdToken();
  const response = await fetch(`${env.supabase.url}/functions/v1/spendly-files`, {
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

/** Reads a local file URI into bytes for upload. */
export async function bytesFromUri(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read that file.");
  return response.arrayBuffer();
}

export async function uploadDocumentObject(
  path: string,
  uri: string,
  mimeType: string,
  declaredSize: number
): Promise<void> {
  try {
    const bytes = await bytesFromUri(uri);
    const grant = await callSpendlyFiles({
      operation: "upload",
      path,
      contentType: mimeType,
      declaredSize: declaredSize || bytes.byteLength,
    });
    if (!grant.path || !grant.token) throw new Error("No signed upload URL.");
    const { error } = await getSupabaseClient()
      .storage.from(SPENDLY_FILES_BUCKET)
      .uploadToSignedUrl(grant.path, grant.token, bytes, { contentType: mimeType });
    if (error) throw error;
  } catch (error) {
    throw friendlyDocumentError(error, "Could not upload the document. Please try again.");
  }
}

/**
 * A short-lived URL for viewing one document.
 *
 * Deliberately not cached. The TTL is five minutes because these objects are
 * bank statements, and a URL is a bearer token for the object — holding one
 * longer than the view that needs it only widens the window in which a leaked
 * link still works.
 */
export async function createDocumentSignedUrl(path: string): Promise<string> {
  try {
    const grant = await callSpendlyFiles({ operation: "download", path });
    if (!grant.signedUrl) throw new Error("No signed URL.");
    return grant.signedUrl;
  } catch (error) {
    throw friendlyDocumentError(error, "Could not open this document.");
  }
}

export async function removeDocumentObject(path: string): Promise<void> {
  try {
    await callSpendlyFiles({ operation: "delete", path });
  } catch (error) {
    throw friendlyDocumentError(error, "Could not delete the document.");
  }
}

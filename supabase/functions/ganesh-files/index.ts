/**
 * ganesh-files — the trusted broker for Ganesh Seva file storage (GS-001).
 *
 * WHY THIS EXISTS
 * ---------------
 * Firebase Auth is not a Supabase session, so every request from the app arrives
 * at Supabase as the `anon` role and Supabase RLS has no identity to gate on.
 * The old policies therefore granted `anon` full CRUD over `pandals/**`, and the
 * publishable key is bundled into the APK — so anyone with the APK could read,
 * overwrite or delete every pandal's receipts with no account at all.
 *
 * This function is the missing trusted component. It:
 *   1. takes the caller's Firebase ID token,
 *   2. asks Firestore, AS THAT USER, for their own member document in the pandal
 *      the requested path belongs to,
 *   3. and only then uses the Supabase service-role key to mint a short-lived
 *      signed URL (or perform the delete).
 *
 * Step 2 is what makes this safe without a service account: Firestore verifies
 * the token itself and evaluates the Ganesh security rules. A forged or expired
 * token gets a 401 from Firestore; a valid token for a non-member returns no
 * document, because `pandals/{id}/members/{uid}` is readable by an active member
 * or by the owner of that member id — and a non-member's own id does not exist
 * there. So "document exists AND status == active" is exactly "active member".
 *
 * The service-role key never leaves this function. Bytes never pass through it
 * either: uploads go straight to Supabase Storage on a signed upload URL, so the
 * Edge Function request-size limit does not apply.
 *
 * WHAT IS IN THIS FILE
 * --------------------
 * Only the wiring: environment, the service-role Supabase client, and
 * `Deno.serve`. Every authorization decision lives in `handler.ts`, which has no
 * Deno and no SDK in it so that the repository's Vitest suite can test it
 * (`handler.test.ts`). Adding an operation means editing `handler.ts`, not this.
 *
 * Deploy with `npm run supabase:deploy:ganesh-files`. See
 * docs/GANESH_STORAGE_LOCKDOWN.md for the ordered rollout.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { CORS_HEADERS, handleGaneshFiles, json, type StoragePort } from "./handler.ts";

const BUCKET = "ganesh-files";

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * The service-role client, adapted to the narrow port the handler is allowed to
 * use. Errors are thrown rather than returned so the handler's single catch can
 * turn any of them into the one opaque "Storage is unavailable" answer — the
 * exception is `createSignedUrls`, which reports per-object failures the batch
 * path deliberately keeps and answers individually.
 */
function storagePort(): StoragePort {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storage = supabase.storage.from(BUCKET);

  return {
    async createSignedUploadUrl(path) {
      const { data, error } = await storage.createSignedUploadUrl(path, { upsert: true });
      if (error || !data) throw error ?? new Error("No signed upload URL.");
      return { path: data.path, token: data.token, signedUrl: data.signedUrl };
    },
    async createSignedUrl(path, expiresIn) {
      const { data, error } = await storage.createSignedUrl(path, expiresIn);
      if (error || !data?.signedUrl) throw error ?? new Error("No signed URL.");
      return data.signedUrl;
    },
    async createSignedUrls(paths, expiresIn) {
      const { data, error } = await storage.createSignedUrls(paths, expiresIn);
      if (error || !data) throw error ?? new Error("No signed URLs.");
      return data.map((entry) => ({
        path: entry.path ?? "",
        signedUrl: entry.signedUrl ?? null,
        error: entry.error ?? null,
      }));
    },
    async remove(paths) {
      const { error } = await storage.remove(paths);
      if (error) throw error;
    },
  };
}

Deno.serve(async (req) => {
  // The preflight is answered before the configuration check so a misconfigured
  // deployment still fails at the real request, with the real reason, instead of
  // as an opaque CORS error in the browser.
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  if (!FIREBASE_PROJECT_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ganesh-files: missing configuration");
    return json({ error: "Storage is not configured." }, 500);
  }

  return handleGaneshFiles(req, {
    storage: storagePort(),
    firebaseProjectId: FIREBASE_PROJECT_ID,
    fetch: globalThis.fetch,
  });
});

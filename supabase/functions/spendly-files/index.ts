/**
 * spendly-files — the trusted broker for Spendly account documents (SPENDLY-88).
 *
 * WHY THIS EXISTS
 * ---------------
 * Spendly had no file storage at all before this. Firebase Storage is denied to
 * clients outright in `storage.rules` (only `/releases` is readable), and the
 * only bucket in the project is Ganesh's, which is pandal-scoped and governed by
 * its own function.
 *
 * Supabase was chosen for the bytes, which brings the same problem `ganesh-files`
 * exists to solve: Firebase Auth is not a Supabase session, so every request from
 * the app arrives at Supabase as the `anon` role and RLS has no identity to gate
 * on. The publishable key is bundled into the APK, so any policy granting `anon`
 * access to this bucket would be, in effect, public — over people's bank
 * statements.
 *
 * So the bucket grants nobody anything (see supabase/spendly-files.policies.sql)
 * and this function is the only writer. It:
 *   1. takes the caller's Firebase ID token,
 *   2. reads the uid out of the requested path and refuses immediately if it is
 *      not the token's own uid,
 *   3. asks Firestore, AS THAT USER, for the account document the path names,
 *   4. and only then uses the Supabase service-role key to mint a short-lived
 *      signed URL (or perform the delete).
 *
 * Step 3 is what makes this safe without a service account: Firestore verifies
 * the token itself and evaluates the personal-tree rules. A forged or expired
 * token gets a 401 from Firestore; a valid token for someone else's account gets
 * nothing back, because `users/{uid}/accounts/{id}` is readable only by `uid`.
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
 * Deploy with `npm run supabase:deploy:spendly-files`. See
 * docs/SPENDLY_DOCUMENTS_STORAGE.md for the ordered rollout — the bucket and its
 * policies must exist before this function is of any use.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { CORS_HEADERS, handleSpendlyFiles, json, type StoragePort } from "./handler.ts";

const BUCKET = "spendly-files";

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * The service-role client, adapted to the narrow port the handler is allowed to
 * use. Errors are thrown rather than returned so the handler's single catch can
 * turn any of them into the one opaque "Storage is unavailable" answer.
 */
function storagePort(): StoragePort {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storage = supabase.storage.from(BUCKET);

  return {
    async createSignedUploadUrl(path) {
      // `upsert` so a retried upload overwrites its own half-written object
      // rather than failing. The path contains a document id generated per
      // upload, so this can only ever overwrite the same document's own bytes.
      const { data, error } = await storage.createSignedUploadUrl(path, { upsert: true });
      if (error || !data) throw error ?? new Error("No signed upload URL.");
      return { path: data.path, token: data.token, signedUrl: data.signedUrl };
    },
    async createSignedUrl(path, expiresIn) {
      const { data, error } = await storage.createSignedUrl(path, expiresIn);
      if (error || !data?.signedUrl) throw error ?? new Error("No signed URL.");
      return data.signedUrl;
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
    console.error("spendly-files: missing configuration");
    return json({ error: "Storage is not configured." }, 500);
  }

  return handleSpendlyFiles(req, {
    storage: storagePort(),
    firebaseProjectId: FIREBASE_PROJECT_ID,
    fetch: globalThis.fetch,
  });
});

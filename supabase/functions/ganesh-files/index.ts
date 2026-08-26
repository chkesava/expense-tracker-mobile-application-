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
 * NOT YET DEPLOYED OR TESTED. See docs/GANESH_STORAGE_LOCKDOWN.md for the ordered
 * rollout — the policy lockdown in that runbook MUST come after an app build that
 * calls this function is in users' hands, or photo features break for everyone.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "ganesh-files";
const DOWNLOAD_URL_TTL_SECONDS = 60 * 5;

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Operation = "upload" | "download" | "delete";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

/**
 * Mirrors services/ganesh/storage/storagePaths.ts. Kept strict on purpose: the
 * pandal id is taken from the path, so a malformed path must never be allowed to
 * smuggle a different segment into position 1.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_FILE = /^[A-Za-z0-9._-]{1,80}$/;
const FESTIVAL_CATEGORIES = ["expenses", "contributions", "documents"];

function pandalIdForPath(path: string): string | null {
  if (path.includes("..") || path.startsWith("/")) return null;
  const parts = path.split("/");
  if (parts[0] !== "pandals") return null;
  if (!SAFE_SEGMENT.test(parts[1] ?? "")) return null;
  if (!SAFE_FILE.test(parts[parts.length - 1] ?? "")) return null;
  if (!parts.slice(1, -1).every((segment) => SAFE_SEGMENT.test(segment))) return null;

  // pandals/{pandalId}/festivals/{festivalId}/{category}/{recordId}/{file}
  const isFestivalFile =
    parts.length === 7 && parts[2] === "festivals" && FESTIVAL_CATEGORIES.includes(parts[4]);
  // pandals/{pandalId}/assets|sponsors/{recordId}/{file}
  const isPandalFile =
    parts.length === 5 && (parts[2] === "assets" || parts[2] === "sponsors");

  return isFestivalFile || isPandalFile ? parts[1] : null;
}

/**
 * Reads the caller's own member document as the caller. Firestore verifies the
 * ID token and applies the Ganesh rules, so this is both authentication and
 * authorization in one call.
 */
async function isActiveMember(idToken: string, pandalId: string): Promise<boolean> {
  const uid = uidFromToken(idToken);
  if (!uid) return false;

  const url =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/pandals/${pandalId}/members/${uid}`;

  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!response.ok) return false;

  const doc = await response.json();
  return doc?.fields?.status?.stringValue === "active";
}

/**
 * The uid is read from the token WITHOUT verifying the signature, and is only
 * ever used to build the Firestore path. Firestore then rejects the request if
 * the token is forged, expired, or does not match that uid — so an attacker
 * cannot gain anything by lying here.
 */
function uidFromToken(idToken: string): string | null {
  try {
    const [, payload] = idToken.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    const uid = claims.user_id ?? claims.sub;
    return typeof uid === "string" && SAFE_SEGMENT.test(uid) ? uid : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  if (!FIREBASE_PROJECT_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ganesh-files: missing configuration");
    return json({ error: "Storage is not configured." }, 500);
  }

  const idToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!idToken) return json({ error: "Sign in again to use files." }, 401);

  let body: { operation?: Operation; path?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const operation = body.operation;
  const path = typeof body.path === "string" ? body.path : "";
  if (operation !== "upload" && operation !== "download" && operation !== "delete") {
    return json({ error: "Unknown operation." }, 400);
  }

  const pandalId = pandalIdForPath(path);
  if (!pandalId) return json({ error: "Invalid storage path." }, 400);

  if (!(await isActiveMember(idToken, pandalId))) {
    return json({ error: "You do not have permission to store this file." }, 403);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storage = supabase.storage.from(BUCKET);

  try {
    if (operation === "upload") {
      const { data, error } = await storage.createSignedUploadUrl(path, { upsert: true });
      if (error || !data) throw error ?? new Error("No signed upload URL.");
      return json({ path: data.path, token: data.token, signedUrl: data.signedUrl }, 200);
    }

    if (operation === "download") {
      const { data, error } = await storage.createSignedUrl(path, DOWNLOAD_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) throw error ?? new Error("No signed URL.");
      return json({ signedUrl: data.signedUrl, expiresIn: DOWNLOAD_URL_TTL_SECONDS }, 200);
    }

    const { error } = await storage.remove([path]);
    if (error) throw error;
    return json({ ok: true }, 200);
  } catch (error) {
    // Never echo the storage error back — it can leak bucket internals.
    console.error("ganesh-files", operation, error);
    return json({ error: "Storage is unavailable right now." }, 502);
  }
});

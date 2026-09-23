/**
 * The decision-making half of `spendly-files`, with no Deno and no Supabase SDK
 * in it (SPENDLY-88).
 *
 * WHY IT IS SPLIT OUT
 * -------------------
 * `index.ts` is the Deno shim: it reads the environment, builds a Supabase
 * client with the service-role key, and hands both to `handleSpendlyFiles`.
 * Everything that decides *whether a caller may have a URL* lives here, in
 * plain TypeScript with injected ports, so the repository's Vitest suite can
 * exercise it directly (`handler.test.ts`) rather than the authorization rules
 * being provable only by curling a deployed function.
 *
 * Nothing here can reach Storage or Firestore on its own — both arrive as
 * `Deps`. The service-role key is never visible to this file at all.
 *
 * HOW THIS DIFFERS FROM `ganesh-files`
 * ------------------------------------
 * Same shape, simpler question. Ganesh has to ask "is this caller an active
 * member of this pandal", which is a lookup against a membership document.
 * Spendly's personal tree is owned by exactly one uid, so the question is only
 * "is this caller the uid this path belongs to" — and the path carries that uid
 * in position 1.
 *
 * That is not enough on its own, because the uid is read from an *unverified*
 * token (see `uidFromToken`). The verification is the Firestore read in
 * `checkOwnership`: it asks Firestore, as the caller, for the account document
 * the path names. Firestore checks the signature and applies the personal-tree
 * rules, so a forged or expired token gets a 401 and a valid token for a
 * different user gets nothing back. "Firestore returned this account" is
 * therefore exactly "this caller owns this path".
 */

/**
 * Download TTL. Deliberately short: a signed URL is a bearer token for the
 * object, and these objects are bank statements.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 5;

/**
 * Mirrors ALLOWED_DOCUMENT_TYPES and MAX_DOCUMENT_BYTES in
 * shared/utils/accountDocuments.ts.
 *
 * These are a fast, clear rejection — NOT the enforcement. Bytes never pass
 * through this function: it mints a signed upload URL and the client uploads
 * straight to Storage, so nothing here can weigh a file or see its real
 * content-type. The authoritative check is the bucket's own `file_size_limit`
 * and `allowed_mime_types` (see supabase/spendly-files.bucket-limits.sql),
 * which Storage applies to the actual upload. A crafted client can declare
 * `application/pdf` here and send anything; the bucket is what refuses it.
 */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type Operation = "upload" | "download" | "delete";

export type StoragePort = {
  createSignedUploadUrl(
    path: string
  ): Promise<{ path: string; token: string; signedUrl: string }>;
  createSignedUrl(path: string, expiresIn: number): Promise<string>;
  remove(paths: string[]): Promise<void>;
};

export type Deps = {
  storage: StoragePort;
  firebaseProjectId: string;
  fetch: typeof fetch;
};

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

/**
 * Mirrors shared/utils/accountDocuments.ts. Kept strict on purpose: the uid is
 * taken from the path, so a malformed path must never be allowed to smuggle a
 * different segment into position 1.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_FILE = /^[A-Za-z0-9._-]{1,80}$/;

export type PathOwner = { uid: string; accountId: string };

/** users/{uid}/accounts/{accountId}/{documentId}/{fileName} */
export function ownerForPath(path: unknown): PathOwner | null {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return null;
  if (path.includes("..") || path.startsWith("/")) return null;
  const parts = path.split("/");
  if (parts.length !== 6) return null;
  if (parts[0] !== "users" || parts[2] !== "accounts") return null;
  if (!SAFE_SEGMENT.test(parts[1] ?? "")) return null;
  if (!SAFE_SEGMENT.test(parts[3] ?? "")) return null;
  if (!SAFE_SEGMENT.test(parts[4] ?? "")) return null;
  if (!SAFE_FILE.test(parts[5] ?? "")) return null;
  return { uid: parts[1], accountId: parts[3] };
}

/**
 * The uid is read from the token WITHOUT verifying the signature, and is only
 * ever used to compare against the path and to build the Firestore URL.
 * Firestore then rejects the request if the token is forged, expired, or does
 * not match that uid — so an attacker cannot gain anything by lying here.
 */
export function uidFromToken(idToken: string): string | null {
  try {
    const [, payload] = idToken.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
    );
    const uid = claims.user_id ?? claims.sub;
    return typeof uid === "string" && SAFE_SEGMENT.test(uid) ? uid : null;
  } catch {
    return null;
  }
}

export type OwnerCheck = "owner" | "denied" | "unauthenticated";

/**
 * "Does this caller own this path", answered by Firestore rather than by this
 * function.
 *
 * Two things are established by the one read:
 *
 * 1. **The token is real.** Firestore verifies the signature and expiry. A
 *    forged token gets a 401, which is reported separately from a denial so the
 *    app can say "sign in again" instead of telling somebody they lack
 *    permission to open their own statement.
 * 2. **The account exists and belongs to them.** `users/{uid}/accounts/{id}` is
 *    readable only by `uid` under the personal-tree rules, so a document coming
 *    back means the caller is that uid and that account is theirs.
 *
 * The uid-from-token comparison before it is not redundant: it avoids issuing a
 * Firestore read for a path that obviously is not the caller's, and it keeps the
 * denial for a foreign path identical whether or not that account exists — so
 * this cannot be used to probe for other users' account ids.
 */
export async function checkOwnership(
  deps: Deps,
  idToken: string,
  owner: PathOwner
): Promise<OwnerCheck> {
  const uid = uidFromToken(idToken);
  if (!uid) return "unauthenticated";
  if (uid !== owner.uid) return "denied";

  const url =
    `https://firestore.googleapis.com/v1/projects/${deps.firebaseProjectId}` +
    `/databases/(default)/documents/users/${owner.uid}/accounts/${owner.accountId}`;

  const response = await deps.fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status === 401) return "unauthenticated";
  if (!response.ok) return "denied";

  const doc = await response.json().catch(() => null);
  // A Firestore document read returns an object with a `name`. Anything else —
  // including an empty body on a 200 — is not proof of anything.
  return typeof doc?.name === "string" ? "owner" : "denied";
}

const INVALID_PATH = "Invalid storage path.";
const UNAVAILABLE = "Storage is unavailable right now.";
const SIGN_IN_AGAIN = "Sign in again to use documents.";
const NOT_PERMITTED = "You do not have permission to open this document.";
const NOT_PERMITTED_WRITE = "You do not have permission to store this document.";

export async function handleSpendlyFiles(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const idToken = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!idToken) return json({ error: SIGN_IN_AGAIN }, 401);

  let body: {
    operation?: Operation;
    path?: string;
    contentType?: string;
    declaredSize?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const operation = body.operation;
  if (operation !== "upload" && operation !== "download" && operation !== "delete") {
    return json({ error: "Unknown operation." }, 400);
  }

  const path = typeof body.path === "string" ? body.path : "";

  // Refuse an upload the bucket would reject anyway, before minting a URL for
  // it. Absent fields are not an error — see ALLOWED_MIME_TYPES above.
  if (operation === "upload") {
    const declaredType = typeof body.contentType === "string" ? body.contentType : null;
    if (declaredType && !ALLOWED_MIME_TYPES.includes(declaredType.toLowerCase())) {
      return json({ error: "Only PDFs and images can be stored." }, 415);
    }
    const declaredSize =
      typeof body.declaredSize === "number" ? body.declaredSize : null;
    if (declaredSize !== null && (!Number.isFinite(declaredSize) || declaredSize < 0)) {
      return json({ error: "Malformed request." }, 400);
    }
    if (declaredSize !== null && declaredSize > MAX_UPLOAD_BYTES) {
      return json({ error: "That file is larger than 10 MB." }, 413);
    }
  }

  const owner = ownerForPath(path);
  if (!owner) return json({ error: INVALID_PATH }, 400);

  const ownership = await checkOwnership(deps, idToken, owner);
  if (ownership === "unauthenticated") return json({ error: SIGN_IN_AGAIN }, 401);
  if (ownership !== "owner") {
    return json(
      { error: operation === "download" ? NOT_PERMITTED : NOT_PERMITTED_WRITE },
      403
    );
  }

  try {
    if (operation === "upload") {
      const data = await deps.storage.createSignedUploadUrl(path);
      return json({ path: data.path, token: data.token, signedUrl: data.signedUrl }, 200);
    }

    if (operation === "download") {
      const signedUrl = await deps.storage.createSignedUrl(path, DOWNLOAD_URL_TTL_SECONDS);
      return json({ signedUrl, expiresIn: DOWNLOAD_URL_TTL_SECONDS }, 200);
    }

    await deps.storage.remove([path]);
    return json({ ok: true }, 200);
  } catch (error) {
    // Never echo the storage error back — it can leak bucket internals.
    console.error("spendly-files", operation, error);
    return json({ error: UNAVAILABLE }, 502);
  }
}

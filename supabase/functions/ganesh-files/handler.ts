/**
 * The whole decision-making half of `ganesh-files`, with no Deno and no
 * Supabase SDK in it.
 *
 * WHY IT IS SPLIT OUT
 * -------------------
 * `index.ts` is the Deno shim: it reads the environment, builds a Supabase
 * client with the service-role key, and hands both to `handleGaneshFiles`.
 * Everything that decides *whether a caller may have a URL* lives here, in
 * plain TypeScript with injected ports, so the repository's Vitest suite can
 * exercise it directly (`handler.test.ts`) instead of the authorization rules
 * being provable only by curling a deployed function.
 *
 * Nothing here can reach Storage or Firestore on its own — both arrive as
 * `Deps`. The service-role key is never visible to this file at all.
 */

/**
 * The download TTL, unchanged from the single-path flow this now shares code
 * with (GS-096). The client cache in
 * `services/ganesh/storage/storageService.ts` is deliberately a minute shorter
 * than this, so batching must not lengthen it: a batch grant and a single grant
 * expire at exactly the same age.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 5;

/**
 * Ceiling on one `downloadBatch` (GS-096).
 *
 * Sized for a list view's visible window plus scroll-ahead, not for bulk export.
 * The cost of a batch is one `createSignedUrls` call plus one Firestore read per
 * *distinct pandal* in it, so the real protection against a caller using this to
 * hammer Firestore is MAX_BATCH_PANDALS below; this cap bounds the response body
 * and the signing work.
 */
export const MAX_BATCH_PATHS = 50;

/**
 * A batch may only span this many distinct pandals.
 *
 * The app never legitimately mixes pandals in one screen — a session has one
 * active pandal — so 4 is already generous. It exists because each distinct
 * pandal costs a Firestore round trip: without it, a 50-path batch naming 50
 * different pandals would turn one request into 50 upstream reads.
 */
export const MAX_BATCH_PANDALS = 4;

/**
 * Mirrors ALLOWED_IMAGE_TYPES and MAX_UPLOAD_BYTES in
 * services/ganesh/storage/storageTypes.ts (GS-036).
 *
 * These are a fast, clear rejection — NOT the enforcement. Bytes never pass
 * through this function: it mints a signed upload URL and the client uploads
 * straight to Storage, so nothing here can weigh a file or see its real
 * content-type. The authoritative check is the bucket's own `file_size_limit`
 * and `allowed_mime_types` (see supabase/ganesh-files.bucket-limits.sql), which
 * Storage applies to the actual upload. A crafted client can declare
 * `image/jpeg` here and send anything; the bucket is what refuses it.
 *
 * `declaredSize` and `contentType` are optional on purpose. Builds already in
 * users' hands send neither, and rejecting those would break every upload in
 * the field for no security gain — the bucket still catches them.
 */
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type Operation = "upload" | "download" | "downloadBatch" | "delete";

export type SignedUrlResult = {
  path: string;
  signedUrl: string | null;
  error: string | null;
};

/**
 * The only way this function is allowed to touch Storage. `index.ts` implements
 * it over the service-role client; the tests implement it over a fake. It is not
 * a second storage abstraction — it is the seam that keeps the service-role key
 * out of the logic, and the app still reaches Storage only through
 * `services/ganesh/storage/supabaseStorage.ts`.
 */
export type StoragePort = {
  createSignedUploadUrl(path: string): Promise<{ path: string; token: string; signedUrl: string }>;
  createSignedUrl(path: string, expiresIn: number): Promise<string>;
  createSignedUrls(paths: string[], expiresIn: number): Promise<SignedUrlResult[]>;
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
 * Mirrors services/ganesh/storage/storagePaths.ts. Kept strict on purpose: the
 * pandal id is taken from the path, so a malformed path must never be allowed to
 * smuggle a different segment into position 1.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_FILE = /^[A-Za-z0-9._-]{1,80}$/;
const FESTIVAL_CATEGORIES = ["expenses", "contributions", "documents"];

export function pandalIdForPath(path: unknown): string | null {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return null;
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
 * "Is the caller an active member of this pandal", with the one case that used
 * to be folded into `false` pulled out: a token Firestore itself rejects.
 *
 * That distinction is what lets the function answer "sign in again" rather than
 * telling a member with an expired session that they lack permission to open
 * their own pandal's photos.
 */
export type MemberCheck = "active" | "denied" | "unauthenticated";

/**
 * Reads the caller's own member document as the caller. Firestore verifies the
 * ID token and applies the Ganesh rules, so this is both authentication and
 * authorization in one call.
 */
export async function checkMembership(
  deps: Deps,
  idToken: string,
  pandalId: string
): Promise<MemberCheck> {
  const uid = uidFromToken(idToken);
  if (!uid) return "unauthenticated";

  const url =
    `https://firestore.googleapis.com/v1/projects/${deps.firebaseProjectId}` +
    `/databases/(default)/documents/pandals/${pandalId}/members/${uid}`;

  const response = await deps.fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (response.status === 401) return "unauthenticated";
  if (!response.ok) return "denied";

  const doc = await response.json().catch(() => null);
  return doc?.fields?.status?.stringValue === "active" ? "active" : "denied";
}

/**
 * The uid is read from the token WITHOUT verifying the signature, and is only
 * ever used to build the Firestore path. Firestore then rejects the request if
 * the token is forged, expired, or does not match that uid — so an attacker
 * cannot gain anything by lying here.
 */
export function uidFromToken(idToken: string): string | null {
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

const INVALID_PATH = "Invalid storage path.";
const NOT_PERMITTED = "You do not have permission to open this file.";
const UNAVAILABLE = "Storage is unavailable right now.";
const SIGN_IN_AGAIN = "Sign in again to use files.";

/**
 * `downloadBatch` — one request, many signed URLs (GS-096).
 *
 * Three properties matter more than the batching itself:
 *
 * 1. **Every path is authorized on its own.** The pandal id comes out of each
 *    path, and membership is checked per distinct pandal. Being allowed one file
 *    in a batch grants nothing about the others.
 * 2. **Results map positionally onto the request.** `results[i]` answers
 *    `paths[i]`, always — including duplicates, including failures. The client
 *    keys its cache off that, so a shifted array would attach one file's URL to
 *    another file's row.
 * 3. **Partial failure is the normal case, not an error case.** An unauthorized
 *    or malformed entry fails alone and the rest are still minted. Only a
 *    request malformed *as a whole*, or a caller Firestore will not
 *    authenticate at all, fails with a status code.
 */
async function handleDownloadBatch(
  deps: Deps,
  idToken: string,
  rawPaths: unknown
): Promise<Response> {
  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    return json({ error: "Malformed request." }, 400);
  }
  if (rawPaths.length > MAX_BATCH_PATHS) {
    return json({ error: `Ask for at most ${MAX_BATCH_PATHS} files at a time.` }, 400);
  }
  if (!rawPaths.every((path) => typeof path === "string")) {
    return json({ error: "Malformed request." }, 400);
  }
  const paths = rawPaths as string[];

  // Resolve every path first, so a malformed or foreign entry never reaches
  // Firestore or Storage at all.
  const pandalIds = paths.map(pandalIdForPath);
  const distinctPandals = [...new Set(pandalIds.filter((id): id is string => id !== null))];
  if (distinctPandals.length > MAX_BATCH_PANDALS) {
    return json({ error: "Malformed request." }, 400);
  }

  const membership = new Map<string, MemberCheck>();
  const checks = await Promise.all(
    distinctPandals.map(
      async (pandalId) => [pandalId, await checkMembership(deps, idToken, pandalId)] as const
    )
  );
  for (const [pandalId, result] of checks) membership.set(pandalId, result);

  // A token Firestore will not authenticate is a fact about the caller, not
  // about any one file, so it answers the whole request rather than repeating
  // itself fifty times.
  if ([...membership.values()].some((result) => result === "unauthenticated")) {
    return json({ error: SIGN_IN_AGAIN }, 401);
  }

  const authorized = paths.filter((_, index) => {
    const pandalId = pandalIds[index];
    return pandalId !== null && membership.get(pandalId) === "active";
  });
  // Duplicates cost one signature, not one per occurrence; the positional map
  // below still answers every occurrence.
  const toMint = [...new Set(authorized)];

  const minted = new Map<string, SignedUrlResult>();
  if (toMint.length > 0) {
    try {
      const signed = await deps.storage.createSignedUrls(toMint, DOWNLOAD_URL_TTL_SECONDS);
      for (const entry of signed) minted.set(entry.path, entry);
    } catch (error) {
      // Never echo the storage error back — it can leak bucket internals.
      console.error("ganesh-files downloadBatch", error);
      return json({ error: UNAVAILABLE }, 502);
    }
  }

  const results: SignedUrlResult[] = paths.map((path, index) => {
    const pandalId = pandalIds[index];
    if (pandalId === null) return { path, signedUrl: null, error: INVALID_PATH };
    if (membership.get(pandalId) !== "active") {
      return { path, signedUrl: null, error: NOT_PERMITTED };
    }
    const entry = minted.get(path);
    if (!entry?.signedUrl) {
      // One object failing to sign — deleted underneath us, a storage hiccup —
      // must not cost the other forty-nine their URLs.
      if (entry?.error) console.error("ganesh-files downloadBatch entry", entry.error);
      return { path, signedUrl: null, error: UNAVAILABLE };
    }
    return { path, signedUrl: entry.signedUrl, error: null };
  });

  return json({ expiresIn: DOWNLOAD_URL_TTL_SECONDS, results }, 200);
}

export async function handleGaneshFiles(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const idToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!idToken) return json({ error: SIGN_IN_AGAIN }, 401);

  let body: {
    operation?: Operation;
    path?: string;
    paths?: unknown;
    contentType?: string;
    declaredSize?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const operation = body.operation;
  if (
    operation !== "upload"
    && operation !== "download"
    && operation !== "downloadBatch"
    && operation !== "delete"
  ) {
    return json({ error: "Unknown operation." }, 400);
  }

  if (operation === "downloadBatch") {
    return handleDownloadBatch(deps, idToken, body.paths);
  }

  const path = typeof body.path === "string" ? body.path : "";

  // Refuse an upload the bucket would reject anyway, before minting a URL for
  // it. Absent fields are not an error — see ALLOWED_MIME_TYPES above.
  if (operation === "upload") {
    const declaredType = typeof body.contentType === "string" ? body.contentType : null;
    if (declaredType && !ALLOWED_MIME_TYPES.includes(declaredType.toLowerCase())) {
      return json({ error: "Only JPEG, PNG or WebP images can be stored." }, 415);
    }
    const declaredSize = typeof body.declaredSize === "number" ? body.declaredSize : null;
    if (declaredSize !== null && (!Number.isFinite(declaredSize) || declaredSize < 0)) {
      return json({ error: "Malformed request." }, 400);
    }
    if (declaredSize !== null && declaredSize > MAX_UPLOAD_BYTES) {
      return json({ error: "This image is too large." }, 413);
    }
  }

  const pandalId = pandalIdForPath(path);
  if (!pandalId) return json({ error: INVALID_PATH }, 400);

  const membership = await checkMembership(deps, idToken, pandalId);
  if (membership === "unauthenticated") return json({ error: SIGN_IN_AGAIN }, 401);
  if (membership !== "active") {
    return json({ error: "You do not have permission to store this file." }, 403);
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
    console.error("ganesh-files", operation, error);
    return json({ error: UNAVAILABLE }, 502);
  }
}

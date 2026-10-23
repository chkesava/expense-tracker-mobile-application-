import { isDuressUid } from "../duress";
import { READ_MODEL_TABLES } from "./mapping";

/**
 * SPENDLY-583 — the documents a client may ask the server to push to the read
 * model right after saving them, shared by the app (what to send) and the
 * Netlify function (what to accept).
 *
 * A ref names a document; it never carries data. The server reads the
 * document from Firestore itself, so a client can only ever cause its own
 * current Firestore state to be copied.
 */
export type PushRef = { collection: string; docId: string };

/** The synced (Wave 1) collections. Nothing else is ever pushed. */
export const PUSHABLE_COLLECTIONS: ReadonlySet<string> = new Set(READ_MODEL_TABLES.map((t) => t.collection));

/** Refs per request; more than this and the client asks for a per-user sync instead. */
export const MAX_PUSH_REFS = 50;

/**
 * Firestore document ids: 1–1500 bytes, no "/", not "." or "..", not
 * `__…__`. Stricter than needed is fine; anything odd is simply not pushed
 * (the nightly sync still copies it).
 */
export function isPushableDocId(docId: unknown): docId is string {
  return (
    typeof docId === "string" &&
    docId.length > 0 &&
    docId.length <= 500 &&
    !docId.includes("/") &&
    docId !== "." &&
    docId !== ".." &&
    !/^__.*__$/.test(docId)
  );
}

/** `users/{uid}/{collection}/{docId}` for the signed-in uid and a synced collection, else null. */
export function pushRefFromPath(path: string, uid: string): PushRef | null {
  if (!uid || isDuressUid(uid)) return null;
  const parts = path.split("/");
  if (parts.length !== 4 || parts[0] !== "users" || parts[1] !== uid) return null;
  const [, , collection, docId] = parts;
  if (!PUSHABLE_COLLECTIONS.has(collection) || !isPushableDocId(docId)) return null;
  return { collection, docId };
}

export const pushRefKey = (ref: PushRef) => `${ref.collection}/${ref.docId}`;

export type ParsedPushRequest =
  | { ok: true; mode: "refs"; refs: PushRef[] }
  | { ok: true; mode: "user" }
  | { ok: false; error: string };

/**
 * The request body, as the server accepts it: `{ refs: [{collection, docId}] }`
 * or `{ mode: "user" }` (a changed-only sync of the caller's own data). Every
 * other field, including any document data, is ignored.
 */
export function parsePushRequest(body: unknown): ParsedPushRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid request." };
  const input = body as { mode?: unknown; refs?: unknown };
  if (input.mode === "user") return { ok: true, mode: "user" };
  if (!Array.isArray(input.refs) || input.refs.length === 0) return { ok: false, error: "Nothing to push." };
  if (input.refs.length > MAX_PUSH_REFS) return { ok: false, error: `At most ${MAX_PUSH_REFS} documents per request.` };
  const seen = new Set<string>();
  const refs: PushRef[] = [];
  for (const raw of input.refs) {
    const r = (raw ?? {}) as { collection?: unknown; docId?: unknown };
    if (typeof r.collection !== "string" || !PUSHABLE_COLLECTIONS.has(r.collection) || !isPushableDocId(r.docId)) {
      return { ok: false, error: "Not a pushable document." };
    }
    const ref = { collection: r.collection, docId: r.docId };
    if (seen.has(pushRefKey(ref))) continue;
    seen.add(pushRefKey(ref));
    refs.push(ref);
  }
  return { ok: true, mode: "refs", refs };
}

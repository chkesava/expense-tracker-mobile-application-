/**
 * SPENDLY-711 — erase an account's stored files during account deletion (the
 * `files` phase of delete-account, before Auth is deleted).
 *
 * Account documents and goal photos live in the private Storage bucket
 * `spendly-files` of the read-model Supabase project, under `users/{uid}/…`
 * (READ_MODEL_RULES R1.1 exception, SPENDLY-616). They are the binaries
 * themselves: nothing rebuilds or removes them, so without this phase they
 * outlived the account. Tax documents (SPENDLY-298) will live there too.
 *
 * - Uses the Storage REST API with the read-model service-role key, which lives
 *   only in this site's environment (the same settings as the read-model purge).
 * - Lists recursively under `users/{uid}/` and `users/{uid}_duress/`, and
 *   deletes in batches. Every path is checked against those prefixes before it
 *   is deleted, so another user's object can never be touched.
 * - Bounded by a deadline: when time runs out it returns `done: false` and the
 *   phase is simply run again. Listing again finds only what is left, so a
 *   retry converges with no cursor.
 * - Fails closed: missing settings or a failed request throw, the phase fails,
 *   the client retries it, and Auth is never deleted with files left behind.
 */

import { SPENDLY_FILES_BUCKET } from "../../shared/utils/accountDocuments";
import { duressUid } from "../../shared/utils/duress";
import { ReadModelPurgeNotConfigured, type PurgeEnv } from "./_readmodelPurge";

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Storage's own page size for listing and its limit for one delete call. */
export const LIST_PAGE = 1000;
export const DELETE_BATCH = 1000;

export type FilesPurgeResult = {
  /** Objects removed by this invocation. */
  deleted: number;
  /** True once a full listing found nothing left under the account's prefixes. */
  done: boolean;
};

/** The folders an account's files live under: its own and its duress twin's. */
export function userFileRoots(uid: string): string[] {
  if (!uid || uid.includes("/") || uid.trim() !== uid) {
    throw new Error("Could not delete your documents (invalid account).");
  }
  return [`users/${uid}`, `users/${duressUid(uid)}`];
}

/** True only for an object strictly inside one of the account's folders. */
export function isOwnFilePath(path: string, roots: readonly string[]): boolean {
  if (path.includes("..") || path.includes("//")) return false;
  return roots.some((root) => path.startsWith(`${root}/`) && path.length > root.length + 1);
}

type ListedItem = { name?: unknown; id?: unknown };

function headers(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function listFolder(
  base: string,
  key: string,
  folder: string,
  offset: number,
  fetchImpl: FetchLike
): Promise<ListedItem[]> {
  const response = await fetchImpl(`${base}/storage/v1/object/list/${SPENDLY_FILES_BUCKET}`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ prefix: folder, limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } }),
  });
  if (!response.ok) {
    // No response body in the message: keep provider detail out of the client.
    throw new Error(`Could not delete your documents (HTTP ${response.status}). Try again.`);
  }
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body)) throw new Error("Could not delete your documents (invalid response). Try again.");
  return body as ListedItem[];
}

/**
 * Every object path under `root`, depth first. Storage lists one folder level
 * at a time: an entry with an `id` is an object, one without is a folder.
 * Stops early (returning what it has) when `outOfTime()` says so.
 */
async function listObjects(
  base: string,
  key: string,
  root: string,
  fetchImpl: FetchLike,
  outOfTime: () => boolean
): Promise<{ paths: string[]; complete: boolean }> {
  const paths: string[] = [];
  const folders = [root];
  while (folders.length > 0) {
    if (outOfTime()) return { paths, complete: false };
    const folder = folders.pop() as string;
    for (let offset = 0; ; offset += LIST_PAGE) {
      const items = await listFolder(base, key, folder, offset, fetchImpl);
      for (const item of items) {
        if (typeof item.name !== "string" || !item.name) continue;
        const path = `${folder}/${item.name}`;
        if (item.id) paths.push(path);
        else folders.push(path);
      }
      if (items.length < LIST_PAGE) break;
      if (outOfTime()) return { paths, complete: false };
    }
  }
  return { paths, complete: true };
}

async function deleteObjects(base: string, key: string, paths: string[], fetchImpl: FetchLike): Promise<void> {
  const response = await fetchImpl(`${base}/storage/v1/object/${SPENDLY_FILES_BUCKET}`, {
    method: "DELETE",
    headers: headers(key),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!response.ok) {
    throw new Error(`Could not delete your documents (HTTP ${response.status}). Try again.`);
  }
}

/**
 * Delete every stored file of the account, within `deadlineMs` (epoch ms).
 * Safe to call again at any time: it only ever removes what is still there.
 */
export async function purgeUserFiles(
  uid: string,
  env: PurgeEnv,
  options: { deadlineMs: number; now?: () => number; fetchImpl?: FetchLike }
): Promise<FilesPurgeResult> {
  if (!env.url || !env.serviceRoleKey) throw new ReadModelPurgeNotConfigured();
  const base = env.url.replace(/\/$/, "");
  const key = env.serviceRoleKey;
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const outOfTime = () => now() >= options.deadlineMs;
  const roots = userFileRoots(uid);

  let deleted = 0;
  // Done only when every folder was listed in full and held nothing.
  let empty = true;
  for (const root of roots) {
    const { paths, complete } = await listObjects(base, key, root, fetchImpl, outOfTime);
    const own = paths.filter((p) => isOwnFilePath(p, roots));
    if (own.length !== paths.length) {
      // Never reached with Storage's own listing; refuse rather than guess.
      throw new Error("Could not delete your documents (unexpected path). Try again.");
    }
    for (let i = 0; i < own.length; i += DELETE_BATCH) {
      if (outOfTime()) return { deleted, done: false };
      const batch = own.slice(i, i + DELETE_BATCH);
      await deleteObjects(base, key, batch, fetchImpl);
      deleted += batch.length;
    }
    // Anything deleted, or a listing cut short, means a fresh listing must confirm it is empty.
    if (!complete) return { deleted, done: false };
    if (own.length > 0) empty = false;
  }
  return { deleted, done: empty };
}

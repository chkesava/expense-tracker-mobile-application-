/**
 * SPENDLY-660 — load categories by revision instead of a live listener.
 *
 * Categories are a near-static catalogue (~190 docs per user in production,
 * 287 in the demo seed). A live listener re-reads all of them after every
 * 30-minute gap, because Firestore bills a re-attached listener as a new
 * query; the SPENDLY-588 lab measured that as 62% of a cold launch.
 *
 * Instead:
 * - every category write increments `users/{uid}/meta/categories.categoriesRevision`;
 * - the app listens to that one document;
 * - when the revision matches the one this device last loaded from the server
 *   (within `CATEGORIES_SERVER_MAX_AGE_MS`), categories come from the
 *   Firestore cache, which costs no billed reads; otherwise from the server.
 *
 * App versions older than this change don't bump the revision, so the age
 * limit bounds how stale categories can be.
 *
 * Pure: no SDK, no React Native.
 */

export const CATEGORIES_REVISION_FIELD = "categoriesRevision";

/** After this long, load from the server even when the revision is unchanged. */
export const CATEGORIES_SERVER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** What this device last loaded from the server. */
export type CategoriesLoadRecord = {
  revision: number;
  count: number;
  loadedAtMs: number;
};

/** `meta/categories.categoriesRevision`, or 0 when it was never written. */
export function categoriesRevisionOf(meta: unknown): number {
  if (!meta || typeof meta !== "object") return 0;
  const value = (meta as Record<string, unknown>)[CATEGORIES_REVISION_FIELD];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function parseCategoriesLoadRecord(raw: unknown): CategoriesLoadRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (!ok(r.revision) || !ok(r.count) || !ok(r.loadedAtMs)) return null;
  return { revision: r.revision as number, count: r.count as number, loadedAtMs: r.loadedAtMs as number };
}

/** Whether the cached categories can be trusted for `revision`. */
export function canUseCachedCategories(input: {
  revision: number;
  record: CategoriesLoadRecord | null;
  nowMs: number;
  force: boolean;
}): boolean {
  const { revision, record, nowMs, force } = input;
  if (force || !record) return false;
  if (record.revision !== revision) return false;
  const age = nowMs - record.loadedAtMs;
  return age >= 0 && age < CATEGORIES_SERVER_MAX_AGE_MS;
}

export type CategoriesQueryResult<T> = { docs: T[]; fromCache: boolean };

export type LoadCategoriesDeps<T> = {
  revision: number;
  force: boolean;
  nowMs: number;
  readRecord(): Promise<CategoriesLoadRecord | null>;
  writeRecord(record: CategoriesLoadRecord): Promise<void>;
  /** `getDocsFromCache`; rejects when the cache can't answer. */
  fromCache(): Promise<CategoriesQueryResult<T>>;
  /** `getDocs`: the server, or the cache when offline (`fromCache: true`). */
  fromServer(): Promise<CategoriesQueryResult<T>>;
};

export type LoadCategoriesResult<T> = { categories: T[]; source: "cache" | "server" };

/**
 * Loads categories for `revision`. Rejects only when the server load fails;
 * a cache miss or a cache that disagrees with the last server load falls
 * through to the server.
 */
export async function loadCategoriesByRevision<T>(deps: LoadCategoriesDeps<T>): Promise<LoadCategoriesResult<T>> {
  const record = await deps.readRecord().catch(() => null);
  if (canUseCachedCategories({ revision: deps.revision, record, nowMs: deps.nowMs, force: deps.force })) {
    try {
      const cached = await deps.fromCache();
      // An evicted or partial cache doesn't match the count the server gave.
      if (cached.docs.length > 0 && cached.docs.length === record!.count) {
        return { categories: cached.docs, source: "cache" };
      }
    } catch {
      // Not in the cache: load from the server.
    }
  }
  const result = await deps.fromServer();
  if (!result.fromCache) {
    await deps
      .writeRecord({ revision: deps.revision, count: result.docs.length, loadedAtMs: deps.nowMs })
      .catch(() => undefined);
  }
  return { categories: result.docs, source: result.fromCache ? "cache" : "server" };
}

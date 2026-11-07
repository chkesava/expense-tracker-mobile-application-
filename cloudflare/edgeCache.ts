/**
 * SPENDLY-703: Netlify's durable CDN cache, rebuilt on Cloudflare's Cache API.
 *
 * The market handlers ask Netlify's CDN to cache their answers with
 * `Netlify-CDN-Cache-Control: public, durable, s-maxage=N, stale-while-revalidate=M`
 * and key them on chosen query parameters with `Netlify-Vary: query=a|b`.
 * Cloudflare ignores both headers, so without this every request would reach
 * Yahoo and spend Worker CPU. The same rules apply here:
 *
 * - only GET, only answers whose CDN header has an `s-maxage` and no `no-store`;
 * - fresh for `s-maxage`, then served stale for `stale-while-revalidate` while
 *   one refresh runs in the background;
 * - the key is the path plus the `Netlify-Vary` parameters only, so extra
 *   query parameters can't bypass the cache;
 * - `If-None-Match` is answered from the stored ETag, as a CDN would.
 *
 * Cache API entries are per data centre and best effort; a miss just runs the
 * handler.
 */

export type CacheLike = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

export type CdnPolicy = {
  sMaxAge: number;
  staleWhileRevalidate: number;
  /** Query parameters the key varies on; null = all of them. */
  varyQuery: string[] | null;
};

const CACHED_AT = "x-spendly-cached-at";
const FRESH_FOR = "x-spendly-fresh-for";
const BROWSER_CACHE_CONTROL = "x-spendly-browser-cache-control";
const INTERNAL_HEADERS = [CACHED_AT, FRESH_FOR, BROWSER_CACHE_CONTROL];
export const CACHE_STATUS_HEADER = "x-backup-cache";

function directiveSeconds(directives: string[], name: string): number {
  const found = directives.find((d) => d.startsWith(`${name}=`));
  const value = found ? Number(found.slice(name.length + 1)) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The caching a handler asked Netlify's CDN for, or null when it asked for none. */
export function cdnPolicy(headers: Headers): CdnPolicy | null {
  const raw = headers.get("netlify-cdn-cache-control");
  if (!raw) return null;
  const directives = raw.toLowerCase().split(",").map((d) => d.trim());
  if (directives.includes("no-store") || directives.includes("private")) return null;
  const sMaxAge = directiveSeconds(directives, "s-maxage");
  if (!sMaxAge) return null;
  const vary = /query=([^,;]+)/i.exec(headers.get("netlify-vary") ?? "");
  return {
    sMaxAge,
    staleWhileRevalidate: directiveSeconds(directives, "stale-while-revalidate"),
    varyQuery: vary ? vary[1].split("|").map((p) => p.trim()).filter(Boolean) : null,
  };
}

/** The cache key for `url`: the path plus the varied query parameters, in a fixed order. */
export function cacheKey(url: URL, varyQuery: string[] | null): string {
  const names = [...new Set(varyQuery ?? [...url.searchParams.keys()])].sort();
  const key = new URL(url.origin + url.pathname);
  for (const name of names) for (const value of url.searchParams.getAll(name)) key.searchParams.append(name, value);
  return key.toString();
}

/** Where the key's varied parameters for a path are remembered (they're only known after the first answer). */
function varyRecordKey(url: URL): string {
  return `${url.origin}/__spendly-vary${url.pathname}`;
}

async function knownVary(cache: CacheLike, url: URL): Promise<string[] | null | undefined> {
  const record = await cache.match(new Request(varyRecordKey(url)));
  if (!record) return undefined;
  const parsed = (await record.json().catch(() => undefined)) as { varyQuery?: string[] | null } | undefined;
  return parsed ? parsed.varyQuery ?? null : undefined;
}

export type CachedAnswer = { response: Response; state: "fresh" | "stale" };

export async function lookup(cache: CacheLike, url: URL, now: number): Promise<CachedAnswer | null> {
  const vary = await knownVary(cache, url);
  if (vary === undefined) return null;
  const stored = await cache.match(new Request(cacheKey(url, vary)));
  if (!stored) return null;
  const age = (now - Number(stored.headers.get(CACHED_AT))) / 1000;
  const freshFor = Number(stored.headers.get(FRESH_FOR));
  if (!Number.isFinite(age) || !Number.isFinite(freshFor) || age < 0) return null;
  return { response: stored, state: age <= freshFor ? "fresh" : "stale" };
}

/** Stores a handler's answer if it asked for CDN caching. Returns whether it did. */
export async function store(cache: CacheLike, url: URL, response: Response, now: number): Promise<boolean> {
  const policy = cdnPolicy(response.headers);
  if (!policy || response.status === 304 || response.status === 206) return false;
  const headers = new Headers(response.headers);
  headers.set(BROWSER_CACHE_CONTROL, response.headers.get("cache-control") ?? "");
  headers.set("Cache-Control", `public, max-age=${policy.sMaxAge + policy.staleWhileRevalidate}`);
  headers.set(CACHED_AT, String(now));
  headers.set(FRESH_FOR, String(policy.sMaxAge));
  const body = await response.clone().arrayBuffer();
  await cache.put(new Request(cacheKey(url, policy.varyQuery)), new Response(body, { status: response.status, headers }));
  await cache.put(
    new Request(varyRecordKey(url)),
    new Response(JSON.stringify({ varyQuery: policy.varyQuery }), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${policy.sMaxAge + policy.staleWhileRevalidate}` },
    })
  );
  return true;
}

/**
 * The answer the browser gets from a stored response: the handler's own browser
 * Cache-Control, no internal headers, and a 304 when the browser already has
 * this ETag.
 */
export async function serveFromCache(stored: Response, request: Request, status: string): Promise<Response> {
  const headers = new Headers(stored.headers);
  // A stored copy carries the handler's browser Cache-Control aside (its own is
  // the cache's lifetime); a fresh answer still has it in place.
  const browserCacheControl = headers.get(BROWSER_CACHE_CONTROL);
  for (const name of INTERNAL_HEADERS) headers.delete(name);
  if (browserCacheControl !== null) {
    if (browserCacheControl) headers.set("Cache-Control", browserCacheControl);
    else headers.delete("Cache-Control");
  }
  headers.set(CACHE_STATUS_HEADER, status);
  const etag = headers.get("etag");
  if (etag && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(await stored.clone().arrayBuffer(), { status: stored.status, headers });
}

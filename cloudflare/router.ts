/**
 * SPENDLY-703: what the Cloudflare Pages backup's Worker does (worker.ts is
 * just the entry point). `_routes.json` sends it every request except the
 * content-hashed folders. It does what Netlify's `_redirects` and function
 * hosting do:
 *
 * - `/api/<name>` and `/.netlify/functions/<name>` run the same handlers as
 *   Netlify (cloudflare/functions.ts), with Netlify's CDN caching rebuilt
 *   (edgeCache.ts). Functions the backup doesn't run answer a JSON 503.
 *   An API path never falls through to the app's HTML.
 * - Anything else is a static file. A missing path without a file extension
 *   gets its product's index.html with a 200, like Netlify's SPA rewrites.
 */
import { API_FUNCTIONS, SECURITY_HEADERS, isApiPath, spaIndexFor } from "../scripts/lib/webHosting";
import { CACHE_STATUS_HEADER, lookup, serveFromCache, store, type CacheLike } from "./edgeCache";
import { toNetlifyEvent, toResponse, type NetlifyHandlerModule } from "./netlifyAdapter";

export type AssetsBinding = { fetch(request: Request): Promise<Response> };
export type Env = { ASSETS: AssetsBinding };
export type ExecutionContextLike = { waitUntil(promise: Promise<unknown>): void };

export type WorkerDeps = {
  loaders: Record<string, () => Promise<NetlifyHandlerModule>>;
  netlifyOnly: Record<string, string>;
  /** Cloudflare's default cache, or null where there is none (tests, local runs). */
  cache: () => CacheLike | null;
  now: () => number;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** `_headers` only covers static files, so function answers get the same security headers here (minus the CSP, which is for pages). */
const API_SECURITY_HEADERS = SECURITY_HEADERS.filter(([name]) => name !== "Content-Security-Policy");

export const UNAVAILABLE_MESSAGE = "This feature isn't available on the backup site. Try again later.";

/** The function a path addresses, the way Netlify routes it, or null. */
export function functionNameFor(pathname: string): string | null {
  const direct = /^\/\.netlify\/functions\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (direct) return direct[1];
  const api = /^\/api\/([a-z0-9-]+)\/?$/.exec(pathname);
  return api && API_FUNCTIONS.includes(api[1]) ? api[1] : null;
}

function withApiHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of API_SECURITY_HEADERS) if (!headers.has(name)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(status: number, payload: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return withApiHeaders(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
    })
  );
}

export function createWorker(deps: WorkerDeps) {
  const modules = new Map<string, Promise<NetlifyHandlerModule>>();

  function load(name: string): Promise<NetlifyHandlerModule> {
    let pending = modules.get(name);
    if (!pending) {
      pending = deps.loaders[name]();
      // A failed import is retried on the next request instead of being remembered.
      pending.catch(() => modules.delete(name));
      modules.set(name, pending);
    }
    return pending;
  }

  async function runHandler(name: string, request: Request, omitHeaders: string[] = []): Promise<Response> {
    const { handler } = await load(name);
    return toResponse(await handler(await toNetlifyEvent(request, omitHeaders)));
  }

  async function serveFunction(name: string, request: Request, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    const cache = request.method === "GET" ? deps.cache() : null;
    if (!cache) return withApiHeaders(await runHandler(name, request));

    const cached = await lookup(cache, url, deps.now());
    if (cached?.state === "fresh") return withApiHeaders(await serveFromCache(cached.response, request, "HIT"));
    if (cached?.state === "stale") {
      // Answer now from the stale copy; refresh it once in the background.
      ctx.waitUntil(
        runHandler(name, request, ["if-none-match"])
          .then((fresh) => store(cache, url, fresh, deps.now()))
          .catch((error) => console.error(`[backup] ${name} refresh failed`, error instanceof Error ? error.message : error))
      );
      return withApiHeaders(await serveFromCache(cached.response, request, "STALE"));
    }

    // Miss: ask without the browser's ETag so the full answer can be stored.
    const fresh = await runHandler(name, request, ["if-none-match"]);
    if (await store(cache, url, fresh, deps.now())) {
      return withApiHeaders(await serveFromCache(fresh, request, "MISS"));
    }
    const headers = new Headers(fresh.headers);
    headers.set(CACHE_STATUS_HEADER, "BYPASS");
    return withApiHeaders(new Response(fresh.body, { status: fresh.status, headers }));
  }

  async function serveApi(request: Request, ctx: ExecutionContextLike): Promise<Response> {
    const name = functionNameFor(new URL(request.url).pathname);
    if (name && name in deps.netlifyOnly) {
      if (request.method === "OPTIONS") return withApiHeaders(new Response(null, { status: 204, headers: CORS }));
      return json(503, { success: false, code: "BACKUP_UNAVAILABLE", error: UNAVAILABLE_MESSAGE, message: UNAVAILABLE_MESSAGE }, CORS);
    }
    if (!name || !(name in deps.loaders)) return json(404, { success: false, error: "Not found.", message: "Not found." }, CORS);
    try {
      return await serveFunction(name, request, ctx);
    } catch (error) {
      console.error(`[backup] ${name} failed`, error instanceof Error ? error.message : error);
      return json(500, { success: false, error: "Something went wrong. Try again.", message: "Something went wrong. Try again." }, CORS);
    }
  }

  async function serveStatic(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || (request.method !== "GET" && request.method !== "HEAD")) return response;
    const url = new URL(request.url);
    const index = spaIndexFor(url.pathname);
    if (!index) return response;
    const page = await env.ASSETS.fetch(new Request(new URL(index, url), { method: request.method, headers: request.headers }));
    if (!page.ok) return response;
    return new Response(page.body, { status: 200, headers: page.headers });
  }

  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
      const { pathname } = new URL(request.url);
      return isApiPath(pathname) ? serveApi(request, ctx) : serveStatic(request, env);
    },
  };
}

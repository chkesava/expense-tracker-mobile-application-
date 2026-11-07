import { describe, expect, it, vi } from "vitest";

import { UNAVAILABLE_MESSAGE, createWorker, functionNameFor, type Env } from "./router";
import type { NetlifyEvent, NetlifyResult } from "./netlifyAdapter";
import { MemoryCache } from "./testCache";

const ORIGIN = "https://backup.example";

/** Static files of a tiny site: the root app, the expense app and one bundle. */
function assets(): Env {
  const files: Record<string, { body: string; type: string }> = {
    "/": { body: "<html>ROOT</html>", type: "text/html" },
    "/expense/": { body: "<html>EXPENSE</html>", type: "text/html" },
    "/expense/_expo/entry.js": { body: "js", type: "application/javascript" },
  };
  return {
    ASSETS: {
      fetch: vi.fn(async (request: Request) => {
        const file = files[new URL(request.url).pathname];
        return file
          ? new Response(file.body, { status: 200, headers: { "Content-Type": file.type, "X-Frame-Options": "DENY" } })
          : new Response("<html>404 page</html>", { status: 404, headers: { "Content-Type": "text/html" } });
      }),
    },
  };
}

const ctx = () => {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (p: Promise<unknown>) => void pending.push(p), settle: () => Promise.all(pending) };
};

function setup(handlers: Record<string, (event: NetlifyEvent) => Promise<NetlifyResult>>, opts: { cache?: MemoryCache; now?: () => number } = {}) {
  const calls: Record<string, NetlifyEvent[]> = {};
  const loaders = Object.fromEntries(
    Object.entries(handlers).map(([name, fn]) => [
      name,
      async () => ({
        handler: async (event: NetlifyEvent) => {
          (calls[name] ??= []).push(event);
          return fn(event);
        },
      }),
    ])
  );
  const worker = createWorker({
    loaders,
    netlifyOnly: { "ganesh-draw": "Firestore", "screener-universe": "CPU" },
    cache: () => opts.cache ?? null,
    now: opts.now ?? (() => 0),
  });
  const env = assets();
  const c = ctx();
  const fetch = (path: string, init?: RequestInit) => worker.fetch(new Request(ORIGIN + path, init), env, c);
  return { fetch, calls, env, settle: c.settle };
}

const ok = (body: unknown, headers: Record<string, string> = {}): NetlifyResult => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

describe("functionNameFor", () => {
  it.each([
    ["/api/stock", "stock"],
    ["/api/stock-quotes/", "stock-quotes"],
    ["/.netlify/functions/nutrition-ai", "nutrition-ai"],
    ["/.netlify/functions/ganesh-draw", "ganesh-draw"],
    // Only the market functions are routed under /api, as on Netlify.
    ["/api/nutrition-ai", null],
    ["/api/unknown", null],
    ["/api/stock/extra", null],
    ["/.netlify/functions/", null],
  ])("%s -> %s", (path, name) => {
    expect(functionNameFor(path)).toBe(name);
  });
});

describe("functions", () => {
  it("runs the same handler at /api/<name> and /.netlify/functions/<name>", async () => {
    const { fetch, calls } = setup({ stock: async (e) => ok({ symbol: e.queryStringParameters.symbol }) });
    const a = await fetch("/api/stock?symbol=TCS.NS");
    const b = await fetch("/.netlify/functions/stock?symbol=INFY.NS");
    expect(await a.json()).toEqual({ symbol: "TCS.NS" });
    expect(await b.json()).toEqual({ symbol: "INFY.NS" });
    expect(calls.stock).toHaveLength(2);
  });

  it("passes POST bodies and auth headers to the handler", async () => {
    const { fetch, calls } = setup({ "nutrition-ai": async () => ok({ items: [] }) });
    await fetch("/.netlify/functions/nutrition-ai", { method: "POST", headers: { Authorization: "Bearer t" }, body: '{"text":"idli"}' });
    expect(calls["nutrition-ai"][0]).toMatchObject({ httpMethod: "POST", body: '{"text":"idli"}' });
    expect(calls["nutrition-ai"][0].headers.authorization).toBe("Bearer t");
  });

  it("adds the security headers to function answers", async () => {
    const { fetch } = setup({ stock: async () => ok({}) });
    const response = await fetch("/api/stock");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=");
  });

  it("answers a JSON 503 for a function the backup doesn't run, and never calls a handler", async () => {
    const { fetch, calls } = setup({});
    for (const path of ["/.netlify/functions/ganesh-draw", "/api/screener-universe"]) {
      const response = await fetch(path, { method: path.includes("ganesh") ? "POST" : "GET" });
      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(await response.json()).toMatchObject({ success: false, code: "BACKUP_UNAVAILABLE", error: UNAVAILABLE_MESSAGE });
    }
    expect(calls).toEqual({});
  });

  it("lets a browser preflight an unavailable function, so the 503 is readable", async () => {
    const { fetch } = setup({});
    const response = await fetch("/.netlify/functions/ganesh-draw", { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  it.each(["/api/unknown", "/api", "/.netlify/functions/nope", "/.netlify/other"])("answers %s with JSON 404, never the app", async (path) => {
    const { fetch, env } = setup({});
    const response = await fetch(path);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("turns a handler crash into a JSON 500", async () => {
    const { fetch } = setup({
      stock: async () => {
        throw new Error("boom");
      },
    });
    const response = await fetch("/api/stock");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it("retries a module that failed to load", async () => {
    let attempts = 0;
    const worker = createWorker({
      loaders: {
        stock: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("load failed");
          return { handler: async () => ok({ ok: true }) };
        },
      },
      netlifyOnly: {},
      cache: () => null,
      now: () => 0,
    });
    const env = assets();
    expect((await worker.fetch(new Request(`${ORIGIN}/api/stock`), env, ctx())).status).toBe(500);
    expect((await worker.fetch(new Request(`${ORIGIN}/api/stock`), env, ctx())).status).toBe(200);
  });
});

describe("pages", () => {
  it("serves an existing file as is", async () => {
    const { fetch } = setup({});
    const response = await fetch("/expense/_expo/entry.js");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("js");
  });

  it.each([
    ["/expense/dashboard", "<html>EXPENSE</html>"],
    ["/expense/settings/profile", "<html>EXPENSE</html>"],
    ["/split/abc123", "<html>ROOT</html>"],
    ["/random/deep/path", "<html>ROOT</html>"],
  ])("serves %s its app with a 200", async (path, html) => {
    const { fetch } = setup({});
    const response = await fetch(path);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(html);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("keeps a missing file a 404", async () => {
    const { fetch } = setup({});
    expect((await fetch("/expense/_expo/missing.js")).status).toBe(404);
  });

  it("doesn't turn a POST to a missing page into the app", async () => {
    const { fetch } = setup({});
    expect((await fetch("/expense/dashboard", { method: "POST", body: "x" })).status).toBe(404);
  });
});

describe("CDN caching of function answers", () => {
  const cdn = {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control": "public, durable, s-maxage=900, stale-while-revalidate=60",
    "Netlify-Vary": "query=symbols",
    ETag: '"v1"',
  };

  it("answers a repeat request from the cache without running the handler", async () => {
    const cache = new MemoryCache();
    const { fetch, calls } = setup({ "stock-quotes": async () => ok({ n: 1 }, cdn) }, { cache, now: () => 1000 });
    const first = await fetch("/api/stock-quotes?symbols=TCS.NS");
    const second = await fetch("/api/stock-quotes?symbols=TCS.NS&junk=1");
    expect(first.headers.get("x-backup-cache")).toBe("MISS");
    expect(second.headers.get("x-backup-cache")).toBe("HIT");
    expect(await second.json()).toEqual({ n: 1 });
    expect(second.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(calls["stock-quotes"]).toHaveLength(1);
  });

  it("asks the handler without the browser's ETag, then answers the browser's ETag itself", async () => {
    const cache = new MemoryCache();
    const { fetch, calls } = setup({ "stock-quotes": async () => ok({ n: 1 }, cdn) }, { cache });
    const response = await fetch("/api/stock-quotes?symbols=TCS.NS", { headers: { "If-None-Match": '"v1"' } });
    expect(calls["stock-quotes"][0].headers["if-none-match"]).toBeUndefined();
    expect(response.status).toBe(304);
  });

  it("serves a stale copy and refreshes it once in the background", async () => {
    const cache = new MemoryCache();
    let now = 0;
    let version = 0;
    const { fetch, calls, settle } = setup(
      { "stock-quotes": async () => ok({ version: ++version }, cdn) },
      { cache, now: () => now }
    );
    await fetch("/api/stock-quotes?symbols=TCS.NS");
    now = 930_000; // past s-maxage (900 s), within stale-while-revalidate (60 s)
    const stale = await fetch("/api/stock-quotes?symbols=TCS.NS");
    expect(stale.headers.get("x-backup-cache")).toBe("STALE");
    expect(await stale.json()).toEqual({ version: 1 });
    await settle();
    expect(calls["stock-quotes"]).toHaveLength(2);
    const refreshed = await fetch("/api/stock-quotes?symbols=TCS.NS");
    expect(refreshed.headers.get("x-backup-cache")).toBe("HIT");
    expect(await refreshed.json()).toEqual({ version: 2 });
  });

  it("doesn't cache what the handler marks no-store, nor POSTs", async () => {
    const cache = new MemoryCache();
    const { fetch, calls } = setup(
      {
        "stock-quotes": async () => ok({}, { "Netlify-CDN-Cache-Control": "no-store" }),
        "nutrition-ai": async () => ok({}, { "Netlify-CDN-Cache-Control": "public, s-maxage=60" }),
      },
      { cache }
    );
    await fetch("/api/stock-quotes?symbols=X");
    const bypass = await fetch("/api/stock-quotes?symbols=X");
    expect(bypass.headers.get("x-backup-cache")).toBe("BYPASS");
    await fetch("/.netlify/functions/nutrition-ai", { method: "POST", body: "{}" });
    await fetch("/.netlify/functions/nutrition-ai", { method: "POST", body: "{}" });
    expect(calls["stock-quotes"]).toHaveLength(2);
    expect(calls["nutrition-ai"]).toHaveLength(2);
    expect(cache.entries.size).toBe(0);
  });

  it("works without a cache (local runs)", async () => {
    const { fetch, calls } = setup({ "stock-quotes": async () => ok({ n: 1 }, cdn) });
    expect((await fetch("/api/stock-quotes?symbols=TCS.NS")).status).toBe(200);
    expect((await fetch("/api/stock-quotes?symbols=TCS.NS")).status).toBe(200);
    expect(calls["stock-quotes"]).toHaveLength(2);
  });
});

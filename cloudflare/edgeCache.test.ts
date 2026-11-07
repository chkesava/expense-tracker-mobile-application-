import { describe, expect, it } from "vitest";

import { cacheKey, cdnPolicy, lookup, serveFromCache, store } from "./edgeCache";
import { MemoryCache } from "./testCache";

const answer = (status: number, headers: Record<string, string>, body: string | null = '{"ok":true}') =>
  new Response(status === 304 ? null : body, { status, headers });

describe("cdnPolicy", () => {
  it("reads s-maxage, stale-while-revalidate and Netlify-Vary", () => {
    const headers = new Headers({
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=900, stale-while-revalidate=60",
      "Netlify-Vary": "query=symbol|range",
    });
    expect(cdnPolicy(headers)).toEqual({ sMaxAge: 900, staleWhileRevalidate: 60, varyQuery: ["symbol", "range"] });
  });

  it("varies on every parameter when Netlify-Vary is absent", () => {
    expect(cdnPolicy(new Headers({ "Netlify-CDN-Cache-Control": "public, durable, s-maxage=60" }))).toEqual({
      sMaxAge: 60,
      staleWhileRevalidate: 0,
      varyQuery: null,
    });
  });

  it.each([
    [{}],
    [{ "Netlify-CDN-Cache-Control": "no-store" }],
    [{ "Netlify-CDN-Cache-Control": "public, durable" }],
    [{ "Netlify-CDN-Cache-Control": "private, s-maxage=60" }],
    [{ "Cache-Control": "public, max-age=600" }],
  ])("asks for no CDN caching: %j", (headers) => {
    expect(cdnPolicy(new Headers(headers))).toBeNull();
  });
});

describe("cacheKey", () => {
  const url = new URL("https://b.example/api/stock-history?range=1Y&symbol=TCS.NS&cachebust=123");

  it("keeps only the varied parameters, in a fixed order", () => {
    expect(cacheKey(url, ["symbol", "range"])).toBe("https://b.example/api/stock-history?range=1Y&symbol=TCS.NS");
  });

  it("an extra parameter can't create a new entry", () => {
    const other = new URL("https://b.example/api/stock-history?symbol=TCS.NS&range=1Y&cachebust=999");
    expect(cacheKey(other, ["symbol", "range"])).toBe(cacheKey(url, ["symbol", "range"]));
  });

  it("keeps every parameter, sorted, when nothing is varied", () => {
    expect(cacheKey(url, null)).toBe("https://b.example/api/stock-history?cachebust=123&range=1Y&symbol=TCS.NS");
  });
});

describe("store and lookup", () => {
  const url = new URL("https://b.example/api/stock-quotes?symbols=TCS.NS");
  const cached = () =>
    answer(200, {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=900, stale-while-revalidate=60",
      "Netlify-Vary": "query=symbols",
      ETag: '"v1"',
    });

  it("is fresh for s-maxage, then stale for stale-while-revalidate", async () => {
    const cache = new MemoryCache();
    expect(await store(cache, url, cached(), 0)).toBe(true);
    expect((await lookup(cache, url, 900_000))?.state).toBe("fresh");
    expect((await lookup(cache, url, 901_000))?.state).toBe("stale");
  });

  it("finds the entry from a URL with extra parameters", async () => {
    const cache = new MemoryCache();
    await store(cache, url, cached(), 0);
    expect(await lookup(cache, new URL(`${url}&junk=1`), 1000)).not.toBeNull();
    expect(await lookup(cache, new URL("https://b.example/api/stock-quotes?symbols=INFY.NS"), 1000)).toBeNull();
  });

  it("stores a short-lived negative answer the handler asked to cache", async () => {
    const cache = new MemoryCache();
    const notFound = answer(404, { "Netlify-CDN-Cache-Control": "public, durable, s-maxage=60" }, '{"success":false}');
    expect(await store(cache, url, notFound, 0)).toBe(true);
    expect((await lookup(cache, url, 1000))?.response.status).toBe(404);
  });

  it("stores nothing the handler said not to", async () => {
    const cache = new MemoryCache();
    expect(await store(cache, url, answer(502, { "Netlify-CDN-Cache-Control": "no-store" }), 0)).toBe(false);
    expect(await store(cache, url, answer(304, { "Netlify-CDN-Cache-Control": "public, s-maxage=60" }), 0)).toBe(false);
    expect(cache.entries.size).toBe(0);
  });

  it("serves the browser the handler's own Cache-Control and no internal headers", async () => {
    const cache = new MemoryCache();
    await store(cache, url, cached(), 0);
    const hit = await lookup(cache, url, 1000);
    const response = await serveFromCache(hit!.response, new Request(url), "HIT");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("x-backup-cache")).toBe("HIT");
    expect([...response.headers.keys()].some((k) => k.startsWith("x-spendly-"))).toBe(false);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("answers 304 when the browser already has the ETag", async () => {
    const cache = new MemoryCache();
    await store(cache, url, cached(), 0);
    const hit = await lookup(cache, url, 1000);
    const response = await serveFromCache(hit!.response, new Request(url, { headers: { "If-None-Match": '"v1"' } }), "HIT");
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });
});

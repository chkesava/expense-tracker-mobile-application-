import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetStockQuotesCacheForTests, handler } from "./stock-quotes";

/** SPENDLY-656: /api/stock-quotes. */

function upstream(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  } as unknown as Response;
}

const DAYS = [1792986300, 1793072700, 1793159100, 1793245500, 1793331900];
const get = (symbols?: string, headers: Record<string, string> = {}) => ({ httpMethod: "GET", queryStringParameters: symbols === undefined ? {} : { symbols }, headers });
const body = (r: { body: string }) => JSON.parse(r.body);
const symbolsOf = (url: unknown) => new URL(String(url)).searchParams.get("symbols")!.split(",");

/** Prices every requested symbol except those in `unknown`: closes 100,101,102,103,104+i. */
function yahoo(unknown: string[] = [], failFirstBatch = false) {
  let call = 0;
  return vi.fn(async (url: unknown) => {
    call += 1;
    if (failFirstBatch && call === 1) return upstream({}, 500);
    const syms = symbolsOf(url).filter((s) => !unknown.includes(s));
    if (syms.length === 0) return upstream({ spark: { result: null, error: { code: "Not Found", description: "No data found for spark symbols" } } }, 404);
    return upstream(Object.fromEntries(syms.map((s, i) => [s, { symbol: s, timestamp: DAYS, close: [100, 101, 102, 103, 104 + i], chartPreviousClose: 1 }])));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 31, 6, 0))); // Saturday: closed
  vi.spyOn(console, "log").mockImplementation(() => {});
  __resetStockQuotesCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stock-quotes", () => {
  it("prices a list from 5-day spark with the last two closes, and caches by symbol set", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handler(get("tcs,^nsei"));
    expect(res.statusCode).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v8/finance/spark?symbols=TCS.NS,%5ENSEI&range=5d&interval=1d");
    const dto = body(res);
    expect(dto).toMatchObject({ success: true, symbols: ["TCS.NS", "^NSEI"], missing: [], failed: [], stale: false, status: { state: "closed" } });
    expect(dto.quotes[0]).toMatchObject({ symbol: "TCS.NS", price: 104, previousClose: 103, change: 1, isIndex: false, currency: "INR" });
    expect(dto.quotes[1]).toMatchObject({ symbol: "^NSEI", isIndex: true });
    expect(res.headers["Netlify-Vary"]).toBe("query=symbols");
    expect(res.headers["Netlify-CDN-Cache-Control"]).toMatch(/^public, durable, s-maxage=\d+, stale-while-revalidate=60$/);
  });

  it("splits 50 symbols into batches of at most 20", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);
    const fifty = Array.from({ length: 50 }, (_, i) => `S${String(i).padStart(2, "0")}`).join(",");
    const dto = body(await handler(get(fifty)));
    expect(fetchMock.mock.calls.map((c) => symbolsOf(c[0]).length)).toEqual([20, 20, 10]);
    expect(dto.quotes).toHaveLength(50);
  });

  it("lists unknown symbols as missing, including a batch Yahoo answers with 404", async () => {
    vi.stubGlobal("fetch", yahoo(["NOPE.NS", "GONE.NS"]));
    expect(body(await handler(get("TCS,NOPE")))).toMatchObject({ missing: ["NOPE.NS"], failed: [] });
    __resetStockQuotesCacheForTests();
    const res = await handler(get("NOPE,GONE"));
    expect(res.statusCode).toBe(200);
    expect(body(res)).toMatchObject({ quotes: [], missing: ["GONE.NS", "NOPE.NS"], failed: [] });
  });

  it("returns what priced and lists the failed batch's symbols when one batch fails", async () => {
    vi.stubGlobal("fetch", yahoo([], true));
    const symbols = Array.from({ length: 25 }, (_, i) => `S${String(i).padStart(2, "0")}`).join(",");
    const res = await handler(get(symbols));
    expect(res.statusCode).toBe(200);
    const dto = body(res);
    expect(dto.failed).toHaveLength(20);
    expect(dto.quotes).toHaveLength(5);
    expect(res.headers["Netlify-CDN-Cache-Control"]).toContain("s-maxage=60,");
  });

  it("serves the last complete answer marked stale when the provider fails", async () => {
    vi.stubGlobal("fetch", yahoo());
    await handler(get("TCS"));
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 31, 7, 0)));
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 503)));
    const res = await handler(get("TCS"));
    expect(res.statusCode).toBe(200);
    expect(body(res)).toMatchObject({ stale: true, quotes: [{ symbol: "TCS.NS", price: 104 }] });
  });

  it("is a 502 with no-store when everything fails and nothing is cached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const res = await handler(get("TCS,INFY"));
    expect(res.statusCode).toBe(502);
    expect(body(res)).toMatchObject({ success: false, code: "UPSTREAM" });
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("no-store");
  });

  it("serves a fresh repeat from memory (same set, any order) and dedupes concurrent misses", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([handler(get("TCS,INFY")), handler(get("infy,tcs"))]);
    await handler(get("INFY.NS,TCS.NS"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing, invalid or oversized list and non-GET without calling Yahoo", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);
    expect((await handler(get())).statusCode).toBe(400);
    expect((await handler(get("TCS,MF:1"))).statusCode).toBe(400);
    expect((await handler(get(Array.from({ length: 51 }, (_, i) => `S${i}`).join(",")))).statusCode).toBe(400);
    expect((await handler({ httpMethod: "POST", queryStringParameters: { symbols: "TCS" } })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

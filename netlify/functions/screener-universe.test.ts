import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NIFTY500, NIFTY500_AS_OF } from "../../shared/data/nifty500";
import { __resetScreenerUniverseCacheForTests, handler, runPool } from "./screener-universe";

/** SPENDLY-647: /api/screener-universe. */

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

const MIN = 60_000;
// Friday 2026-10-30, 09:15 IST bar and 11:30 IST (open).
const BAR_SEC = Date.UTC(2026, 9, 30, 3, 45) / 1000;
const OPEN_NOW = new Date(Date.UTC(2026, 9, 30, 6, 0));
const AFTER_CLOSE = new Date(Date.UTC(2026, 9, 30, 10, 30));

const get = (headers: Record<string, string> = {}) => ({ httpMethod: "GET", queryStringParameters: {}, headers });
const body = (r: { body: string }) => JSON.parse(r.body);
const symbolsOf = (url: unknown) => new URL(String(url)).searchParams.get("symbols")!.split(",");
const batchIndexOf = (url: unknown) => Math.floor(NIFTY500.findIndex((s) => s.symbol === symbolsOf(url)[0]) / 20);

/** Two daily closes per stock: yesterday 100, today 100 + its index mod 7. */
function sparkPayload(symbols: string[]) {
  return Object.fromEntries(
    symbols.map((symbol) => {
      const i = NIFTY500.findIndex((s) => s.symbol === symbol);
      return [symbol, { symbol, timestamp: [BAR_SEC - 86_400, BAR_SEC], close: [100, 100 + (i % 7)], chartPreviousClose: 50 }];
    })
  );
}

type Answer = () => Response | Promise<Response>;
function yahoo(byBatch: Record<number, Answer> = {}) {
  return vi.fn(async (url: unknown) => {
    const b = batchIndexOf(url);
    return byBatch[b] ? byBatch[b]() : upstream(sparkPayload(symbolsOf(url)));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OPEN_NOW);
  vi.spyOn(console, "log").mockImplementation(() => {});
  __resetScreenerUniverseCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("screener-universe", () => {
  it("prices all 500 stocks from 25 one-year spark batches of at most 20", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(get());

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(25);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain("/v8/finance/spark?symbols=");
      expect(String(call[0])).toContain("&range=1y&interval=1d");
      expect(symbolsOf(call[0]).length).toBeLessThanOrEqual(20);
    }
    const dto = body(res);
    expect(dto).toMatchObject({
      success: true,
      schemaVersion: 1,
      provider: "yahoo",
      universe: "NIFTY500",
      universeAsOf: NIFTY500_AS_OF,
      universeSize: 500,
      priced: 500,
      coverage: 1,
      available: true,
      stale: false,
      status: { state: "open" },
    });
    expect(dto.rows).toHaveLength(500);
    const first = dto.rows[0];
    expect(first).toMatchObject({ symbol: NIFTY500[0].symbol, sector: NIFTY500[0].sector, price: 100, previousClose: 100, changePercent: 0 });
    expect(dto.rows[3]).toMatchObject({ price: 103, changePercent: 3 });
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("public, durable, s-maxage=300, stale-while-revalidate=600");
    expect(res.headers["Cache-Control"]).toBe("public, max-age=0, must-revalidate");
  });

  it("uses a 6-hour CDN lifetime after the close", async () => {
    vi.setSystemTime(AFTER_CLOSE);
    vi.stubGlobal("fetch", yahoo());
    const res = await handler(get());
    expect(body(res).status.state).toBe("closed");
    expect(res.headers["Netlify-CDN-Cache-Control"]).toContain("s-maxage=21600,");
  });

  it("keeps at most 6 requests in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return upstream(sparkPayload(symbolsOf(url)));
      })
    );
    await handler(get());
    expect(peak).toBeLessThanOrEqual(6);
  });

  it("lists a failed batch's stocks unpriced and stays available above 80%", async () => {
    vi.stubGlobal("fetch", yahoo({ 3: () => upstream({}, 500), 7: () => Promise.reject(new TypeError("fetch failed")) }));
    const dto = body(await handler(get()));
    expect(dto).toMatchObject({ available: true, priced: 460, coverage: 0.92 });
    expect(dto.rows).toHaveLength(500);
    expect(dto.rows[60]).toMatchObject({ symbol: NIFTY500[60].symbol, price: null, asOf: null });
  });

  it("treats a spark error body as a failed batch", async () => {
    vi.stubGlobal("fetch", yahoo({ 0: () => upstream({ spark: { result: null, error: { code: "Bad Request" } } }) }));
    expect(body(await handler(get())).priced).toBe(480);
  });

  it("is unavailable (UPSTREAM) below 80% when batches failed and nothing is cached", async () => {
    const down = () => upstream({}, 503);
    vi.stubGlobal("fetch", yahoo(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i, down]))));
    const res = await handler(get());
    expect(res.statusCode).toBe(200);
    expect(body(res)).toMatchObject({ available: false, reason: "UPSTREAM", rows: [], priced: 380 });
    expect(res.headers["Netlify-CDN-Cache-Control"]).toContain("s-maxage=60,");
  });

  it("is a 502 with no-store when every batch failed and nothing is cached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 503)));
    const res = await handler(get());
    expect(res.statusCode).toBe(502);
    expect(body(res)).toEqual({ success: false, code: "UPSTREAM", message: expect.any(String) });
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("no-store");
  });

  it("serves the last good universe marked stale when the provider fails", async () => {
    vi.stubGlobal("fetch", yahoo());
    await handler(get());
    vi.setSystemTime(new Date(AFTER_CLOSE.getTime() + 7 * 60 * MIN));
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 503)));

    const res = await handler(get());

    expect(res.statusCode).toBe(200);
    expect(body(res)).toMatchObject({ stale: true, available: true, priced: 500, fetchedAt: OPEN_NOW.toISOString(), status: { state: "closed" } });
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("public, durable, s-maxage=60, stale-while-revalidate=0");
  });

  it("serves a fresh repeat from memory, and 304 on a matching ETag", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);
    const first = await handler(get());
    vi.setSystemTime(new Date(OPEN_NOW.getTime() + 60_000));
    const again = await handler(get({ "if-none-match": first.headers.ETag }));
    expect(fetchMock).toHaveBeenCalledTimes(25);
    expect(again.statusCode).toBe(304);
  });

  it("merges concurrent misses into one upstream round", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([handler(get()), handler(get())]);
    expect(fetchMock).toHaveBeenCalledTimes(25);
  });

  it("rejects anything but GET", async () => {
    expect((await handler({ httpMethod: "POST" })).statusCode).toBe(405);
  });
});

describe("runPool", () => {
  it("keeps input order and the limit", async () => {
    let active = 0;
    let peak = 0;
    const tasks = [5, 1, 3, 2, 4].map((ms, i) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, ms));
      active -= 1;
      return i;
    });
    expect(await runPool(tasks, 2)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });
});

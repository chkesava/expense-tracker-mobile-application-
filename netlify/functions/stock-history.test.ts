import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { yahooChart } from "../../shared/utils/stockHistory.fixtures";
import { __resetStockHistoryCacheForTests, handler } from "./stock-history";

/** SPENDLY-558: /api/stock-history. */

function upstream(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  } as unknown as Response;
}

const get = (params: Record<string, string>, headers: Record<string, string> = {}) => ({
  httpMethod: "GET",
  queryStringParameters: params,
  headers,
});
const body = (result: { body: string }) => JSON.parse(result.body);
const calledUrl = (mock: ReturnType<typeof vi.fn>, call = 0) => String((mock.mock.calls[call] as unknown[])[0]);

// Friday 2026-10-16 10:30 IST: NSE open.
const MARKET_OPEN = new Date("2026-10-16T05:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MARKET_OPEN);
  vi.spyOn(console, "log").mockImplementation(() => {});
  __resetStockHistoryCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stock-history", () => {
  it("returns a normalised multi-point series with shared-CDN cache headers", async () => {
    const fetchMock = vi.fn(async () => upstream(yahooChart(125, { stepSec: 900, meta: { dataGranularity: "15m" } })));
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(get({ symbol: "kpittech", range: "1w" }));

    expect(res.statusCode).toBe(200);
    expect(calledUrl(fetchMock)).toContain("/v8/finance/chart/KPITTECH.NS?range=5d&interval=15m");
    const dto = body(res);
    expect(dto).toMatchObject({ success: true, symbol: "KPITTECH.NS", range: "1W", interval: "15m", stale: false });
    expect(dto.candles).toHaveLength(125);
    expect(Object.keys(dto.candles[0]).sort()).toEqual(["c", "h", "l", "o", "t", "v"]);
    expect(res.headers["Cache-Control"]).toBe("public, max-age=0, must-revalidate");
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("public, durable, s-maxage=180, stale-while-revalidate=900");
    expect(res.headers["Netlify-Vary"]).toBe("query=symbol|range");
    expect(res.headers.ETag).toMatch(/^"[0-9a-f]+"$/);
  });

  it("uses longer CDN lifetimes for coarser ranges", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream(yahooChart(22, { stepSec: 86400 }))));
    const day = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    const year = await handler(get({ symbol: "KPITTECH.NS", range: "1Y" }));
    expect(day.headers["Netlify-CDN-Cache-Control"]).toContain("s-maxage=60,");
    expect(year.headers["Netlify-CDN-Cache-Control"]).toContain("s-maxage=43200,");
  });

  it("serves a repeat from cache, ignoring chartType and other junk parameters", async () => {
    const fetchMock = vi.fn(async () => upstream(yahooChart(75)));
    vi.stubGlobal("fetch", fetchMock);

    await handler(get({ symbol: "KPITTECH.NS", range: "1D", chartType: "line" }));
    vi.setSystemTime(new Date(MARKET_OPEN.getTime() + 30_000));
    const again = await handler(get({ symbol: "KPITTECH.NS", range: "1D", chartType: "candlestick", bust: "1" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again.statusCode).toBe(200);
    // The remaining fresh lifetime, not a new full one.
    expect(again.headers["Netlify-CDN-Cache-Control"]).toContain("s-maxage=30,");
  });

  it("refetches once the entry expires, and keys ranges separately", async () => {
    const fetchMock = vi.fn(async () => upstream(yahooChart(75)));
    vi.stubGlobal("fetch", fetchMock);

    await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    await handler(get({ symbol: "KPITTECH.NS", range: "1M" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date(MARKET_OPEN.getTime() + 61_000));
    await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    await handler(get({ symbol: "KPITTECH.NS", range: "1M" }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("merges concurrent identical requests into one upstream call", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await gate;
      return upstream(yahooChart(75));
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = Promise.all([
      handler(get({ symbol: "KPITTECH.NS", range: "1D" })),
      handler(get({ symbol: "kpittech", range: "1d" })),
      handler(get({ symbol: "KPITTECH.NS", range: "1D", chartType: "candlestick" })),
    ]);
    release();
    const results = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
  });

  it("serves the last good copy, marked stale, when the provider fails", async () => {
    const fetchMock = vi.fn(async () => upstream(yahooChart(75)));
    vi.stubGlobal("fetch", fetchMock);
    await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));

    vi.setSystemTime(new Date(MARKET_OPEN.getTime() + 5 * 60_000));
    fetchMock.mockImplementation(async () => upstream({}, 500));
    const res = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));

    expect(res.statusCode).toBe(200);
    expect(body(res)).toMatchObject({ stale: true, fetchedAt: MARKET_OPEN.toISOString() });
    expect(body(res).candles).toHaveLength(75);
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("public, durable, s-maxage=60, stale-while-revalidate=0");
  });

  it("does not stand in a copy past the stale-if-error window", async () => {
    const fetchMock = vi.fn(async () => upstream(yahooChart(75)));
    vi.stubGlobal("fetch", fetchMock);
    await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));

    vi.setSystemTime(new Date(MARKET_OPEN.getTime() + 3 * 24 * 3600_000));
    fetchMock.mockImplementation(async () => upstream({}, 500));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    expect(res.statusCode).toBe(502);
  });

  it("maps throttling to a non-cached 429 with Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 429, { "retry-after": "30" })));
    const res = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    expect(res.statusCode).toBe(429);
    expect(body(res)).toMatchObject({ success: false, code: "THROTTLED" });
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("no-store");
    expect(res.headers["Retry-After"]).toBe("30");
  });

  it("never caches a transient error as data", async () => {
    const fetchMock = vi.fn(async () => upstream({}, 503));
    vi.stubGlobal("fetch", fetchMock);
    const first = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    expect(first.statusCode).toBe(502);
    expect(first.headers["Netlify-CDN-Cache-Control"]).toBe("no-store");

    fetchMock.mockImplementation(async () => upstream(yahooChart(75)));
    const second = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    expect(second.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches not-found and no-data answers only briefly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 404)));
    const missing = await handler(get({ symbol: "NOPE.NS", range: "1D" }));
    expect(missing.statusCode).toBe(404);
    expect(body(missing).code).toBe("NOT_FOUND");
    expect(missing.headers["Netlify-CDN-Cache-Control"]).toBe("public, durable, s-maxage=60");

    vi.stubGlobal("fetch", vi.fn(async () => upstream({ chart: { result: [{ meta: {} }], error: null } })));
    const holiday = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    expect(holiday.statusCode).toBe(404);
    expect(body(holiday).code).toBe("NO_DATA");
  });

  it("reports a timeout as 504 after one retry", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const fetchMock = vi.fn(async () => {
      throw timeout;
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    expect(res.statusCode).toBe(504);
    expect(body(res).code).toBe("TIMEOUT");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports an unparseable provider body as MALFORMED", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream(new SyntaxError("Unexpected token <"))));
    const res = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    expect(res.statusCode).toBe(502);
    expect(body(res).code).toBe("MALFORMED");
  });

  it("asks the provider for an index symbol without a .NS suffix (SPENDLY-642)", async () => {
    const fetchMock = vi.fn(async () => upstream(yahooChart(75)));
    vi.stubGlobal("fetch", fetchMock);
    await handler(get({ symbol: "^nsei", range: "1D" }));
    expect(calledUrl(fetchMock)).toContain("/v8/finance/chart/%5ENSEI?range=1d&interval=5m");
  });

  it("rejects bad symbols and ranges without calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const params of [{ symbol: "KPITTECH.NS", range: "2D" }, { symbol: "../x", range: "1D" }, { range: "1D" }, { symbol: "KPITTECH.NS" }]) {
      const res = await handler(get(params as Record<string, string>));
      expect(res.statusCode).toBe(400);
      expect(body(res).code).toBe("BAD_REQUEST");
    }
    expect((await handler({ httpMethod: "POST", queryStringParameters: { symbol: "A", range: "1D" } })).statusCode).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a matching If-None-Match with 304", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream(yahooChart(75))));
    const first = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    const second = await handler(get({ symbol: "KPITTECH.NS", range: "1D" }, { "if-none-match": first.headers.ETag }));
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe("");
  });

  it("logs one privacy-safe diagnostic line per request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream(yahooChart(75))));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await handler(get({ symbol: "KPITTECH.NS", range: "1D" }, { "x-nf-client-connection-ip": "1.2.3.4" }));
    await handler(get({ symbol: "KPITTECH.NS", range: "1D" }));
    const lines = log.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(lines.map((l) => l.outcome)).toEqual(["miss", "hit"]);
    expect(lines[0]).toMatchObject({ fn: "stock-history", range: "1D", status: 200, points: 75 });
    expect(JSON.stringify(lines)).not.toContain("1.2.3.4");
    expect(JSON.stringify(lines)).not.toContain("yahoo.com");
  });
});

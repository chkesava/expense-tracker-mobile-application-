import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_END_SEC, SESSION_START_SEC, indexChart } from "../../shared/utils/marketOverview.fixtures";
import { __resetMarketOverviewCacheForTests, handler, overallErrorCode } from "./market-overview";

/** SPENDLY-642: /api/market-overview. */

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

const get = (headers: Record<string, string> = {}) => ({ httpMethod: "GET", queryStringParameters: {}, headers });
const body = (result: { body: string }) => JSON.parse(result.body);
const symbolOf = (url: unknown) => decodeURIComponent(String(url).split("/chart/")[1].split("?")[0]);

const MIN = 60_000;
// 2026-10-30 11:15 IST: inside the session.
const OPEN_NOW = new Date(SESSION_START_SEC * 1000 + 120 * MIN);
const OPEN_TRADE_SEC = SESSION_START_SEC + 7_100;

/** fetch that answers each index from `bySymbol`, or with a chart for it. */
function yahoo(bySymbol: Record<string, () => Response | Promise<Response>> = {}, tradeSec = OPEN_TRADE_SEC) {
  return vi.fn(async (url: unknown) => {
    const symbol = symbolOf(url);
    return bySymbol[symbol] ? bySymbol[symbol]() : upstream(indexChart(symbol, { tradeSec }));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OPEN_NOW);
  vi.spyOn(console, "log").mockImplementation(() => {});
  __resetMarketOverviewCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("market-overview", () => {
  it("returns the three indices, an open status and shared-CDN cache headers", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(get());

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=1d&interval=1d",
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EBSESN?range=1d&interval=1d",
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEBANK?range=1d&interval=1d",
    ]);
    const dto = body(res);
    expect(dto).toMatchObject({
      success: true,
      schemaVersion: 1,
      provider: "yahoo",
      stale: false,
      fetchedAt: OPEN_NOW.toISOString(),
      status: { state: "open", lastTradeAt: new Date(OPEN_TRADE_SEC * 1000).toISOString() },
      movers: { available: false, reason: "DISABLED" },
    });
    expect(dto.indices.map((i: { symbol: string }) => i.symbol)).toEqual(["^NSEI", "^BSESN", "^NSEBANK"]);
    for (const index of dto.indices) {
      expect(index.currency).toBe("INR");
      expect(index.asOf).toBe(new Date(OPEN_TRADE_SEC * 1000).toISOString());
    }
    expect(res.headers["Cache-Control"]).toBe("public, max-age=0, must-revalidate");
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("public, durable, s-maxage=60, stale-while-revalidate=300");
    expect(res.headers.ETag).toMatch(/^"[0-9a-f]+"$/);
  });

  it("is closed after the session with a 15 min CDN lifetime", async () => {
    vi.setSystemTime(new Date(SESSION_END_SEC * 1000 + 10 * MIN));
    vi.stubGlobal("fetch", yahoo({}, SESSION_END_SEC + 71));

    const res = await handler(get());

    expect(body(res).status.state).toBe("closed");
    expect(res.headers["Netlify-CDN-Cache-Control"]).toContain("s-maxage=900,");
  });

  it("is closed on a holiday: the session window is today but the last trade is from the last session", async () => {
    vi.stubGlobal("fetch", yahoo({}, SESSION_START_SEC - 18 * 60 * 60));
    expect(body(await handler(get())).status.state).toBe("closed");
  });

  it("serves a repeat from memory without calling Yahoo", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);
    await handler(get());
    vi.setSystemTime(new Date(OPEN_NOW.getTime() + 30_000));

    const again = await handler(get());

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(again.headers["Netlify-CDN-Cache-Control"]).toContain("s-maxage=30,");
  });

  it("answers 304 when the ETag matches", async () => {
    vi.stubGlobal("fetch", yahoo());
    const first = await handler(get());
    const again = await handler(get({ "if-none-match": first.headers.ETag }));
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe("");
  });

  it("returns the indices that worked when one fails", async () => {
    vi.stubGlobal("fetch", yahoo({ "^BSESN": () => upstream({}, 500) }));
    const dto = body(await handler(get()));
    expect(dto.indices.map((i: { symbol: string }) => i.symbol)).toEqual(["^NSEI", "^NSEBANK"]);
    expect(dto.stale).toBe(false);
  });

  it("hides an index whose payload has no price instead of inventing one", async () => {
    vi.stubGlobal(
      "fetch",
      yahoo({ "^NSEBANK": () => upstream(indexChart("^NSEBANK", { tradeSec: OPEN_TRADE_SEC, meta: { regularMarketPrice: null } })) })
    );
    const dto = body(await handler(get()));
    expect(dto.indices.map((i: { symbol: string }) => i.symbol)).toEqual(["^NSEI", "^BSESN"]);
  });

  it.each([
    ["429 from every index", () => upstream({}, 429), 429, "THROTTLED"],
    ["timeouts", () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" })), 504, "TIMEOUT"],
    ["network errors", () => Promise.reject(new TypeError("fetch failed")), 502, "UPSTREAM"],
    ["unparseable bodies", () => upstream(new SyntaxError("bad json")), 502, "MALFORMED"],
    ["unexpected shapes", () => upstream({ chart: { result: null } }), 502, "MALFORMED"],
  ])("fails with no cached copy on %s, and is never cached", async (_label, answer, status, code) => {
    vi.stubGlobal("fetch", vi.fn(answer));
    const res = await handler(get());
    expect(res.statusCode).toBe(status);
    expect(body(res)).toEqual({ success: false, code, message: expect.any(String) });
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("no-store");
  });

  it("serves its last good copy marked stale when Yahoo fails, re-deriving the state", async () => {
    vi.stubGlobal("fetch", yahoo());
    await handler(get());

    // After the close, every index fails.
    vi.setSystemTime(new Date(SESSION_END_SEC * 1000 + 30 * MIN));
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 503)));
    const res = await handler(get());

    expect(res.statusCode).toBe(200);
    const dto = body(res);
    expect(dto.stale).toBe(true);
    expect(dto.fetchedAt).toBe(OPEN_NOW.toISOString());
    expect(dto.status.state).toBe("closed");
    expect(res.headers["Netlify-CDN-Cache-Control"]).toBe("public, durable, s-maxage=60, stale-while-revalidate=0");
  });

  it("stops standing in after 24 hours", async () => {
    vi.stubGlobal("fetch", yahoo());
    await handler(get());
    vi.setSystemTime(new Date(OPEN_NOW.getTime() + 25 * 60 * MIN));
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 503)));
    expect((await handler(get())).statusCode).toBe(502);
  });

  it("merges concurrent misses into one upstream round", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([handler(get()), handler(get())]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects anything but GET", async () => {
    const res = await handler({ httpMethod: "POST" });
    expect(res.statusCode).toBe(405);
    expect(body(res).code).toBe("BAD_REQUEST");
  });
});

describe("overallErrorCode", () => {
  it("prefers throttling, then timeouts, and calls a mix upstream", () => {
    expect(overallErrorCode(["UPSTREAM", "THROTTLED", "TIMEOUT"])).toBe("THROTTLED");
    expect(overallErrorCode(["UPSTREAM", "TIMEOUT"])).toBe("TIMEOUT");
    expect(overallErrorCode(["MALFORMED", "MALFORMED"])).toBe("MALFORMED");
    expect(overallErrorCode(["MALFORMED", "UPSTREAM"])).toBe("UPSTREAM");
  });
});

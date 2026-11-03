import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NIFTY50, NIFTY50_AS_OF } from "../../shared/data/nifty50";
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

const isSpark = (url: unknown) => String(url).includes("/v8/finance/spark?");
const sparkSymbols = (url: unknown) =>
  new URL(String(url)).searchParams.get("symbols")!.split(",");

/** Change % per stock: its position in NIFTY50 minus 25, so ranks are predictable. */
const pctFor = (symbol: string) => NIFTY50.findIndex((s) => s.symbol === symbol) - 25;

/** A spark payload pricing `symbols` at 100 × (1 + pct/100) on a baseline of 100. */
function sparkPayload(symbols: string[], tradeSec = OPEN_TRADE_SEC) {
  return Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      { symbol, timestamp: [tradeSec], close: [100 + pctFor(symbol)], chartPreviousClose: 100, previousClose: null },
    ])
  );
}

type Answer = () => Response | Promise<Response>;

/**
 * fetch that answers each index from `bySymbol` (or with a chart for it), and
 * each spark batch from `sparkBatches[i]` (or by pricing every symbol).
 */
function yahoo(bySymbol: Record<string, Answer> = {}, tradeSec = OPEN_TRADE_SEC, sparkBatches: Record<number, Answer> = {}) {
  return vi.fn(async (url: unknown) => {
    if (isSpark(url)) {
      const symbols = sparkSymbols(url);
      const batch = Math.floor(NIFTY50.findIndex((s) => s.symbol === symbols[0]) / 20);
      return sparkBatches[batch] ? sparkBatches[batch]() : upstream(sparkPayload(symbols, tradeSec));
    }
    const symbol = symbolOf(url);
    return bySymbol[symbol] ? bySymbol[symbol]() : upstream(indexChart(symbol, { tradeSec }));
  });
}

const chartCalls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.filter((c) => !isSpark(c[0]));
const sparkCalls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.filter((c) => isSpark(c[0]));

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
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(chartCalls(fetchMock).map((c) => String(c[0]))).toEqual([
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=5d&interval=1d",
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EBSESN?range=5d&interval=1d",
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEBANK?range=5d&interval=1d",
    ]);
    const dto = body(res);
    expect(dto).toMatchObject({
      success: true,
      schemaVersion: 1,
      provider: "yahoo",
      stale: false,
      fetchedAt: OPEN_NOW.toISOString(),
      status: { state: "open", lastTradeAt: new Date(OPEN_TRADE_SEC * 1000).toISOString() },
      movers: { available: true, universe: "NIFTY50", universeAsOf: NIFTY50_AS_OF, coverage: 1 },
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

    expect(fetchMock).toHaveBeenCalledTimes(6);
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
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("ranks NIFTY 50 movers from three spark batches of at most 20", async () => {
    const fetchMock = yahoo();
    vi.stubGlobal("fetch", fetchMock);

    const dto = body(await handler(get()));

    expect(sparkCalls(fetchMock).map((c) => sparkSymbols(c[0]).length)).toEqual([20, 20, 10]);
    // SPENDLY-659: movers stay on the 1-day series (a 5-day one can miss the latest close).
    for (const c of sparkCalls(fetchMock)) expect(String(c[0])).toContain("&range=1d&interval=1d");
    expect(sparkCalls(fetchMock).flatMap((c) => sparkSymbols(c[0])).sort()).toEqual(NIFTY50.map((s) => s.symbol).sort());
    const symbolsAt = (...i: number[]) => i.map((n) => NIFTY50[n].symbol);
    expect(dto.movers.gainers.map((m: { symbol: string }) => m.symbol)).toEqual(symbolsAt(49, 48, 47, 46, 45));
    expect(dto.movers.losers.map((m: { symbol: string }) => m.symbol)).toEqual(symbolsAt(0, 1, 2, 3, 4));
    expect(dto.movers.gainers[0]).toMatchObject({ price: 124, previousClose: 100, changePercent: 24, currency: "INR" });
    expect(dto.movers.asOf).toBe(new Date(OPEN_TRADE_SEC * 1000).toISOString());
    expect(dto.movers.gainers[0].name).toBe(NIFTY50[49].name);
  });

  it("keeps movers when the 10-stock batch fails (80% still priced)", async () => {
    vi.stubGlobal("fetch", yahoo({}, OPEN_TRADE_SEC, { 2: () => upstream({}, 500) }));
    const dto = body(await handler(get()));
    expect(dto.movers).toMatchObject({ available: true, coverage: 0.8 });
  });

  it("reports movers unavailable, not the whole response, when a 20-stock batch fails", async () => {
    vi.stubGlobal("fetch", yahoo({}, OPEN_TRADE_SEC, { 0: () => Promise.reject(new TypeError("fetch failed")) }));
    const res = await handler(get());
    expect(res.statusCode).toBe(200);
    expect(body(res).movers).toEqual({ available: false, reason: "UPSTREAM" });
    expect(body(res).indices).toHaveLength(3);
  });

  it("treats a spark error body as a failed batch", async () => {
    const err = () => upstream({ spark: { result: null, error: { code: "Bad Request" } } });
    vi.stubGlobal("fetch", yahoo({}, OPEN_TRADE_SEC, { 0: err, 1: err }));
    expect(body(await handler(get())).movers).toEqual({ available: false, reason: "UPSTREAM" });
  });

  it("returns movers alone when every index fails", async () => {
    const down = () => upstream({}, 500);
    vi.stubGlobal("fetch", yahoo({ "^NSEI": down, "^BSESN": down, "^NSEBANK": down }));
    const res = await handler(get());
    expect(res.statusCode).toBe(200);
    const dto = body(res);
    expect(dto.indices).toEqual([]);
    expect(dto.status.state).toBe("unknown");
    expect(dto.movers.available).toBe(true);
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

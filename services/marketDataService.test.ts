import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These fetchers previously caught everything and returned `null`, so React
 * Query saw a *successful* empty result: `retry` never fired and the portfolio
 * could not tell a stale price from an unreachable server. The contract now is
 * "throw on failure, null only for genuinely absent data".
 */

// `expo-constants` pulls in the React Native entrypoint, which the Node test
// environment cannot parse. Only `expoConfig.extra` is read by this module.
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const BASE = "https://market.test";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("marketDataService", () => {
  let fetchStockQuote: typeof import("./marketDataService").fetchStockQuote;
  let fetchCryptoQuote: typeof import("./marketDataService").fetchCryptoQuote;

  beforeEach(async () => {
    vi.resetModules();
    process.env.EXPO_PUBLIC_MARKET_API_URL = BASE;
    const mod = await import("./marketDataService");
    fetchStockQuote = mod.fetchStockQuote;
    fetchCryptoQuote = mod.fetchCryptoQuote;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_MARKET_API_URL;
  });

  it("returns the parsed quote on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ success: true, symbol: "INFY", price: 1500 }))
    );
    await expect(fetchStockQuote("INFY")).resolves.toMatchObject({ symbol: "INFY" });
  });

  it("throws when the transport fails, so the caller can retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network request failed");
      })
    );
    await expect(fetchStockQuote("INFY")).rejects.toThrow(/stock quote request failed/i);
  });

  it("throws on a server error rather than reporting no data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 503)));
    await expect(fetchStockQuote("INFY")).rejects.toThrow(/503/);
  });

  it("throws when the response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }) as unknown as Response)
    );
    await expect(fetchStockQuote("INFY")).rejects.toThrow(/malformed/i);
  });

  it("returns null for a genuine 404 — absent data is not a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 404)));
    await expect(fetchStockQuote("NOPE")).resolves.toBeNull();
  });

  it("returns null when the API reports no matching crypto quote", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ success: true, quotes: [] }))
    );
    await expect(fetchCryptoQuote("bitcoin")).resolves.toBeNull();
  });

  it("does not leak the request URL into the thrown message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      })
    );
    await expect(fetchStockQuote("INFY")).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(BASE) })
    );
  });
});

describe("marketDataService base URL", () => {
  const SHARE = "https://share.test";
  const LEGACY = "https://legacy.test";

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_SHARE_URL;
    delete process.env.EXPO_PUBLIC_APP_URL;
  });

  async function requestedUrl(env: { share?: string; app?: string }): Promise<string> {
    vi.resetModules();
    if (env.share) process.env.EXPO_PUBLIC_SHARE_URL = env.share;
    if (env.app) process.env.EXPO_PUBLIC_APP_URL = env.app;
    const fetchMock = vi.fn(async () => jsonResponse({ success: true, symbol: "KPITTECH" }));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchStockQuote } = await import("./marketDataService");
    await fetchStockQuote("KPITTECH.NS");
    return String((fetchMock.mock.calls[0] as unknown[])[0]);
  }

  it("calls the page's own origin on web, which hosts the functions", async () => {
    vi.stubGlobal("document", {});
    vi.stubGlobal("window", { location: { origin: "https://spendly-share.test" } });
    expect(await requestedUrl({ share: SHARE, app: LEGACY })).toBe(
      "https://spendly-share.test/api/stock?symbol=KPITTECH.NS"
    );
  });

  it("calls the share site on native, not the legacy app URL", async () => {
    expect(await requestedUrl({ share: `${SHARE}/`, app: LEGACY })).toBe(
      `${SHARE}/api/stock?symbol=KPITTECH.NS`
    );
  });

  it("falls back to the legacy app URL on native when no share URL is set", async () => {
    expect(await requestedUrl({ app: LEGACY })).toBe(`${LEGACY}/api/stock?symbol=KPITTECH.NS`);
  });
});

describe("fetchStockHistory (SPENDLY-558)", () => {
  let fetchStockHistory: typeof import("./marketDataService").fetchStockHistory;

  beforeEach(async () => {
    vi.resetModules();
    process.env.EXPO_PUBLIC_MARKET_API_URL = BASE;
    ({ fetchStockHistory } = await import("./marketDataService"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_MARKET_API_URL;
  });

  const series = { success: true, symbol: "KPITTECH.NS", range: "1W", candles: [{ t: 1, o: 1, h: 2, l: 1, c: 2, v: 5 }] };

  it("asks for the symbol and range only, with no chart type", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(series));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchStockHistory("M&M.NS", "1W")).resolves.toMatchObject({ symbol: "KPITTECH.NS" });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`${BASE}/api/stock-history?symbol=M%26M.NS&range=1W`);
  });

  it("returns null when there is no data for the period", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ success: false, code: "NO_DATA", message: "x" }, 404)));
    await expect(fetchStockHistory("KPITTECH.NS", "1D")).resolves.toBeNull();
  });

  it("carries the server's typed code on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ success: false, code: "THROTTLED", message: "x" }, 429)));
    await expect(fetchStockHistory("KPITTECH.NS", "1D")).rejects.toMatchObject({
      name: "MarketDataError",
      code: "THROTTLED",
      status: 429,
      message: expect.stringMatching(/busy/i),
    });
  });

  it("treats a success body without candles as malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ success: true })));
    await expect(fetchStockHistory("KPITTECH.NS", "1D")).rejects.toMatchObject({ code: "MALFORMED" });
  });

  it("reports its own timeout as TIMEOUT but passes a caller's cancellation through", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw abort;
      })
    );
    await expect(fetchStockHistory("KPITTECH.NS", "1D")).rejects.toMatchObject({ code: "TIMEOUT" });

    const controller = new AbortController();
    controller.abort();
    await expect(fetchStockHistory("KPITTECH.NS", "1D", { signal: controller.signal })).rejects.toBe(abort);
  });
});

describe("fetchMarketOverview (SPENDLY-644)", () => {
  let fetchMarketOverview: typeof import("./marketDataService").fetchMarketOverview;

  beforeEach(async () => {
    vi.resetModules();
    process.env.EXPO_PUBLIC_MARKET_API_URL = BASE;
    ({ fetchMarketOverview } = await import("./marketDataService"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_MARKET_API_URL;
  });

  const overview = {
    success: true,
    schemaVersion: 1,
    provider: "yahoo",
    fetchedAt: "2026-10-30T10:05:00.000Z",
    stale: false,
    status: { state: "closed", sessionStart: null, sessionEnd: null, lastTradeAt: "2026-10-30T10:01:11.000Z" },
    indices: [],
    movers: { available: false, reason: "LOW_COVERAGE" },
  };

  it("reads /api/market-overview from the market API base", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(overview));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchMarketOverview()).resolves.toEqual(overview);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`${BASE}/api/market-overview`);
  });

  it("carries the server's typed code on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ success: false, code: "THROTTLED", message: "x" }, 429)));
    await expect(fetchMarketOverview()).rejects.toMatchObject({
      name: "MarketDataError",
      code: "THROTTLED",
      status: 429,
      message: expect.stringMatching(/busy/i),
    });
  });

  it("throws on an upstream error without a body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError("x"); } }) as unknown as Response));
    await expect(fetchMarketOverview()).rejects.toMatchObject({ status: 502, code: undefined });
  });

  it("treats a success body of the wrong shape as malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ success: true, indices: [] })));
    await expect(fetchMarketOverview()).rejects.toMatchObject({ code: "MALFORMED" });
  });

  it("reports its own timeout as TIMEOUT but passes a caller's cancellation through", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw abort; }));
    await expect(fetchMarketOverview()).rejects.toMatchObject({ code: "TIMEOUT" });

    const controller = new AbortController();
    controller.abort();
    await expect(fetchMarketOverview({ signal: controller.signal })).rejects.toBe(abort);
  });
});

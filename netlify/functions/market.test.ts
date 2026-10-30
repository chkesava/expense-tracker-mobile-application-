import { afterEach, describe, expect, it, vi } from "vitest";

import { handler as crypto } from "./crypto";
import { handler as mutualFunds } from "./mutual-funds";
import { handler as stock } from "./stock";

/** SPENDLY-522: the market functions moved here from the legacy site. */

function upstream(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const get = (params: Record<string, string>) => ({ httpMethod: "GET", queryStringParameters: params });
const body = (result: { body: string }) => JSON.parse(result.body);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stock", () => {
  it("returns the quote for a bare ticker, asking Yahoo for the .NS symbol", async () => {
    const fetchMock = vi.fn(async () =>
      upstream({ chart: { result: [{ meta: { symbol: "KPITTECH.NS", regularMarketPrice: 481.75, chartPreviousClose: 479 } }] } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await stock(get({ symbol: "kpittech" }));

    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("public, max-age=60");
    expect(body(res)).toMatchObject({ symbol: "KPITTECH.NS", price: 481.75, success: true });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("/v8/finance/chart/KPITTECH.NS?");
  });

  it("asks Yahoo for an index symbol as-is, without a .NS suffix (SPENDLY-642)", async () => {
    const fetchMock = vi.fn(async () =>
      upstream({ chart: { result: [{ meta: { symbol: "^NSEI", regularMarketPrice: 23053.1, chartPreviousClose: 22698.8 } }] } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await stock(get({ symbol: "^nsei" }));

    expect(res.statusCode).toBe(200);
    expect(body(res)).toMatchObject({ symbol: "^NSEI", price: 23053.1 });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("/v8/finance/chart/%5ENSEI?");
  });

  it("maps a Yahoo 404 to a 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 404)));
    const res = await stock(get({ symbol: "NOPE.NS" }));
    expect(res.statusCode).toBe(404);
    expect(body(res).success).toBe(false);
  });

  it("maps an upstream error to a 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 500)));
    expect((await stock(get({ symbol: "KPITTECH.NS" }))).statusCode).toBe(502);
  });

  it("retries a transport failure once, then reports a timeout as 504", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const fetchMock = vi.fn(async () => {
      throw timeout;
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await stock(get({ symbol: "KPITTECH.NS" }))).statusCode).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires a symbol and GET", async () => {
    expect((await stock(get({}))).statusCode).toBe(400);
    expect((await stock({ httpMethod: "POST", queryStringParameters: { symbol: "X" } })).statusCode).toBe(405);
  });
});

describe("mutual-funds", () => {
  it("falls back to the full history when /latest has no data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstream({}, 500))
      .mockResolvedValueOnce(upstream({ meta: { scheme_name: "Axis ELSS" }, data: [{ nav: "10" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await mutualFunds(get({ schemeCode: "120503" }));

    expect(res.statusCode).toBe(200);
    expect(body(res)).toMatchObject({ schemeCode: "120503", schemeName: "Axis ELSS", nav: 10 });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.mfapi.in/mf/120503/latest");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.mfapi.in/mf/120503");
  });

  it("returns 404 for an unknown scheme", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(upstream({}, 404)).mockResolvedValueOnce(upstream({}, 404))
    );
    expect((await mutualFunds(get({ schemeCode: "1" }))).statusCode).toBe(404);
  });

  it("rejects a non-numeric scheme code without calling upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await mutualFunds(get({ schemeCode: "abc" }))).statusCode).toBe(400);
    expect((await mutualFunds(get({}))).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("crypto", () => {
  it("returns quotes for priced ids", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream({ bitcoin: { inr: 5000000, inr_24h_change: 1 } })));
    const res = await crypto(get({ ids: "Bitcoin" }));
    expect(res.statusCode).toBe(200);
    expect(body(res)).toMatchObject({ success: true, quotes: [{ coinId: "bitcoin", symbol: "BTC", price: 5000000 }] });
  });

  it("passes a CoinGecko rate limit through as 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream({}, 429)));
    expect((await crypto(get({ ids: "bitcoin" }))).statusCode).toBe(429);
  });

  it("returns 404 when nothing is priced, and 400 without ids", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream({})));
    expect((await crypto(get({ ids: "notacoin" }))).statusCode).toBe(404);
    expect((await crypto(get({ ids: " , " }))).statusCode).toBe(400);
  });
});

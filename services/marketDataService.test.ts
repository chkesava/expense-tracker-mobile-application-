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

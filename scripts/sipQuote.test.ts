import { describe, expect, it } from "vitest";

import { sipPrice, type QuoteHandlers } from "./lib/sipQuote";

const ok = (body: unknown) => async () => ({ statusCode: 200, body: JSON.stringify(body) });
const status = (code: number) => async () => ({ statusCode: code, body: "{}" });

const handlers = (over: Partial<QuoteHandlers> = {}): QuoteHandlers => ({
  stock: ok({ success: true, price: 2512.4 }),
  mutualFunds: ok({ success: true, nav: 54.32 }),
  crypto: ok({ success: true, quotes: [{ coinId: "bitcoin", price: 5_400_000 }] }),
  ...over,
});

describe("sipPrice (SPENDLY-726)", () => {
  it("reads the same field the app reads, per asset type", async () => {
    expect(await sipPrice({ assetType: "stock", symbol: "RELIANCE" }, handlers())).toBe(2512.4);
    expect(await sipPrice({ assetType: "etf", symbol: "NIFTYBEES" }, handlers())).toBe(2512.4);
    expect(await sipPrice({ assetType: "mutual_fund", symbol: "120503" }, handlers())).toBe(54.32);
    expect(await sipPrice({ assetType: "crypto", symbol: "bitcoin" }, handlers())).toBe(5_400_000);
  });

  it("passes the symbol as the app does", async () => {
    const seen: Array<Record<string, string> | undefined> = [];
    const spy = (body: unknown) => async (e: { queryStringParameters?: Record<string, string> }) => {
      seen.push(e.queryStringParameters);
      return { statusCode: 200, body: JSON.stringify(body) };
    };
    await sipPrice({ assetType: "mutual_fund", symbol: "120503" }, handlers({ mutualFunds: spy({ nav: 1 }) }));
    await sipPrice({ assetType: "crypto", symbol: "bitcoin" }, handlers({ crypto: spy({ quotes: [] }) }));
    await sipPrice({ assetType: "stock", symbol: "TCS" }, handlers({ stock: spy({ price: 1 }) }));
    expect(seen).toEqual([{ schemeCode: "120503" }, { ids: "bitcoin" }, { symbol: "TCS" }]);
  });

  it("no usable price is undefined (the planner records a failed day, never an invented price)", async () => {
    expect(await sipPrice({ assetType: "stock", symbol: "X" }, handlers({ stock: status(502) }))).toBeUndefined();
    expect(await sipPrice({ assetType: "crypto", symbol: "bitcoin" }, handlers({ crypto: status(429) }))).toBeUndefined();
    expect(await sipPrice({ assetType: "stock", symbol: "X" }, handlers({ stock: ok({ success: true, price: 0 }) }))).toBeUndefined();
    expect(await sipPrice({ assetType: "mutual_fund", symbol: "1" }, handlers({ mutualFunds: ok({ success: false, nav: 10 }) }))).toBeUndefined();
    expect(await sipPrice({ assetType: "crypto", symbol: "ethereum" }, handlers())).toBeUndefined();
    expect(await sipPrice({ assetType: "stock", symbol: "" }, handlers())).toBeUndefined();
    const boom = async () => {
      throw new Error("network");
    };
    expect(await sipPrice({ assetType: "stock", symbol: "X" }, handlers({ stock: boom }))).toBeUndefined();
  });
});

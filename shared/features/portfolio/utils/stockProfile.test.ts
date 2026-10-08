import { describe, expect, it } from "vitest";

import {
  planStockProfileUpserts,
  resolveStockProfileId,
  stockProfileId,
  stockProfileMatchKey,
} from "./stockProfile";

describe("stockProfileMatchKey", () => {
  it("prefers ISIN over everything else", () => {
    const key = stockProfileMatchKey({
      isin: "inE123a01010",
      yahooSymbol: "KPITTECH.NS",
      symbol: "KPITTECH",
      exchange: "NSE",
    });
    expect(key).toBe("isin:INE123A01010");
  });

  it("falls back to yahooSymbol when no ISIN is known", () => {
    const key = stockProfileMatchKey({
      yahooSymbol: "kpittech.ns",
      symbol: "KPITTECH",
      exchange: "NSE",
    });
    expect(key).toBe("yahoo:KPITTECH.NS");
  });

  it("falls back to exchange+symbol when neither ISIN nor yahooSymbol is known", () => {
    const key = stockProfileMatchKey({ symbol: "kpittech", exchange: "nse" });
    expect(key).toBe("sym:NSE:KPITTECH");
  });
});

describe("stockProfileId", () => {
  it("is deterministic: the same match key always resolves to the same id", () => {
    const key = stockProfileMatchKey({ yahooSymbol: "KPITTECH.NS", symbol: "KPITTECH", exchange: "NSE" });
    expect(stockProfileId(key)).toBe(stockProfileId(key));
  });

  it("gives different instruments different ids", () => {
    const a = stockProfileId(stockProfileMatchKey({ yahooSymbol: "KPITTECH.NS", symbol: "KPITTECH", exchange: "NSE" }));
    const b = stockProfileId(stockProfileMatchKey({ yahooSymbol: "INFY.NS", symbol: "INFY", exchange: "NSE" }));
    expect(a).not.toBe(b);
  });

  it("is prefixed so it's recognizable as a profile id in Firestore paths/logs", () => {
    expect(stockProfileId("yahoo:KPITTECH.NS")).toMatch(/^profile_[0-9a-f]{16}$/);
  });
});

describe("resolveStockProfileId", () => {
  it("matches calling stockProfileMatchKey then stockProfileId directly", () => {
    const identity = { yahooSymbol: "KPITTECH.NS", symbol: "KPITTECH", exchange: "NSE" };
    expect(resolveStockProfileId(identity)).toBe(stockProfileId(stockProfileMatchKey(identity)));
  });
});

describe("planStockProfileUpserts", () => {
  const KPIT = {
    symbol: "KPITTECH",
    yahooSymbol: "KPITTECH.NS",
    name: "KPIT Technologies",
    exchange: "NSE" as const,
    instrumentType: "stock" as const,
  };
  const INFY = {
    symbol: "INFY",
    yahooSymbol: "INFY.NS",
    name: "Infosys",
    exchange: "NSE" as const,
    instrumentType: "stock" as const,
  };

  it("dedupes two CSV rows of the same instrument into one profile upsert", () => {
    const upserts = planStockProfileUpserts([KPIT, KPIT]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.profileId).toBe(resolveStockProfileId(KPIT));
  });

  it("produces one upsert per unique instrument", () => {
    const upserts = planStockProfileUpserts([KPIT, INFY]);
    expect(upserts).toHaveLength(2);
    expect(upserts.map((u) => u.identity.symbol).sort()).toEqual(["INFY", "KPITTECH"]);
  });
});

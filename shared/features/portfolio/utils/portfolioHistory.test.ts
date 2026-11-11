import { describe, expect, it } from "vitest";
import type { Holding, PortfolioTransaction } from "../types";
import {
  filterAndSortPortfolioHistory,
  formatHistoryQuantity,
  generatePortfolioHistoryCsv,
  resolveTransactionMetadata,
} from "./portfolioHistory";

const mockHoldings: Holding[] = [
  {
    id: "h_tcs",
    profileId: "prof_tcs",
    symbol: "TCS",
    yahooSymbol: "TCS.NS",
    name: "Tata Consultancy Services",
    exchange: "NSE",
    instrumentType: "stock",
    quantity: 10,
    averageBuyPrice: 3500,
  },
  {
    id: "h_niftybees",
    profileId: "prof_niftybees",
    symbol: "NIFTYBEES",
    yahooSymbol: "NIFTYBEES.NS",
    name: "Nippon India Nifty 50 BeES ETF",
    exchange: "NSE",
    instrumentType: "etf",
    quantity: 100,
    averageBuyPrice: 250,
  },
];

const mockTransactions: PortfolioTransaction[] = [
  {
    id: "tx_1",
    holdingId: "h_tcs",
    profileId: "prof_tcs",
    symbol: "TCS",
    type: "BUY",
    quantity: 10,
    price: 3500,
    fees: 25,
    broker: "Zerodha",
    date: "2026-10-15",
    orderStatus: "executed",
    createdAt: "2026-10-15T10:00:00Z",
  },
  {
    id: "tx_2",
    holdingId: "h_tcs",
    profileId: "prof_tcs",
    symbol: "TCS",
    type: "SELL",
    quantity: 5,
    price: 3800,
    fees: 30,
    broker: "Zerodha",
    date: "2026-11-02",
    orderStatus: "executed",
    createdAt: "2026-11-02T10:00:00Z",
  },
  {
    id: "tx_3",
    holdingId: "h_niftybees",
    profileId: "prof_niftybees",
    symbol: "NIFTYBEES",
    type: "BUY",
    quantity: 100,
    price: 250,
    fees: 15,
    broker: "Groww",
    date: "2026-11-05",
    orderStatus: "executed",
    createdAt: "2026-11-05T10:00:00Z",
  },
  {
    id: "tx_sold_out",
    holdingId: "h_infy_deleted",
    symbol: "INFY",
    type: "SELL",
    quantity: 20,
    price: 1500,
    fees: 10,
    broker: "Upstox",
    date: "2026-09-20",
    orderStatus: "executed",
    createdAt: "2026-09-20T10:00:00Z",
  },
  {
    id: "tx_adj",
    holdingId: "h_tcs",
    symbol: "TCS",
    type: "ADJUSTMENT",
    quantity: 2,
    price: 3400,
    fees: 0,
    date: "2026-10-18",
    notes: "Historical acquisition added",
    orderStatus: "executed",
    createdAt: "2026-10-18T10:00:00Z",
  },
  {
    id: "tx_cancelled",
    holdingId: "h_tcs",
    symbol: "TCS",
    type: "BUY",
    quantity: 5,
    price: 3200,
    fees: 0,
    date: "2026-11-08",
    orderStatus: "cancelled",
  },
  {
    id: "tx_pending",
    holdingId: "h_tcs",
    symbol: "TCS",
    type: "BUY",
    quantity: 5,
    price: 3200,
    fees: 0,
    date: "2026-11-09",
    orderStatus: "pending",
  },
];

describe("resolveTransactionMetadata", () => {
  it("resolves from holding by holdingId", () => {
    const meta = resolveTransactionMetadata({ holdingId: "h_tcs", symbol: "TCS" }, mockHoldings);
    expect(meta.name).toBe("Tata Consultancy Services");
    expect(meta.instrumentType).toBe("stock");
  });

  it("resolves from holding by profileId if holdingId changed", () => {
    const meta = resolveTransactionMetadata(
      { holdingId: "h_diff", profileId: "prof_niftybees", symbol: "NIFTYBEES" },
      mockHoldings
    );
    expect(meta.name).toBe("Nippon India Nifty 50 BeES ETF");
    expect(meta.instrumentType).toBe("etf");
  });

  it("resolves by symbol when holdingId does not match directly", () => {
    const meta = resolveTransactionMetadata({ holdingId: "h_unknown", symbol: "TCS" }, mockHoldings);
    expect(meta.name).toBe("Tata Consultancy Services");
    expect(meta.instrumentType).toBe("stock");
  });

  it("falls back gracefully when holding was completely deleted", () => {
    const meta = resolveTransactionMetadata(
      { holdingId: "h_gone", symbol: "INFY" },
      mockHoldings
    );
    expect(meta.name).toBe("INFY");
    expect(meta.instrumentType).toBe("stock");
  });

  it("infers ETF and Gold fallback types from symbol when deleted", () => {
    expect(
      resolveTransactionMetadata({ holdingId: "x", symbol: "GOLDBEES" }, []).instrumentType
    ).toBe("gold");
    expect(
      resolveTransactionMetadata({ holdingId: "x", symbol: "BANKBEES" }, []).instrumentType
    ).toBe("etf");
    expect(
      resolveTransactionMetadata({ holdingId: "x", symbol: "BTC" }, []).instrumentType
    ).toBe("crypto");
  });
});

describe("filterAndSortPortfolioHistory", () => {
  it("excludes cancelled and pending orders by default", () => {
    const result = filterAndSortPortfolioHistory(mockTransactions, mockHoldings);
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain("tx_cancelled");
    expect(ids).not.toContain("tx_pending");
    expect(ids).toContain("tx_1");
    expect(ids).toContain("tx_2");
    expect(ids).toContain("tx_3");
    expect(ids).toContain("tx_sold_out");
    expect(ids).toContain("tx_adj");
  });

  it("sorts by date descending by default with deterministic tie-breaking", () => {
    const result = filterAndSortPortfolioHistory(mockTransactions, mockHoldings);
    expect(result[0].id).toBe("tx_3"); // 2026-11-05
    expect(result[1].id).toBe("tx_2"); // 2026-11-02
    expect(result[2].id).toBe("tx_adj"); // 2026-10-18
    expect(result[3].id).toBe("tx_1"); // 2026-10-15
    expect(result[4].id).toBe("tx_sold_out"); // 2026-09-20
  });

  it("sorts by date ascending", () => {
    const result = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, {
      sort: "date_asc",
    });
    expect(result[0].id).toBe("tx_sold_out"); // 2026-09-20
    expect(result[result.length - 1].id).toBe("tx_3"); // 2026-11-05
  });

  it("sorts by amount descending", () => {
    const result = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, {
      sort: "amount_desc",
    });
    // tx_1: 10 * 3500 = 35000
    // tx_sold_out: 20 * 1500 = 30000
    // tx_3: 100 * 250 = 25000
    // tx_2: 5 * 3800 = 19000
    // tx_adj: 2 * 3400 = 6800
    expect(result.map((r) => r.id)).toEqual([
      "tx_1",
      "tx_sold_out",
      "tx_3",
      "tx_2",
      "tx_adj",
    ]);
  });

  it("filters by transaction type (BUY only, SELL only, other)", () => {
    const buys = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, { type: "BUY" });
    expect(buys.map((r) => r.id)).toEqual(["tx_3", "tx_1"]);

    const sells = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, { type: "SELL" });
    expect(sells.map((r) => r.id)).toEqual(["tx_2", "tx_sold_out"]);

    const other = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, {
      type: "other",
    });
    expect(other.map((r) => r.id)).toEqual(["tx_adj"]);
  });

  it("filters by instrument type", () => {
    const etfs = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, {
      instrument: "etf",
    });
    expect(etfs.map((r) => r.id)).toEqual(["tx_3"]);

    const stocks = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, {
      instrument: "stock",
    });
    expect(stocks.map((r) => r.id)).toEqual(["tx_2", "tx_adj", "tx_1", "tx_sold_out"]);
  });

  it("filters by search query matching symbol or name", () => {
    const querySymbol = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, {
      query: "nifty",
    });
    expect(querySymbol.map((r) => r.id)).toEqual(["tx_3"]);

    const queryName = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, {
      query: "consultancy",
    });
    expect(queryName.map((r) => r.id)).toEqual(["tx_2", "tx_adj", "tx_1"]);
  });

  it("filters by date period: this_month", () => {
    const thisMonth = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, {
      period: "this_month",
      today: "2026-11-10",
    });
    expect(thisMonth.map((r) => r.id)).toEqual(["tx_3", "tx_2"]);
  });

  it("filters by custom date range", () => {
    const custom = filterAndSortPortfolioHistory(mockTransactions, mockHoldings, {
      period: "custom",
      range: { from: "2026-10-01", to: "2026-10-31" },
    });
    expect(custom.map((r) => r.id)).toEqual(["tx_adj", "tx_1"]);
  });

  it("computes gross, fees, and net cash effect correctly", () => {
    const result = filterAndSortPortfolioHistory(mockTransactions, mockHoldings);
    const buy = result.find((r) => r.id === "tx_1")!;
    expect(buy.gross).toBe(35000);
    expect(buy.fees).toBe(25);
    expect(buy.net).toBe(35025); // BUY cost: gross + fees

    const sell = result.find((r) => r.id === "tx_2")!;
    expect(sell.gross).toBe(19000);
    expect(sell.fees).toBe(30);
    expect(sell.net).toBe(18970); // SELL proceeds: gross - fees
  });

  it("handles legacy transactions with missing/zero fees safely", () => {
    const legacyTx: PortfolioTransaction = {
      id: "tx_legacy",
      holdingId: "h_legacy",
      symbol: "LEGACY",
      type: "BUY",
      quantity: 5,
      price: 100,
      fees: undefined as unknown as number,
      date: "2026-01-01",
      orderStatus: "executed",
    };
    const result = filterAndSortPortfolioHistory([legacyTx], []);
    expect(result[0].fees).toBe(0);
    expect(result[0].net).toBe(500);
  });
});

describe("formatHistoryQuantity", () => {
  it("formats integers as bare numbers", () => {
    expect(formatHistoryQuantity(10)).toBe("10");
    expect(formatHistoryQuantity(0)).toBe("0");
  });

  it("formats decimals up to 4 places", () => {
    expect(formatHistoryQuantity(3.14159)).toBe("3.1416");
    expect(formatHistoryQuantity(0.5)).toBe("0.5");
  });
});

describe("generatePortfolioHistoryCsv", () => {
  it("generates RFC-4180 CSV with headers and records", () => {
    const items = filterAndSortPortfolioHistory(mockTransactions, mockHoldings);
    const csv = generatePortfolioHistoryCsv(items, "INR");
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe(
      "Date,Symbol,Name,Type,Instrument,Quantity,Price,Gross Value,Fees,Net Amount,Currency,Broker,Notes,Status,ID"
    );
    expect(lines.length).toBe(items.length + 1);
    expect(lines[1]).toContain("NIFTYBEES");
    expect(lines[1]).toContain("250");
  });

  it("neutralises formula injection in notes or company names", () => {
    const maliciousTx: PortfolioTransaction = {
      id: "tx_evil",
      holdingId: "h_evil",
      symbol: "EVIL",
      type: "BUY",
      quantity: 1,
      price: 10,
      fees: 0,
      date: "2026-11-01",
      notes: "=CMD|' /C calc'!A0",
      orderStatus: "executed",
    };
    const items = filterAndSortPortfolioHistory([maliciousTx], [
      {
        id: "h_evil",
        symbol: "EVIL",
        yahooSymbol: "EVIL.NS",
        name: "+Formula Corp",
        exchange: "NSE",
        instrumentType: "stock",
        quantity: 1,
        averageBuyPrice: 10,
      },
    ]);
    const csv = generatePortfolioHistoryCsv(items, "INR");
    // Prefix single-quote should neutralize = and +
    expect(csv).toContain("\"'=CMD|' /C calc'!A0\"");
    expect(csv).toContain("\"'+Formula Corp\"");
  });
});

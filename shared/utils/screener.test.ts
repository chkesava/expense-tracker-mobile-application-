import { describe, expect, it } from "vitest";

import type { ScreenerRowDTO } from "../types/market";
import {
  EMPTY_SCREEN,
  SCREENER_FIELDS,
  SCREENER_PRESETS,
  activeFilterCount,
  applyScreen,
  describeRange,
  describeScreen,
  isAvailableNumericField,
  paginate,
  sectorsIn,
  sortRows,
  validateScreen,
  type Screen,
} from "./screener";

/** SPENDLY-648: the screener's filter and sort engine. */

function row(symbol: string, over: Partial<ScreenerRowDTO> = {}): ScreenerRowDTO {
  return {
    symbol,
    name: symbol.replace(".NS", ""),
    sector: "Information Technology",
    nifty50: false,
    currency: "INR",
    price: 100,
    previousClose: 100,
    change: 0,
    changePercent: 0,
    high52: 120,
    low52: 80,
    pctFromHigh52: -16.67,
    pctAboveLow52: 25,
    return1y: 10,
    asOf: "2026-10-30T03:45:00.000Z",
    ...over,
  };
}

const ROWS: ScreenerRowDTO[] = [
  row("INFY.NS", { nifty50: true, price: 1185, changePercent: 3.36, pctFromHigh52: -2, return1y: 5 }),
  row("TCS.NS", { nifty50: true, price: 2502.6, changePercent: 0.99, pctFromHigh52: -35, return1y: -20 }),
  row("TRENT.NS", { sector: "Consumer Services", nifty50: true, price: 3017.3, changePercent: 5.44, pctFromHigh52: -40, return1y: -30 }),
  row("GROWW.NS", { sector: "Financial Services", price: 150, changePercent: 1.2, high52: null, low52: null, pctFromHigh52: null, pctAboveLow52: null, return1y: null }),
  row("SMALL.NS", { sector: "Financial Services", price: 45, changePercent: -2.5, pctFromHigh52: -50, return1y: -45 }),
  row("BAGMANE.NS", { sector: "Realty", price: null, previousClose: null, change: null, changePercent: null, high52: null, low52: null, pctFromHigh52: null, pctAboveLow52: null, return1y: null, asOf: null }),
];

const screen = (over: Partial<Screen>): Screen => ({ ...EMPTY_SCREEN, ...over });
const symbols = (rows: ScreenerRowDTO[]) => rows.map((r) => r.symbol);

describe("SCREENER_FIELDS", () => {
  it("offers price, change, 52-week and 1-year fields, and lists market cap, P/E and volume as unavailable with a reason", () => {
    const available = SCREENER_FIELDS.filter((f) => f.available).map((f) => f.id);
    expect(available).toEqual(["price", "changePercent", "pctFromHigh52", "pctAboveLow52", "return1y", "high52", "low52"]);
    for (const id of ["marketCap", "pe", "volume"]) {
      const field = SCREENER_FIELDS.find((f) => f.id === id)!;
      expect(field.available).toBe(false);
      expect(field.unavailableReason).toMatch(/^Not available/);
      expect(isAvailableNumericField(id)).toBe(false);
    }
    for (const field of SCREENER_FIELDS) expect(field.description.length).toBeGreaterThan(10);
  });
});

describe("validateScreen", () => {
  it("accepts an empty screen and normalises sectors", () => {
    const v = validateScreen(screen({ sectors: [" Realty", "Healthcare", "Realty"] }));
    expect(v).toEqual({ ok: true, screen: { ...EMPTY_SCREEN, sectors: ["Healthcare", "Realty"] } });
  });

  it.each([
    ["an unavailable field", { field: "pe", min: 0, max: 20 }, /P\/E ratio can't be used\. Not available/],
    ["no bounds", { field: "price", min: null, max: null }, /Enter a minimum, a maximum or both/],
    ["min above max", { field: "price", min: 500, max: 100 }, /minimum is above the maximum/],
    ["a non-number", { field: "price", min: Number.NaN, max: null }, /needs numbers/],
    ["a negative price", { field: "price", min: -5, max: null }, /can't be below ₹0/],
    ["above a 52-week high", { field: "pctFromHigh52", min: 5, max: null }, /can't be above 0%/],
  ])("rejects %s", (_label, range, message) => {
    const v = validateScreen(screen({ ranges: [range as Screen["ranges"][number]] }));
    expect(v.ok).toBe(false);
    expect(!v.ok && v.errors[0].message).toMatch(message);
  });

  it("rejects the same field twice and an unavailable sort", () => {
    const v = validateScreen(
      screen({
        ranges: [
          { field: "price", min: 1, max: null },
          { field: "price", min: null, max: 9 },
        ],
        sort: { field: "volume" as never, direction: "desc" },
      })
    );
    expect(!v.ok && v.errors.map((e) => e.field)).toEqual(["price", "sort"]);
  });

  it("accepts a min equal to the max", () => {
    expect(validateScreen(screen({ ranges: [{ field: "price", min: 100, max: 100 }] })).ok).toBe(true);
  });
});

describe("applyScreen", () => {
  it("never matches unpriced stocks, and counts them", () => {
    const r = applyScreen(ROWS, EMPTY_SCREEN);
    expect(symbols(r.rows)).not.toContain("BAGMANE.NS");
    expect(r.unpriced).toBe(1);
    expect(r.rows).toHaveLength(5);
  });

  it("combines filters with AND", () => {
    const r = applyScreen(
      ROWS,
      screen({ ranges: [{ field: "changePercent", min: 1, max: null }, { field: "price", min: null, max: 3000 }], nifty50Only: true })
    );
    expect(symbols(r.rows)).toEqual(["INFY.NS"]);
  });

  it("filters by sector and NIFTY 50 membership", () => {
    expect(symbols(applyScreen(ROWS, screen({ sectors: ["Financial Services"] })).rows).sort()).toEqual(["GROWW.NS", "SMALL.NS"]);
    expect(symbols(applyScreen(ROWS, screen({ nifty50Only: true })).rows).sort()).toEqual(["INFY.NS", "TCS.NS", "TRENT.NS"]);
  });

  it("treats bounds as inclusive", () => {
    expect(symbols(applyScreen(ROWS, screen({ ranges: [{ field: "price", min: 150, max: 150 }] })).rows)).toEqual(["GROWW.NS"]);
  });

  it("excludes a stock with no value for a filtered field and counts it", () => {
    const r = applyScreen(ROWS, screen({ ranges: [{ field: "pctFromHigh52", min: null, max: -30 }] }));
    expect(symbols(r.rows).sort()).toEqual(["SMALL.NS", "TCS.NS", "TRENT.NS"]);
    expect(r.excludedForMissing).toEqual({ pctFromHigh52: 1 });
  });

  it("does not blame missing data when the stock failed another filter anyway", () => {
    const r = applyScreen(
      ROWS,
      screen({ ranges: [{ field: "return1y", min: 0, max: null }, { field: "price", min: 1000, max: null }] })
    );
    // GROWW has no 1-year return, but at ₹150 it fails the price filter regardless.
    expect(r.excludedForMissing).toEqual({});
    expect(symbols(r.rows)).toEqual(["INFY.NS"]);
  });

  it("returns nothing (not an error) when nothing matches", () => {
    expect(applyScreen(ROWS, screen({ ranges: [{ field: "changePercent", min: 50, max: null }] })).rows).toEqual([]);
  });

  it("sorts the matches by the screen's sort", () => {
    const r = applyScreen(ROWS, screen({ sort: { field: "price", direction: "asc" } }));
    expect(symbols(r.rows)).toEqual(["SMALL.NS", "GROWW.NS", "INFY.NS", "TCS.NS", "TRENT.NS"]);
  });
});

describe("sortRows", () => {
  it("puts missing values last in both directions", () => {
    const desc = sortRows(ROWS.slice(0, 5), { field: "return1y", direction: "desc" });
    const asc = sortRows(ROWS.slice(0, 5), { field: "return1y", direction: "asc" });
    expect(symbols(desc)).toEqual(["INFY.NS", "TCS.NS", "TRENT.NS", "SMALL.NS", "GROWW.NS"]);
    expect(symbols(asc)).toEqual(["SMALL.NS", "TRENT.NS", "TCS.NS", "INFY.NS", "GROWW.NS"]);
  });

  it("breaks ties by symbol and sorts by name ignoring case", () => {
    const tied = [row("B.NS", { changePercent: 1 }), row("A.NS", { changePercent: 1 })];
    expect(symbols(sortRows(tied, { field: "changePercent", direction: "desc" }))).toEqual(["A.NS", "B.NS"]);
    const named = [row("X.NS", { name: "zeta" }), row("Y.NS", { name: "Alpha" })];
    expect(symbols(sortRows(named, { field: "name", direction: "asc" }))).toEqual(["Y.NS", "X.NS"]);
  });

  it("does not change the input", () => {
    const copy = [...ROWS];
    sortRows(ROWS, { field: "price", direction: "asc" });
    expect(ROWS).toEqual(copy);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 120 }, (_, i) => i);

  it("pages by 50 and clamps out-of-range pages", () => {
    expect(paginate(items, 0)).toMatchObject({ page: 0, pageCount: 3, total: 120, items: items.slice(0, 50) });
    expect(paginate(items, 2).items).toEqual(items.slice(100));
    expect(paginate(items, 9).page).toBe(2);
    expect(paginate(items, -1).page).toBe(0);
    expect(paginate([], 0)).toEqual({ items: [], page: 0, pageCount: 1, total: 0 });
  });
});

describe("sectorsIn", () => {
  it("lists sectors of priced stocks with counts, by name", () => {
    expect(sectorsIn(ROWS)).toEqual([
      { sector: "Consumer Services", count: 1 },
      { sector: "Financial Services", count: 2 },
      { sector: "Information Technology", count: 2 },
    ]);
  });
});

describe("chips", () => {
  it("describes ranges and the whole screen", () => {
    expect(describeRange({ field: "changePercent", min: 2, max: null })).toBe("Change today ≥ 2%");
    expect(describeRange({ field: "price", min: 100, max: 1500 })).toBe("Price ₹100–₹1,500");
    expect(describeRange({ field: "pctFromHigh52", min: null, max: -30 })).toBe("From 52-week high ≤ -30%");
    const s = screen({ ranges: [{ field: "price", min: 100, max: null }], sectors: ["Realty", "Healthcare"], nifty50Only: true });
    expect(describeScreen(s)).toEqual(["Price ≥ ₹100", "2 sectors", "NIFTY 50 only"]);
    expect(describeScreen(screen({ sectors: ["Realty"] }))).toEqual(["Realty"]);
    expect(activeFilterCount(s)).toBe(3);
    expect(activeFilterCount(EMPTY_SCREEN)).toBe(0);
  });
});

describe("presets", () => {
  it("are valid screens with unique ids", () => {
    expect(new Set(SCREENER_PRESETS.map((p) => p.id)).size).toBe(SCREENER_PRESETS.length);
    for (const preset of SCREENER_PRESETS) expect(validateScreen(preset.screen).ok).toBe(true);
  });

  it("find what they say", () => {
    const run = (id: string) => symbols(applyScreen(ROWS, SCREENER_PRESETS.find((p) => p.id === id)!.screen).rows);
    expect(run("near-52w-high")).toEqual(["INFY.NS"]);
    expect(run("gainers-today")).toEqual(["TRENT.NS", "INFY.NS"]);
    expect(run("beaten-down")).toEqual(["SMALL.NS", "TRENT.NS", "TCS.NS"]);
    expect(run("nifty50-today")).toEqual(["TRENT.NS", "INFY.NS", "TCS.NS"]);
  });
});

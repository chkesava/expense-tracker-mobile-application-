/**
 * What the stock screener screen shows, as plain data (SPENDLY-623, story
 * SPENDLY-651). The components only draw this; every state and every label is
 * decided here so it can be tested (the repo does not render components in
 * tests).
 */

import type { ScreenerRowDTO, ScreenerUniverseDTO } from "../types/market";
import type { Instrument, MoverView } from "./marketsView";
import { formatSignedPct } from "./marketsView";
import {
  applyScreen,
  describeScreen,
  paginate,
  screenerField,
  SCREENER_PAGE_SIZE,
  type NumericFieldId,
  type RangeFilter,
  type Screen,
  type SortFieldId,
} from "./screener";
import { screenerFreshness, screenerFreshnessLabel } from "./screenerUniverse";
import { formatQuotePrice } from "./stockChartInspect";

export type ScreenerRowView = {
  symbol: string;
  /** NSE ticker without Yahoo's suffix. */
  ticker: string;
  name: string;
  sector: string;
  /** "₹1,164.90" */
  price: string;
  /** "-0.21%", or "—" with no previous close. */
  changePercent: string;
  direction: "up" | "down" | "flat";
  /** The value of the field being sorted on, e.g. "From 52-week high -26.84%"; null when sorting by price, change or name. */
  sortedValue: string | null;
  accessibilityLabel: string;
};

export type ScreenerBanner = { tone: "info" | "warning" | "error"; text: string; retry: boolean };

export type ScreenerView =
  | { kind: "loading" }
  | { kind: "empty"; title: string; description: string; retry: boolean }
  | { kind: "unavailable"; title: string; description: string; label: string; retry: boolean }
  | {
      kind: "ready";
      /** "Market closed · closing prices of 30 Oct" */
      label: string;
      /** "Among NIFTY 500 stocks · 499 of 500 priced" */
      coverage: string;
      banner: ScreenerBanner | null;
      dimmed: boolean;
      refreshing: boolean;
      chips: string[];
      /** "23 stocks match" */
      countText: string;
      /** "1 stock has no 52-week data, so it isn't included." */
      notes: string[];
      /** No stock matched the filters. */
      noMatches: boolean;
      rows: ScreenerRowView[];
      /** Rows shown so far vs total, for "Show more". */
      shown: number;
      total: number;
      hasMore: boolean;
    };

export type ScreenerViewInput = {
  /** `undefined` until something has loaded; `null` when no market API is configured. */
  data: ScreenerUniverseDTO | null | undefined;
  isFetching: boolean;
  isOffline: boolean;
  errorMessage: string | null;
  screen: Screen;
  /** How many pages of results are shown (1 = the first 50). */
  pages: number;
  nowMs: number;
};

function direction(value: number | null): "up" | "down" | "flat" {
  if (value == null) return "flat";
  const r = Math.round(value * 100) / 100;
  return r > 0 ? "up" : r < 0 ? "down" : "flat";
}

function formatFieldValue(field: NumericFieldId, value: number | null): string {
  if (value == null) return "—";
  const unit = screenerField(field).unit;
  return unit === "percent" ? formatSignedPct(value) : formatQuotePrice(value, "INR");
}

/** The extra figure a row shows for the sort field (price and change are always shown). */
function sortedValue(row: ScreenerRowDTO, sort: SortFieldId): string | null {
  if (sort === "name" || sort === "price" || sort === "changePercent") return null;
  return `${screenerField(sort).label} ${formatFieldValue(sort, row[sort])}`;
}

export function screenerRowView(row: ScreenerRowDTO, sort: SortFieldId): ScreenerRowView {
  const ticker = row.symbol.replace(/\.(NS|BO)$/, "");
  const price = row.price != null ? formatQuotePrice(row.price, "INR") : "—";
  const changePercent = row.changePercent != null ? formatSignedPct(row.changePercent) : "—";
  const dir = direction(row.changePercent);
  const spoken = row.changePercent == null ? "change unknown" : dir === "flat" ? "unchanged" : `${dir} ${Math.abs(row.changePercent).toFixed(2)} percent`;
  return {
    symbol: row.symbol,
    ticker,
    name: row.name,
    sector: row.sector,
    price,
    changePercent,
    direction: dir,
    sortedValue: sortedValue(row, sort),
    accessibilityLabel: `${row.name}, ${row.sector}, ${price}, ${spoken}`,
  };
}

/** The read-only stock sheet (SPENDLY-646) for a screener row. */
export function screenerRowInstrument(row: ScreenerRowDTO): Instrument {
  const view = screenerRowView(row, "name");
  const item: MoverView = {
    symbol: row.symbol,
    ticker: view.ticker,
    name: row.name,
    price: view.price,
    changePercent: view.changePercent,
    direction: view.direction,
    accessibilityLabel: view.accessibilityLabel,
  };
  return { kind: "stock", item };
}

const MISSING_NOTE: Partial<Record<NumericFieldId, string>> = {
  changePercent: "no change today",
  pctFromHigh52: "no 52-week data",
  pctAboveLow52: "no 52-week data",
  high52: "no 52-week data",
  low52: "no 52-week data",
  return1y: "no 1-year history",
};

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}

/** Explains stocks left out for missing data, once per kind of gap. */
export function missingNotes(excluded: Partial<Record<NumericFieldId, number>>): string[] {
  const byText = new Map<string, number>();
  for (const [field, count] of Object.entries(excluded) as [NumericFieldId, number][]) {
    if (!count) continue;
    const text = MISSING_NOTE[field] ?? `no ${screenerField(field).label.toLowerCase()}`;
    byText.set(text, Math.max(byText.get(text) ?? 0, count));
  }
  return [...byText.entries()].map(
    ([text, count]) => `${plural(count, "stock has", "stocks have")} ${text}, so ${count === 1 ? "it isn't" : "they aren't"} included.`
  );
}

function banner(input: ScreenerViewInput, data: ScreenerUniverseDTO): ScreenerBanner | null {
  if (input.isOffline) return { tone: "info", text: "You're offline. Showing the last prices saved on this device.", retry: false };
  if (input.errorMessage) return { tone: "error", text: `${input.errorMessage} Showing saved prices.`, retry: true };
  const freshness = screenerFreshness(data, input.nowMs);
  if (freshness === "expired") return { tone: "warning", text: "These prices are more than a day old.", retry: true };
  if (data.stale) return { tone: "warning", text: "The price provider is unavailable. These are the last prices we received.", retry: true };
  return null;
}

const UNAVAILABLE_TEXT = {
  LOW_COVERAGE: "Too few NIFTY 500 prices came back to screen fairly. Try again in a few minutes.",
  UPSTREAM: "The price provider didn't return enough NIFTY 500 prices. Try again in a few minutes.",
} as const;

export function screenerView(input: ScreenerViewInput): ScreenerView {
  const { data, nowMs } = input;
  if (!data) {
    if (input.isOffline) {
      return { kind: "empty", title: "You're offline", description: "Stock prices will load when you're back online.", retry: false };
    }
    if (input.errorMessage) return { kind: "empty", title: "Screener unavailable", description: input.errorMessage, retry: true };
    if (data === undefined) return { kind: "loading" };
    return { kind: "empty", title: "Screener unavailable", description: "Market data isn't set up for this build yet.", retry: true };
  }

  const label = screenerFreshnessLabel(data, nowMs, { offline: input.isOffline });
  if (!data.available) {
    return { kind: "unavailable", title: "Can't screen right now", description: UNAVAILABLE_TEXT[data.reason], label, retry: !input.isOffline };
  }

  const result = applyScreen(data.rows, input.screen);
  const page = paginate(result.rows, 0, Math.max(1, input.pages) * SCREENER_PAGE_SIZE);
  return {
    kind: "ready",
    label,
    coverage: `Among NIFTY 500 stocks · ${data.priced.toLocaleString("en-IN")} of ${data.universeSize.toLocaleString("en-IN")} priced`,
    banner: banner(input, data),
    dimmed: screenerFreshness(data, nowMs) === "expired",
    refreshing: input.isFetching,
    chips: describeScreen(input.screen),
    countText: plural(result.rows.length, "stock matches", "stocks match"),
    notes: missingNotes(result.excludedForMissing),
    noMatches: result.rows.length === 0,
    rows: page.items.map((row) => screenerRowView(row, input.screen.sort.field)),
    shown: page.items.length,
    total: result.rows.length,
    hasMore: page.items.length < result.rows.length,
  };
}

// --- Filter sheet input parsing ---------------------------------------------

/** "" → null (no bound), "12.5" → 12.5, "1,200" → 1200, anything else → NaN (validation reports it). */
export function parseBoundInput(text: string): number | null {
  const cleaned = text.replace(/[₹,%\s]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

/** The range a pair of text boxes describes, or null when both are empty. */
export function rangeFromInputs(field: NumericFieldId, minText: string, maxText: string): RangeFilter | null {
  const min = parseBoundInput(minText);
  const max = parseBoundInput(maxText);
  if (min === null && max === null) return null;
  return { field, min, max };
}

/** Text for an input box from a saved bound. */
export function boundToInput(value: number | null): string {
  return value == null ? "" : String(value);
}

export const SORT_OPTIONS: readonly { field: SortFieldId; label: string }[] = [
  { field: "changePercent", label: "Change today" },
  { field: "price", label: "Price" },
  { field: "pctFromHigh52", label: "From 52-week high" },
  { field: "pctAboveLow52", label: "Above 52-week low" },
  { field: "return1y", label: "1-year return" },
  { field: "name", label: "Name" },
];

/**
 * Stock screener engine (SPENDLY-623, story SPENDLY-648): which fields can be
 * filtered, validating a screen, applying it to the NIFTY 500 rows, sorting
 * and paging. Pure, no React Native imports; the screen (651) only draws it.
 *
 * Rules that keep results honest:
 * - A filter exists only for a field with a documented source. Market cap,
 *   P/E and volume are listed but unavailable, with the reason, and a screen
 *   that uses them is rejected rather than silently returning nothing.
 * - A stock with no value for a filtered field is excluded from that filter
 *   and counted, so the screen can say "12 stocks have no 52-week data".
 * - Unpriced stocks never match: there is nothing to screen.
 * - Missing values sort last in either direction; ties break by symbol.
 */

import type { ScreenerRowDTO } from "../types/market";

export type NumericFieldId =
  | "price"
  | "changePercent"
  | "pctFromHigh52"
  | "pctAboveLow52"
  | "return1y"
  | "high52"
  | "low52";

export type UnavailableFieldId = "marketCap" | "pe" | "volume";
export type ScreenerFieldId = NumericFieldId | UnavailableFieldId;
export type SortFieldId = NumericFieldId | "name";

export type ScreenerField = {
  id: ScreenerFieldId;
  label: string;
  /** How values read: rupees, percent, a plain ratio or a count. */
  unit: "inr" | "percent" | "ratio" | "count";
  /** What the number means and where it comes from. */
  description: string;
  available: boolean;
  /** Why an unavailable field can't be used. */
  unavailableReason?: string;
  /** Values outside these can never occur, so a bound outside them is a mistake. */
  bounds: { min: number | null; max: number | null };
};

const FROM_CLOSES = "From daily closing prices (Yahoo Finance), which may be delayed.";
const NO_FUNDAMENTALS =
  "Not available: this needs a licensed company-fundamentals source. Our free price feed doesn't include it.";

export const SCREENER_FIELDS: readonly ScreenerField[] = [
  { id: "price", label: "Price", unit: "inr", description: `Latest close. ${FROM_CLOSES}`, available: true, bounds: { min: 0, max: null } },
  {
    id: "changePercent",
    label: "Change today",
    unit: "percent",
    description: `Change from the previous close. ${FROM_CLOSES}`,
    available: true,
    bounds: { min: -100, max: null },
  },
  {
    id: "pctFromHigh52",
    label: "From 52-week high",
    unit: "percent",
    description: `How far below its highest close of the last 52 weeks (0% = at the high). ${FROM_CLOSES}`,
    available: true,
    bounds: { min: -100, max: 0 },
  },
  {
    id: "pctAboveLow52",
    label: "Above 52-week low",
    unit: "percent",
    description: `How far above its lowest close of the last 52 weeks (0% = at the low). ${FROM_CLOSES}`,
    available: true,
    bounds: { min: 0, max: null },
  },
  {
    id: "return1y",
    label: "1-year return",
    unit: "percent",
    description: `Price change over the last year, excluding dividends. ${FROM_CLOSES}`,
    available: true,
    bounds: { min: -100, max: null },
  },
  { id: "high52", label: "52-week high", unit: "inr", description: `Highest close of the last 52 weeks. ${FROM_CLOSES}`, available: true, bounds: { min: 0, max: null } },
  { id: "low52", label: "52-week low", unit: "inr", description: `Lowest close of the last 52 weeks. ${FROM_CLOSES}`, available: true, bounds: { min: 0, max: null } },
  { id: "marketCap", label: "Market cap", unit: "inr", description: "Company value at today's price.", available: false, unavailableReason: NO_FUNDAMENTALS, bounds: { min: 0, max: null } },
  { id: "pe", label: "P/E ratio", unit: "ratio", description: "Price to earnings.", available: false, unavailableReason: NO_FUNDAMENTALS, bounds: { min: null, max: null } },
  {
    id: "volume",
    label: "Volume",
    unit: "count",
    description: "Shares traded today.",
    available: false,
    unavailableReason: "Not available: our price feed only gives volume one stock at a time, far too slow for 500 stocks.",
    bounds: { min: 0, max: null },
  },
];

const FIELD_BY_ID = new Map(SCREENER_FIELDS.map((f) => [f.id, f]));

export function screenerField(id: ScreenerFieldId): ScreenerField {
  const field = FIELD_BY_ID.get(id);
  if (!field) throw new Error(`Unknown screener field: ${id}`);
  return field;
}

export function isAvailableNumericField(id: string): id is NumericFieldId {
  return FIELD_BY_ID.get(id as ScreenerFieldId)?.available === true;
}

export type RangeFilter = { field: NumericFieldId; min: number | null; max: number | null };

export type Screen = {
  ranges: RangeFilter[];
  /** Empty means every sector. */
  sectors: string[];
  nifty50Only: boolean;
  sort: { field: SortFieldId; direction: "asc" | "desc" };
};

export const DEFAULT_SORT: Screen["sort"] = { field: "changePercent", direction: "desc" };

export const EMPTY_SCREEN: Screen = { ranges: [], sectors: [], nifty50Only: false, sort: DEFAULT_SORT };

export type ScreenError = { field?: ScreenerFieldId | "sort" | "sectors"; message: string };

export type ValidatedScreen = { ok: true; screen: Screen } | { ok: false; errors: ScreenError[] };

function fmtBound(value: number, unit: ScreenerField["unit"]): string {
  return unit === "percent" ? `${value}%` : unit === "inr" ? `₹${value}` : String(value);
}

/**
 * Checks a screen before it is applied or saved. Returns a normalised copy
 * (sectors de-duplicated and sorted) or every problem found, each tied to the
 * field the UI should mark.
 */
export function validateScreen(screen: Screen): ValidatedScreen {
  const errors: ScreenError[] = [];
  const seen = new Set<string>();

  for (const range of screen.ranges) {
    const field = FIELD_BY_ID.get(range.field);
    if (!field) {
      errors.push({ message: `Unknown filter "${String(range.field)}".` });
      continue;
    }
    if (!field.available) {
      errors.push({ field: field.id, message: `${field.label} can't be used. ${field.unavailableReason ?? ""}`.trim() });
      continue;
    }
    if (seen.has(field.id)) {
      errors.push({ field: field.id, message: `${field.label} is filtered twice. Keep one range per field.` });
      continue;
    }
    seen.add(field.id);
    const { min, max } = range;
    if (min == null && max == null) {
      errors.push({ field: field.id, message: `Enter a minimum, a maximum or both for ${field.label}.` });
      continue;
    }
    if ((min != null && !Number.isFinite(min)) || (max != null && !Number.isFinite(max))) {
      errors.push({ field: field.id, message: `${field.label} needs numbers.` });
      continue;
    }
    if (min != null && max != null && min > max) {
      errors.push({ field: field.id, message: `${field.label}: the minimum is above the maximum.` });
      continue;
    }
    const lo = field.bounds.min;
    const hi = field.bounds.max;
    for (const value of [min, max]) {
      if (value == null) continue;
      if (lo != null && value < lo) {
        errors.push({ field: field.id, message: `${field.label} can't be below ${fmtBound(lo, field.unit)}.` });
        break;
      }
      if (hi != null && value > hi) {
        errors.push({ field: field.id, message: `${field.label} can't be above ${fmtBound(hi, field.unit)}.` });
        break;
      }
    }
  }

  if (screen.sort.field !== "name" && !isAvailableNumericField(screen.sort.field)) {
    errors.push({ field: "sort", message: "That sort isn't available." });
  }
  if (screen.sort.direction !== "asc" && screen.sort.direction !== "desc") {
    errors.push({ field: "sort", message: "Choose ascending or descending." });
  }
  if (screen.sectors.some((s) => typeof s !== "string" || s.trim() === "")) {
    errors.push({ field: "sectors", message: "A sector name is empty." });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    screen: {
      ranges: screen.ranges.map((r) => ({ field: r.field, min: r.min, max: r.max })),
      sectors: [...new Set(screen.sectors.map((s) => s.trim()))].sort(),
      nifty50Only: screen.nifty50Only === true,
      sort: { field: screen.sort.field, direction: screen.sort.direction },
    },
  };
}

export type ScreenResult = {
  rows: ScreenerRowDTO[];
  /** Stocks that passed every other filter but had no value for this field. */
  excludedForMissing: Partial<Record<NumericFieldId, number>>;
  /** Stocks with no price at all, never matched. */
  unpriced: number;
};

/** Applies a validated screen: AND of every filter, then the sort. */
export function applyScreen(rows: readonly ScreenerRowDTO[], screen: Screen): ScreenResult {
  const sectors = new Set(screen.sectors);
  const excludedForMissing: Partial<Record<NumericFieldId, number>> = {};
  let unpriced = 0;
  const matched: ScreenerRowDTO[] = [];

  for (const row of rows) {
    if (row.price == null) {
      unpriced += 1;
      continue;
    }
    if (screen.nifty50Only && !row.nifty50) continue;
    if (sectors.size > 0 && !sectors.has(row.sector)) continue;

    let ok = true;
    const missing: NumericFieldId[] = [];
    for (const range of screen.ranges) {
      const value = row[range.field];
      if (value == null) {
        missing.push(range.field);
        ok = false;
        continue;
      }
      if ((range.min != null && value < range.min) || (range.max != null && value > range.max)) ok = false;
    }
    // Count a missing value only when it alone kept the stock out: if the stock
    // also failed a filter it had data for, the data gap changed nothing.
    if (missing.length > 0 && screen.ranges.every((r) => missing.includes(r.field) || inRange(row[r.field], r))) {
      for (const field of missing) excludedForMissing[field] = (excludedForMissing[field] ?? 0) + 1;
    }
    if (ok) matched.push(row);
  }

  return { rows: sortRows(matched, screen.sort), excludedForMissing, unpriced };
}

function inRange(value: number | null, range: RangeFilter): boolean {
  if (value == null) return false;
  return (range.min == null || value >= range.min) && (range.max == null || value <= range.max);
}

const bySymbol = (a: ScreenerRowDTO, b: ScreenerRowDTO) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);

/** Sorted copy. Missing values last in either direction; ties by symbol. */
export function sortRows(rows: readonly ScreenerRowDTO[], sort: Screen["sort"]): ScreenerRowDTO[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.field === "name") {
      const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      return byName !== 0 ? byName * dir : bySymbol(a, b);
    }
    const va = a[sort.field];
    const vb = b[sort.field];
    if (va == null && vb == null) return bySymbol(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    return va !== vb ? (va - vb) * dir : bySymbol(a, b);
  });
}

export const SCREENER_PAGE_SIZE = 50;

export type Page<T> = { items: T[]; page: number; pageCount: number; total: number };

/** One page (0-based), clamped to the last page. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number = SCREENER_PAGE_SIZE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(Math.max(0, Math.floor(page)), pageCount - 1);
  return { items: items.slice(p * pageSize, (p + 1) * pageSize), page: p, pageCount, total: items.length };
}

/** Sectors present in the rows, with how many priced stocks each has, by name. */
export function sectorsIn(rows: readonly ScreenerRowDTO[]): { sector: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) if (row.price != null) counts.set(row.sector, (counts.get(row.sector) ?? 0) + 1);
  return [...counts.entries()].map(([sector, count]) => ({ sector, count })).sort((a, b) => a.sector.localeCompare(b.sector));
}

export function activeFilterCount(screen: Screen): number {
  return screen.ranges.length + (screen.sectors.length > 0 ? 1 : 0) + (screen.nifty50Only ? 1 : 0);
}

function fmtValue(value: number, unit: ScreenerField["unit"]): string {
  if (unit === "percent") return `${value}%`;
  return unit === "inr" ? `₹${value.toLocaleString("en-IN")}` : value.toLocaleString("en-IN");
}

/** Chip text for one range, e.g. "Change today ≥ 2%" or "Price ₹100–₹500". */
export function describeRange(range: RangeFilter): string {
  const field = screenerField(range.field);
  const { min, max } = range;
  if (min != null && max != null) return `${field.label} ${fmtValue(min, field.unit)}–${fmtValue(max, field.unit)}`;
  if (min != null) return `${field.label} ≥ ${fmtValue(min, field.unit)}`;
  return `${field.label} ≤ ${fmtValue(max as number, field.unit)}`;
}

/** Chip texts for a whole screen, in a stable order. */
export function describeScreen(screen: Screen): string[] {
  const chips = screen.ranges.map(describeRange);
  if (screen.sectors.length === 1) chips.push(screen.sectors[0]);
  else if (screen.sectors.length > 1) chips.push(`${screen.sectors.length} sectors`);
  if (screen.nifty50Only) chips.push("NIFTY 50 only");
  return chips;
}

export type ScreenPreset = { id: string; name: string; description: string; screen: Screen };

/** Ready-made screens. They are plain screens, so they validate like any other. */
export const SCREENER_PRESETS: readonly ScreenPreset[] = [
  {
    id: "near-52w-high",
    name: "Near 52-week high",
    description: "Within 5% of their highest close of the last year.",
    screen: { ...EMPTY_SCREEN, ranges: [{ field: "pctFromHigh52", min: -5, max: null }], sort: { field: "pctFromHigh52", direction: "desc" } },
  },
  {
    id: "gainers-today",
    name: "Up 2% or more today",
    description: "Today's biggest gainers.",
    screen: { ...EMPTY_SCREEN, ranges: [{ field: "changePercent", min: 2, max: null }], sort: { field: "changePercent", direction: "desc" } },
  },
  {
    id: "beaten-down",
    name: "30% or more below 52-week high",
    description: "Stocks well off their highs.",
    screen: { ...EMPTY_SCREEN, ranges: [{ field: "pctFromHigh52", min: null, max: -30 }], sort: { field: "pctFromHigh52", direction: "asc" } },
  },
  {
    id: "nifty50-today",
    name: "NIFTY 50 today",
    description: "The 50 largest stocks, by today's change.",
    screen: { ...EMPTY_SCREEN, nifty50Only: true, sort: { field: "changePercent", direction: "desc" } },
  },
];

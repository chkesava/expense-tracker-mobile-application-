/**
 * Point inspection for the stock chart (SPENDLY-560): which bar is under the
 * pointer, what exact values it carries, where the tooltip goes, and how the
 * selection reacts to hover, touch, keyboard and series changes.
 *
 * Pure on purpose, like `stockChartGeometry`: the chart components only wire
 * events to these functions, so the behaviour is provable in Vitest.
 *
 * Values only ever come from the already-loaded normalized series
 * (`StockHistoryDTO.candles`); nothing here fetches, infers or fills prices.
 */

import type { StockCandle, StockHistoryRange } from "../types/market";
import { formatAmount } from "./formatCurrency";
import { GHOST_AMOUNT } from "./ghostMoney";
import { isCompleteCandle, type ChartMode } from "./stockChartGeometry";
import { formatBarTime } from "./stockHistory";

/**
 * Raw bars merged into each drawn bar by `aggregateCandles(raw, maxBars)`.
 * Kept in step with it: drawn bar i covers raw `[i * size, (i + 1) * size)`.
 */
export function aggregationBucketSize(rawLength: number, maxBars: number): number {
  if (maxBars < 1 || rawLength <= maxBars) return 1;
  return Math.ceil(rawLength / maxBars);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A drawn bar can be inspected: a close for the line, every price for a candle. */
export function isInspectable(candle: StockCandle | undefined, mode: ChartMode): boolean {
  if (!candle) return false;
  if (mode === "line") return isFiniteNumber(candle.c);
  return (
    isCompleteCandle(candle) &&
    isFiniteNumber(candle.o) &&
    isFiniteNumber(candle.h) &&
    isFiniteNumber(candle.l) &&
    isFiniteNumber(candle.c)
  );
}

/**
 * The inspectable bar nearest to `index`, searching outward; ties go to the
 * earlier bar. `null` when the series has none (or `index` is not a number).
 */
export function nearestInspectableIndex(
  drawn: readonly StockCandle[],
  mode: ChartMode,
  index: number
): number | null {
  if (!Number.isFinite(index) || drawn.length === 0) return null;
  const start = Math.min(Math.max(Math.round(index), 0), drawn.length - 1);
  for (let d = 0; d < drawn.length; d += 1) {
    if (start - d >= 0 && isInspectable(drawn[start - d], mode)) return start - d;
    if (start + d < drawn.length && isInspectable(drawn[start + d], mode)) return start + d;
  }
  return null;
}

/**
 * Keyboard stepping: the next inspectable bar in `direction` from `from`, or
 * the first/last one. With nothing selected, a step lands on the latest bar
 * (what a reader most likely wants first). Stays put at either end.
 */
export function stepInspectableIndex(
  drawn: readonly StockCandle[],
  mode: ChartMode,
  from: number | null,
  direction: "prev" | "next" | "first" | "last"
): number | null {
  const valid: number[] = [];
  drawn.forEach((candle, i) => {
    if (isInspectable(candle, mode)) valid.push(i);
  });
  if (valid.length === 0) return null;
  if (direction === "first") return valid[0];
  if (direction === "last" || from == null) return valid[valid.length - 1];
  if (direction === "next") return valid.find((i) => i > from) ?? valid[valid.length - 1];
  for (let k = valid.length - 1; k >= 0; k -= 1) if (valid[k] < from) return valid[k];
  return valid[0];
}

export type InspectedPoint =
  | {
      kind: "line";
      /** Drawn-series index: where the marker sits. */
      index: number;
      /** The exact close drawn at this vertex. */
      price: number;
      /** Time of the raw bar that close belongs to. */
      t: number;
    }
  | {
      kind: "candle";
      index: number;
      o: number;
      h: number;
      l: number;
      c: number;
      v: number | null;
      /** First and last raw bar times the candle covers (equal for one bar). */
      startT: number;
      endT: number;
      /** How many raw bars were merged into this candle. */
      bars: number;
    };

/**
 * The exact values behind drawn bar `index`.
 *
 * - Line: a merged vertex shows its bucket's last close, so the label uses
 *   the time of the raw bar that close came from, never the bucket start.
 * - Candle: the merged candle is genuine OHLC of its raw bars (first open,
 *   highest high, lowest low, last close, summed volume), so it is shown as
 *   is with the time span it covers.
 */
export function inspectPoint(
  raw: readonly StockCandle[],
  drawn: readonly StockCandle[],
  bucketSize: number,
  mode: ChartMode,
  index: number | null
): InspectedPoint | null {
  if (index == null || !isInspectable(drawn[index], mode)) return null;
  const size = Math.max(1, Math.floor(bucketSize));
  const from = index * size;
  const to = Math.min(raw.length, from + size) - 1;
  const bar = drawn[index];

  if (mode === "line") {
    // The raw bar whose close the vertex draws: the last finite close in the bucket.
    for (let i = to; i >= from; i -= 1) {
      const c = raw[i]?.c;
      if (isFiniteNumber(c) && isFiniteNumber(raw[i].t)) return { kind: "line", index, price: c, t: raw[i].t };
    }
    // Unaggregated series (or raw not supplied): the drawn bar is the raw bar.
    return isFiniteNumber(bar.t) ? { kind: "line", index, price: bar.c as number, t: bar.t } : null;
  }

  const startT = isFiniteNumber(raw[from]?.t) ? raw[from].t : bar.t;
  const endT = isFiniteNumber(raw[to]?.t) ? raw[to].t : startT;
  if (!isFiniteNumber(startT)) return null;
  return {
    kind: "candle",
    index,
    o: bar.o as number,
    h: bar.h as number,
    l: bar.l as number,
    c: bar.c as number,
    v: isFiniteNumber(bar.v) && bar.v > 0 ? bar.v : null,
    startT,
    endT,
    bars: Math.max(1, to - from + 1),
  };
}

/** The price the marker sits on: the close for both chart types. */
export function inspectedMarkerPrice(point: InspectedPoint): number {
  return point.kind === "line" ? point.price : point.c;
}

/**
 * A quote price with the precision the source carries: always two decimals,
 * up to four when the value has them (low-priced listings), with binary
 * float noise rounded away. Masked in ghost mode, like every other amount.
 */
export function formatQuotePrice(value: number, currency: string, ghost = false): string {
  if (!Number.isFinite(value)) return "—";
  if (ghost) return value < 0 ? `-${GHOST_AMOUNT}` : GHOST_AMOUNT;
  const rounded = Math.round(value * 10_000) / 10_000;
  let digits = 2;
  while (digits < 4 && Math.abs(Math.round(rounded * 10 ** digits) / 10 ** digits - rounded) > 1e-9) digits += 1;
  return formatAmount(rounded, currency, { fractionDigits: digits });
}

/** Volume as a whole number with Indian grouping (12,34,567). */
export function formatVolume(volume: number): string {
  if (!Number.isFinite(volume)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(volume);
}

/** "16 Oct 2026, 10:15" for one bar, or "6 Oct 2026 – 13 Oct 2026" for a merged one. */
export function formatInspectedTime(
  point: InspectedPoint,
  range: StockHistoryRange,
  gmtOffsetSec: number
): string {
  if (point.kind === "line") return formatBarTime(point.t, range, gmtOffsetSec);
  const start = formatBarTime(point.startT, range, gmtOffsetSec);
  if (point.bars <= 1 || point.endT === point.startT) return start;
  return `${start} – ${formatBarTime(point.endT, range, gmtOffsetSec)}`;
}

/** One short sentence for screen readers. */
export function inspectedPointLabel(
  point: InspectedPoint,
  time: string,
  price: (value: number) => string,
  volume?: string | null
): string {
  if (point.kind === "line") return `${time}: ${price(point.price)}`;
  const vol = volume ? `, volume ${volume}` : "";
  return `${time}: open ${price(point.o)}, high ${price(point.h)}, low ${price(point.l)}, close ${price(point.c)}${vol}`;
}

/**
 * Where the tooltip goes inside the plot. Beside the point (right by
 * default, left when it would overflow) so it never covers the marker,
 * vertically centred on it, and always clamped inside the area.
 */
export function tooltipPosition(input: {
  pointX: number;
  pointY: number;
  tipWidth: number;
  tipHeight: number;
  areaWidth: number;
  areaHeight: number;
  gap?: number;
}): { left: number; top: number; side: "left" | "right" } {
  const { pointX, pointY, tipWidth, tipHeight, areaWidth, areaHeight, gap = 12 } = input;
  const maxLeft = Math.max(0, areaWidth - tipWidth);
  const maxTop = Math.max(0, areaHeight - tipHeight);
  const rightLeft = pointX + gap;
  const fitsRight = rightLeft + tipWidth <= areaWidth;
  const fitsLeft = pointX - gap - tipWidth >= 0;
  // Right when it fits, else left when that fits, else whichever side has more room.
  const side: "left" | "right" = fitsRight ? "right" : fitsLeft ? "left" : pointX < areaWidth / 2 ? "right" : "left";
  const rawLeft = side === "right" ? rightLeft : pointX - gap - tipWidth;
  return {
    left: Math.min(Math.max(rawLeft, 0), maxLeft),
    top: Math.min(Math.max(pointY - tipHeight / 2, 0), maxTop),
    side,
  };
}

// ---- Selection state ---------------------------------------------------------

/** How the current selection was made; it decides how it ends. */
export type SelectionSource = "hover" | "touch" | "keyboard";

export type ChartSelection = {
  index: number | null;
  source: SelectionSource | null;
  /** The series it was made on; a different series never shows it. */
  seriesKey: string | null;
};

export const NO_SELECTION: ChartSelection = { index: null, source: null, seriesKey: null };

export type ChartSelectionEvent =
  /** Mouse/pen moving over the plot (web). */
  | { type: "hover"; index: number | null; seriesKey: string }
  /** Mouse/pen left the plot. */
  | { type: "leave" }
  /**
   * Finger or mouse button down, or dragging. A mouse press behaves like
   * hover (it follows the pointer and ends when the pointer leaves); a touch
   * press persists until dismissed or replaced.
   */
  | { type: "press"; index: number | null; seriesKey: string; pointer?: "touch" | "mouse" }
  /** Finger lifted: the selection stays, so it can be read. */
  | { type: "release" }
  /** Keyboard moved to a bar. */
  | { type: "key"; index: number | null; seriesKey: string }
  /** Close button, Escape, a range or chart-type change. */
  | { type: "dismiss" };

export function chartSelectionReducer(state: ChartSelection, event: ChartSelectionEvent): ChartSelection {
  switch (event.type) {
    case "hover":
      // A touch selection is never moved or cleared by a mouse: hybrid
      // devices (and browsers) fire mouse hover/leave around a touch.
      if (state.source === "touch" && state.index != null && state.seriesKey === event.seriesKey) return state;
      return event.index == null ? NO_SELECTION : { index: event.index, source: "hover", seriesKey: event.seriesKey };
    case "leave":
      // Only a mouse selection ends when the mouse leaves.
      return state.source === "hover" ? NO_SELECTION : state;
    case "press":
      if (event.index == null) return state;
      return {
        index: event.index,
        source: event.pointer === "mouse" ? "hover" : "touch",
        seriesKey: event.seriesKey,
      };
    case "release":
      return state;
    case "key":
      return event.index == null ? state : { index: event.index, source: "keyboard", seriesKey: event.seriesKey };
    case "dismiss":
      return NO_SELECTION;
  }
}

/** The selected drawn index, but only on the series it was made on. */
export function activeIndexFor(state: ChartSelection, seriesKey: string): number | null {
  return state.index != null && state.seriesKey === seriesKey ? state.index : null;
}

/**
 * Identity of what is drawn: a new range, chart type, width bucket or data
 * refresh gives a new key, so a selection can never point at another series.
 */
export function chartSeriesKey(parts: {
  symbol: string;
  range: StockHistoryRange;
  mode: ChartMode;
  drawn: readonly StockCandle[];
  asOf?: string;
}): string {
  const { drawn } = parts;
  const first = drawn[0]?.t ?? "";
  const last = drawn[drawn.length - 1]?.t ?? "";
  return `${parts.symbol}|${parts.range}|${parts.mode}|${drawn.length}|${first}|${last}|${parts.asOf ?? ""}`;
}

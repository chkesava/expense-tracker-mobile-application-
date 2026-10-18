/**
 * Pure geometry for the stock chart (SPENDLY-558): scales, line and candle
 * shapes, ticks and the chart's view state. The SVG components only draw what
 * this returns, so the maths is testable without a renderer.
 *
 * Bars are spaced evenly by index, not by time. Weekends, holidays and the
 * overnight gap between sessions therefore take no space, which is how
 * brokerage charts read.
 */

import type { StockCandle } from "../types/market";

export type ChartBox = {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
  padLeft: number;
  padRight: number;
};

export type PriceDomain = { min: number; max: number };

/**
 * Merges neighbouring bars until at most `maxBars` remain, so a narrow screen
 * never draws sub-pixel candles. Each merged bar is genuine OHLC of its
 * members: first open, highest high, lowest low, last close, summed volume.
 */
export function aggregateCandles(candles: StockCandle[], maxBars: number): StockCandle[] {
  if (maxBars < 1 || candles.length <= maxBars) return candles;
  const size = Math.ceil(candles.length / maxBars);
  const out: StockCandle[] = [];
  for (let start = 0; start < candles.length; start += size) {
    const bucket = candles.slice(start, start + size);
    let o: number | null = null;
    let h: number | null = null;
    let l: number | null = null;
    let c: number | null = null;
    let v: number | null = null;
    for (const bar of bucket) {
      if (o == null && bar.o != null) o = bar.o;
      if (bar.h != null) h = h == null ? bar.h : Math.max(h, bar.h);
      if (bar.l != null) l = l == null ? bar.l : Math.min(l, bar.l);
      if (bar.c != null) c = bar.c;
      if (bar.v != null) v = (v ?? 0) + bar.v;
    }
    out.push({ t: bucket[0].t, o, h, l, c, v });
  }
  return out;
}

export type ChartMode = "line" | "candle";

/** True when every price on the bar is known, i.e. it can be drawn as a candle. */
export function isCompleteCandle(
  candle: StockCandle
): candle is StockCandle & { o: number; h: number; l: number; c: number } {
  return candle.o != null && candle.h != null && candle.l != null && candle.c != null;
}

/** Vertical range with a little headroom; never zero-height. */
export function priceDomain(
  candles: StockCandle[],
  mode: ChartMode,
  baseline: number | null = null
): PriceDomain | null {
  const values: number[] = [];
  for (const candle of candles) {
    if (mode === "candle") {
      if (!isCompleteCandle(candle)) continue;
      values.push(candle.h, candle.l);
    } else if (candle.c != null) {
      values.push(candle.c);
    }
  }
  if (values.length === 0) return null;
  if (baseline != null) values.push(baseline);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    const pad = Math.abs(max) * 0.01 || 1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.06;
  min -= pad;
  max += pad;
  return { min, max };
}

function innerWidth(box: ChartBox): number {
  return Math.max(0, box.width - box.padLeft - box.padRight);
}

function innerHeight(box: ChartBox): number {
  return Math.max(0, box.height - box.padTop - box.padBottom);
}

export function yForPrice(price: number, domain: PriceDomain, box: ChartBox): number {
  const span = domain.max - domain.min || 1;
  return box.padTop + ((domain.max - price) / span) * innerHeight(box);
}

/** Line charts: the i-th of n points, first at the left edge, last at the right. */
export function xForLineIndex(index: number, count: number, box: ChartBox): number {
  if (count <= 1) return box.padLeft + innerWidth(box) / 2;
  return box.padLeft + (index / (count - 1)) * innerWidth(box);
}

/** Candle charts: the centre of the i-th of n equal slots. */
export function xForSlot(index: number, count: number, box: ChartBox): number {
  const slot = innerWidth(box) / Math.max(1, count);
  return box.padLeft + slot * (index + 0.5);
}

/** Nearest bar index under a touch, for the scrub readout. */
export function indexAtX(x: number, count: number, box: ChartBox, mode: ChartMode): number {
  if (count <= 1) return 0;
  const width = innerWidth(box);
  const rel = Math.min(Math.max(x - box.padLeft, 0), width);
  const index =
    mode === "line"
      ? Math.round((rel / width) * (count - 1))
      : Math.floor((rel / width) * count);
  return Math.min(Math.max(index, 0), count - 1);
}

export type LinePoint = { index: number; x: number; y: number };

export type LineGeometry = {
  /** One path per unbroken run of closes; a missing close breaks the line. */
  segments: string[];
  /** Closed area paths under each segment, for the gradient fill. */
  areas: string[];
  points: LinePoint[];
};

function fixed(n: number): string {
  return n.toFixed(2);
}

export function buildLineGeometry(candles: StockCandle[], domain: PriceDomain, box: ChartBox): LineGeometry {
  const runs: LinePoint[][] = [];
  let run: LinePoint[] = [];
  const points: LinePoint[] = [];
  candles.forEach((candle, index) => {
    if (candle.c == null) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    const point = {
      index,
      x: xForLineIndex(index, candles.length, box),
      y: yForPrice(candle.c, domain, box),
    };
    run.push(point);
    points.push(point);
  });
  if (run.length) runs.push(run);

  const bottom = box.height - box.padBottom;
  const segments: string[] = [];
  const areas: string[] = [];
  for (const r of runs) {
    // A lone point still needs a visible mark: draw it as a short flat tick.
    const pts = r.length === 1 ? [{ ...r[0], x: r[0].x - 1 }, { ...r[0], x: r[0].x + 1 }] : r;
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${fixed(p.x)} ${fixed(p.y)}`).join(" ");
    segments.push(line);
    areas.push(`${line} L${fixed(pts[pts.length - 1].x)} ${fixed(bottom)} L${fixed(pts[0].x)} ${fixed(bottom)} Z`);
  }
  return { segments, areas, points };
}

export type CandleShape = {
  index: number;
  x: number;
  bodyX: number;
  bodyY: number;
  bodyWidth: number;
  bodyHeight: number;
  wickTop: number;
  wickBottom: number;
  bullish: boolean;
};

export type VolumeBar = { index: number; x: number; y: number; width: number; height: number; bullish: boolean };

export type CandleGeometry = {
  candles: CandleShape[];
  volume: VolumeBar[];
  /** Bars left out because a price was missing. */
  skipped: number;
};

/**
 * Wick high→low, body open→close. Up (close ≥ open) is bullish. A bar with
 * any missing price is skipped, never guessed. Volume, when present, is drawn
 * as a strip `volumeHeight` tall at the bottom of the box.
 */
export function buildCandleGeometry(
  candles: StockCandle[],
  domain: PriceDomain,
  box: ChartBox,
  volumeHeight = 0
): CandleGeometry {
  const count = candles.length;
  const slot = innerWidth(box) / Math.max(1, count);
  const bodyWidth = Math.max(1, Math.min(slot * 0.7, 14));
  const shapes: CandleShape[] = [];
  let skipped = 0;
  candles.forEach((candle, index) => {
    if (!isCompleteCandle(candle)) {
      skipped += 1;
      return;
    }
    const x = xForSlot(index, count, box);
    const top = yForPrice(Math.max(candle.o, candle.c), domain, box);
    const bottom = yForPrice(Math.min(candle.o, candle.c), domain, box);
    shapes.push({
      index,
      x,
      bodyX: x - bodyWidth / 2,
      bodyY: top,
      bodyWidth,
      bodyHeight: Math.max(1, bottom - top),
      wickTop: yForPrice(candle.h, domain, box),
      wickBottom: yForPrice(candle.l, domain, box),
      bullish: candle.c >= candle.o,
    });
  });

  const volume: VolumeBar[] = [];
  const maxVolume = Math.max(0, ...candles.map((candle) => candle.v ?? 0));
  if (volumeHeight > 0 && maxVolume > 0) {
    const base = box.height - box.padBottom;
    candles.forEach((candle, index) => {
      if (!candle.v) return;
      const height = Math.max(1, (candle.v / maxVolume) * volumeHeight);
      const x = xForSlot(index, count, box);
      volume.push({
        index,
        x: x - bodyWidth / 2,
        y: base - height,
        width: bodyWidth,
        height,
        bullish: candle.c != null && candle.o != null ? candle.c >= candle.o : true,
      });
    });
  }
  return { candles: shapes, volume, skipped };
}

/** `count` evenly spaced price gridlines, top to bottom. */
export function priceTicks(domain: PriceDomain, count = 4): number[] {
  if (count < 2) return [domain.max];
  const step = (domain.max - domain.min) / (count - 1);
  return Array.from({ length: count }, (_, i) => domain.max - step * i);
}

/** Up to `count` evenly spread bar indices for x-axis labels. */
export function timeTickIndices(length: number, count = 4): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < count; i += 1) out.add(Math.round((i * (length - 1)) / (count - 1)));
  return [...out];
}

export type ChartViewState = "loading" | "ready" | "stale" | "empty" | "error";

/**
 * What the chart card shows.
 * - Data on hand always wins: a failed refresh keeps the last good chart and
 *   only flags it stale. So does a copy the server marked stale.
 * - With no data: loading, then error, else genuinely empty.
 */
export function chartViewState(input: {
  hasData: boolean;
  isLoading: boolean;
  isError: boolean;
  serverStale?: boolean;
}): ChartViewState {
  if (input.hasData) return input.isError || input.serverStale ? "stale" : "ready";
  if (input.isLoading) return "loading";
  if (input.isError) return "error";
  return "empty";
}

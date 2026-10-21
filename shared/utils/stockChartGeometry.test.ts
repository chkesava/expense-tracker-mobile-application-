import { describe, expect, it } from "vitest";

import type { StockCandle } from "../types/market";
import {
  aggregateCandles,
  buildCandleGeometry,
  buildLineGeometry,
  chartViewState,
  indexAtX,
  priceDomain,
  priceTicks,
  timeTickIndices,
  yForPrice,
  type ChartBox,
} from "./stockChartGeometry";

const box: ChartBox = { width: 110, height: 110, padTop: 5, padBottom: 5, padLeft: 5, padRight: 5 };

function bar(t: number, o: number | null, h: number | null, l: number | null, c: number | null, v: number | null = 10): StockCandle {
  return { t, o, h, l, c, v };
}

describe("aggregateCandles", () => {
  it("leaves short series alone", () => {
    const candles = [bar(0, 1, 2, 0.5, 1.5)];
    expect(aggregateCandles(candles, 5)).toBe(candles);
  });

  it("merges into genuine OHLC: first open, max high, min low, last close, summed volume", () => {
    const merged = aggregateCandles(
      [bar(0, 10, 12, 9, 11, 5), bar(1, 11, 15, 10, 14, 7), bar(2, 14, 14, 8, 9, null), bar(3, 9, 10, 9, 10, 1)],
      2
    );
    expect(merged).toEqual([bar(0, 10, 15, 9, 14, 12), bar(2, 14, 14, 8, 10, 1)]);
  });

  it("skips nulls inside a bucket instead of inventing values", () => {
    const merged = aggregateCandles([bar(0, null, null, null, 5, null), bar(1, 6, 7, 4, null, null)], 1);
    expect(merged).toEqual([bar(0, 6, 7, 4, 5, null)]);
  });
});

describe("priceDomain", () => {
  it("uses highs and lows for candles and closes for lines, with headroom", () => {
    const candles = [bar(0, 10, 20, 5, 15), bar(1, 15, 18, 12, 16)];
    const candle = priceDomain(candles, "candle")!;
    expect(candle.min).toBeLessThan(5);
    expect(candle.max).toBeGreaterThan(20);
    const line = priceDomain(candles, "line")!;
    expect(line.min).toBeGreaterThan(14);
    expect(line.max).toBeLessThan(17);
  });

  it("includes the baseline, avoids zero height, and is null without data", () => {
    expect(priceDomain([bar(0, 1, 1, 1, 10)], "line", 20)!.max).toBeGreaterThan(20);
    const flat = priceDomain([bar(0, 10, 10, 10, 10)], "line")!;
    expect(flat.max).toBeGreaterThan(flat.min);
    expect(priceDomain([bar(0, null, null, null, 5)], "candle")).toBeNull();
    expect(priceDomain([], "line")).toBeNull();
  });
});

describe("buildLineGeometry", () => {
  it("spaces points by index and maps the top of the domain to the top pad", () => {
    const domain = { min: 0, max: 100 };
    const geo = buildLineGeometry([bar(0, 1, 1, 1, 100), bar(1, 1, 1, 1, 50), bar(2, 1, 1, 1, 0)], domain, box);
    expect(geo.points.map((p) => [p.x, p.y])).toEqual([
      [5, 5],
      [55, 55],
      [105, 105],
    ]);
    expect(geo.segments).toHaveLength(1);
    expect(geo.areas[0]).toMatch(/Z$/);
  });

  it("breaks the line at a missing close rather than joining across it", () => {
    const geo = buildLineGeometry(
      [bar(0, 1, 1, 1, 10), bar(1, 1, 1, 1, 11), bar(2, null, null, null, null), bar(3, 1, 1, 1, 12)],
      { min: 0, max: 20 },
      box
    );
    expect(geo.segments).toHaveLength(2);
    expect(geo.points.map((p) => p.index)).toEqual([0, 1, 3]);
  });
});

describe("buildCandleGeometry", () => {
  const domain = { min: 0, max: 100 };

  it("draws bullish and bearish candles from real OHLC", () => {
    const geo = buildCandleGeometry([bar(0, 40, 80, 20, 60), bar(1, 60, 70, 30, 40)], domain, box);
    const [up, down] = geo.candles;
    expect(up.bullish).toBe(true);
    expect(down.bullish).toBe(false);
    expect(up.wickTop).toBe(yForPrice(80, domain, box));
    expect(up.wickBottom).toBe(yForPrice(20, domain, box));
    expect(up.bodyY).toBe(yForPrice(60, domain, box));
    expect(up.bodyHeight).toBeCloseTo(yForPrice(40, domain, box) - yForPrice(60, domain, box));
    expect(down.bodyY).toBe(yForPrice(60, domain, box));
  });

  it("skips bars with any missing price and keeps a doji visible", () => {
    const geo = buildCandleGeometry([bar(0, 50, 60, 40, 50), bar(1, null, 60, 40, 50), bar(2, 50, 60, 40, null)], domain, box);
    expect(geo.candles).toHaveLength(1);
    expect(geo.skipped).toBe(2);
    expect(geo.candles[0].bodyHeight).toBe(1);
    expect(geo.candles[0].bullish).toBe(true);
  });

  it("scales volume bars to the strip and omits empty volume", () => {
    const geo = buildCandleGeometry([bar(0, 1, 2, 1, 2, 100), bar(1, 2, 2, 1, 1, 50), bar(2, 1, 2, 1, 2, null)], domain, box, 20);
    expect(geo.volume.map((v) => v.height)).toEqual([20, 10]);
    expect(geo.volume[0].y).toBe(105 - 20);
    expect(buildCandleGeometry([bar(0, 1, 2, 1, 2, null)], domain, box, 20).volume).toEqual([]);
  });
});

describe("ticks and touch", () => {
  it("spreads price and time ticks evenly", () => {
    expect(priceTicks({ min: 0, max: 30 }, 4)).toEqual([30, 20, 10, 0]);
    expect(timeTickIndices(100, 4)).toEqual([0, 33, 66, 99]);
    expect(timeTickIndices(2, 4)).toEqual([0, 1]);
    expect(timeTickIndices(0)).toEqual([]);
  });

  it("finds the bar under a touch, clamped to the chart", () => {
    expect(indexAtX(55, 3, box, "line")).toBe(1);
    expect(indexAtX(-50, 3, box, "line")).toBe(0);
    expect(indexAtX(500, 3, box, "line")).toBe(2);
    expect(indexAtX(104, 10, box, "candle")).toBe(9);
  });
});

describe("chartViewState", () => {
  it("covers loading, ready, stale, empty and error", () => {
    expect(chartViewState({ hasData: false, isLoading: true, isError: false })).toBe("loading");
    expect(chartViewState({ hasData: true, isLoading: false, isError: false })).toBe("ready");
    // A failed refresh keeps the last good chart.
    expect(chartViewState({ hasData: true, isLoading: false, isError: true })).toBe("stale");
    expect(chartViewState({ hasData: true, isLoading: false, isError: false, serverStale: true })).toBe("stale");
    expect(chartViewState({ hasData: false, isLoading: false, isError: true })).toBe("error");
    expect(chartViewState({ hasData: false, isLoading: false, isError: false })).toBe("empty");
  });
});

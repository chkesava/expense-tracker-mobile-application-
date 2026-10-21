import { describe, expect, it } from "vitest";

import type { StockCandle } from "../types/market";
import { aggregateCandles, indexAtX, type ChartBox } from "./stockChartGeometry";
import {
  NO_SELECTION,
  activeIndexFor,
  aggregationBucketSize,
  chartSelectionReducer,
  chartSeriesKey,
  formatInspectedTime,
  formatQuotePrice,
  formatVolume,
  inspectPoint,
  inspectedMarkerPrice,
  inspectedPointLabel,
  nearestInspectableIndex,
  stepInspectableIndex,
  tooltipPosition,
  type ChartSelection,
} from "./stockChartInspect";

const IST = 19_800;
/** 2026-10-16 09:15 IST, in ms. */
const T0 = Date.UTC(2026, 9, 16, 3, 45);
const MIN5 = 5 * 60 * 1000;

function bar(i: number, c: number | null, extra: Partial<StockCandle> = {}): StockCandle {
  return {
    t: T0 + i * MIN5,
    o: c == null ? null : c - 1,
    h: c == null ? null : c + 2,
    l: c == null ? null : c - 3,
    c,
    v: c == null ? null : 1000 + i,
    ...extra,
  };
}

const series = (closes: (number | null)[]) => closes.map((c, i) => bar(i, c));

describe("aggregationBucketSize", () => {
  it("matches aggregateCandles' buckets", () => {
    const raw = series(Array.from({ length: 1000 }, (_, i) => 100 + i));
    for (const maxBars of [1, 7, 300, 999, 1000, 1200]) {
      const size = aggregationBucketSize(raw.length, maxBars);
      const drawn = aggregateCandles(raw, maxBars);
      expect(drawn.length).toBe(Math.ceil(raw.length / size));
      drawn.forEach((d, i) => expect(d.t).toBe(raw[i * size].t));
    }
  });

  it("is 1 when nothing is merged", () => {
    expect(aggregationBucketSize(75, 300)).toBe(1);
    expect(aggregationBucketSize(75, 0)).toBe(1);
  });
});

describe("nearest-point selection", () => {
  const box: ChartBox = { width: 300, height: 200, padTop: 10, padBottom: 22, padLeft: 2, padRight: 58 };

  it("resolves the bar under the pointer", () => {
    const drawn = series([10, 11, 12, 13, 14]);
    const at = indexAtX(122, drawn.length, box, "line");
    expect(nearestInspectableIndex(drawn, "line", at)).toBe(2);
  });

  it("skips missing closes to the nearest valid bar, earlier on a tie", () => {
    const drawn = series([10, null, null, 13, null]);
    expect(nearestInspectableIndex(drawn, "line", 1)).toBe(0);
    expect(nearestInspectableIndex(drawn, "line", 2)).toBe(3);
    expect(nearestInspectableIndex(drawn, "line", 4)).toBe(3);
  });

  it("needs every price for a candle", () => {
    const drawn = [bar(0, 10), bar(1, 11, { h: null }), bar(2, 12)];
    expect(nearestInspectableIndex(drawn, "candle", 1)).toBe(0);
    expect(nearestInspectableIndex(drawn, "line", 1)).toBe(1);
  });

  it("returns null for empty, all-missing or malformed input", () => {
    expect(nearestInspectableIndex([], "line", 0)).toBeNull();
    expect(nearestInspectableIndex(series([null, null]), "line", 0)).toBeNull();
    expect(nearestInspectableIndex(series([1, 2]), "line", Number.NaN)).toBeNull();
    expect(nearestInspectableIndex([bar(0, Number.NaN)], "line", 0)).toBeNull();
    expect(nearestInspectableIndex([bar(0, 5, { o: Number.POSITIVE_INFINITY })], "candle", 0)).toBeNull();
  });

  it("clamps an out-of-range index", () => {
    const drawn = series([1, 2, 3]);
    expect(nearestInspectableIndex(drawn, "line", -4)).toBe(0);
    expect(nearestInspectableIndex(drawn, "line", 99)).toBe(2);
  });
});

describe("keyboard stepping", () => {
  const drawn = series([null, 1, 2, null, 4, null]);

  it("starts on the latest bar", () => {
    expect(stepInspectableIndex(drawn, "line", null, "next")).toBe(4);
  });

  it("moves between valid bars and stops at the ends", () => {
    expect(stepInspectableIndex(drawn, "line", 2, "next")).toBe(4);
    expect(stepInspectableIndex(drawn, "line", 4, "next")).toBe(4);
    expect(stepInspectableIndex(drawn, "line", 4, "prev")).toBe(2);
    expect(stepInspectableIndex(drawn, "line", 1, "prev")).toBe(1);
    expect(stepInspectableIndex(drawn, "line", 2, "first")).toBe(1);
    expect(stepInspectableIndex(drawn, "line", 2, "last")).toBe(4);
  });

  it("is null with nothing to select", () => {
    expect(stepInspectableIndex(series([null]), "line", null, "next")).toBeNull();
  });
});

describe("inspectPoint", () => {
  it("line: the exact close and its own bar time, unmerged", () => {
    const raw = series([100.05, 101.4, 99.95]);
    expect(inspectPoint(raw, raw, 1, "line", 1)).toEqual({ kind: "line", index: 1, price: 101.4, t: raw[1].t });
  });

  it("line: a merged vertex is labelled with the raw bar its close came from", () => {
    const raw = series([10, 11, 12, null, 14, 15, 16, null]);
    const size = 4;
    const drawn = aggregateCandles(raw, 2);
    expect(aggregationBucketSize(raw.length, 2)).toBe(size);
    // Bucket 0 is raw 0-3; raw 3 has no close, so the drawn close is raw 2's.
    const first = inspectPoint(raw, drawn, size, "line", 0);
    expect(first).toEqual({ kind: "line", index: 0, price: 12, t: raw[2].t });
    expect(drawn[0].c).toBe(12);
    // Bucket 1 is raw 4-7; the drawn close is raw 6's, not the bucket start's.
    const second = inspectPoint(raw, drawn, size, "line", 1);
    expect(second).toEqual({ kind: "line", index: 1, price: 16, t: raw[6].t });
  });

  it("candle: the genuine OHLC and volume of one bar", () => {
    const raw = series([100, 105]);
    expect(inspectPoint(raw, raw, 1, "candle", 1)).toEqual({
      kind: "candle",
      index: 1,
      o: 104,
      h: 107,
      l: 102,
      c: 105,
      v: 1001,
      startT: raw[1].t,
      endT: raw[1].t,
      bars: 1,
    });
  });

  it("candle: a merged candle keeps its bucket's OHLC and reports its time span", () => {
    const raw = series([10, 12, 9, 11]);
    const drawn = aggregateCandles(raw, 2);
    const point = inspectPoint(raw, drawn, 2, "candle", 1);
    expect(point).toEqual({
      kind: "candle",
      index: 1,
      o: 8, // raw 2's open
      h: 13, // max(11, 13)
      l: 6, // min(6, 8)
      c: 11, // raw 3's close
      v: 1002 + 1003,
      startT: raw[2].t,
      endT: raw[3].t,
      bars: 2,
    });
  });

  it("candle: no volume is null, never 0", () => {
    const raw = [bar(0, 10, { v: null }), bar(1, 11, { v: 0 })];
    expect(inspectPoint(raw, raw, 1, "candle", 0)).toMatchObject({ v: null });
    expect(inspectPoint(raw, raw, 1, "candle", 1)).toMatchObject({ v: null });
  });

  it("never returns values for a missing or invalid bar", () => {
    const raw = series([10, null]);
    expect(inspectPoint(raw, raw, 1, "line", 1)).toBeNull();
    expect(inspectPoint(raw, raw, 1, "line", 5)).toBeNull();
    expect(inspectPoint(raw, raw, 1, "line", null)).toBeNull();
    expect(inspectPoint([], [], 1, "candle", 0)).toBeNull();
  });

  it("puts the marker on the close", () => {
    const raw = series([10, 11]);
    expect(inspectedMarkerPrice(inspectPoint(raw, raw, 1, "line", 1)!)).toBe(11);
    expect(inspectedMarkerPrice(inspectPoint(raw, raw, 1, "candle", 1)!)).toBe(11);
  });
});

describe("formatting", () => {
  it("shows prices with the source's precision", () => {
    expect(formatQuotePrice(1480, "INR")).toBe("₹1,480.00");
    expect(formatQuotePrice(1480.05, "INR")).toBe("₹1,480.05");
    expect(formatQuotePrice(1480.0500000001, "INR")).toBe("₹1,480.05");
    expect(formatQuotePrice(12.3456, "INR")).toBe("₹12.3456");
    expect(formatQuotePrice(12.345, "INR")).toBe("₹12.345");
    expect(formatQuotePrice(123456.7, "INR")).toBe("₹1,23,456.70");
  });

  it("masks prices in ghost mode and never prints NaN", () => {
    expect(formatQuotePrice(1480, "INR", true)).toBe("••••••");
    expect(formatQuotePrice(Number.NaN, "INR")).toBe("—");
    expect(formatVolume(Number.NaN)).toBe("—");
  });

  it("groups volume the Indian way", () => {
    expect(formatVolume(1234567)).toBe("12,34,567");
  });

  it("labels times in exchange time (IST) per range", () => {
    const raw = series([10, 11, 12]);
    const line = inspectPoint(raw, raw, 1, "line", 0)!;
    expect(formatInspectedTime(line, "1D", IST)).toBe("16 Oct 2026, 09:15");
    expect(formatInspectedTime(line, "1Y", IST)).toBe("16 Oct 2026");
    const merged = inspectPoint(raw, aggregateCandles(raw, 1), 3, "candle", 0)!;
    expect(formatInspectedTime(merged, "1D", IST)).toBe("16 Oct 2026, 09:15 – 16 Oct 2026, 09:25");
  });

  it("speaks one short sentence", () => {
    const raw = series([10]);
    const fmt = (n: number) => `₹${n}`;
    expect(inspectedPointLabel(inspectPoint(raw, raw, 1, "line", 0)!, "16 Oct", fmt)).toBe("16 Oct: ₹10");
    expect(inspectedPointLabel(inspectPoint(raw, raw, 1, "candle", 0)!, "16 Oct", fmt, "1,000")).toBe(
      "16 Oct: open ₹9, high ₹12, low ₹7, close ₹10, volume 1,000"
    );
  });
});

describe("tooltipPosition", () => {
  const area = { tipWidth: 120, tipHeight: 60, areaWidth: 400, areaHeight: 220 };

  it("sits to the right of the point, centred on it", () => {
    expect(tooltipPosition({ ...area, pointX: 100, pointY: 110 })).toEqual({ left: 112, top: 80, side: "right" });
  });

  it("flips left near the right edge so the point stays visible", () => {
    expect(tooltipPosition({ ...area, pointX: 350, pointY: 110 })).toEqual({ left: 218, top: 80, side: "left" });
  });

  it("is clamped inside the area at every edge", () => {
    for (const pointX of [0, 5, 200, 395, 400]) {
      for (const pointY of [0, 10, 110, 215, 220]) {
        const { left, top } = tooltipPosition({ ...area, pointX, pointY });
        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + area.tipWidth).toBeLessThanOrEqual(area.areaWidth);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(top + area.tipHeight).toBeLessThanOrEqual(area.areaHeight);
      }
    }
  });

  it("stays at 0 when the tooltip is wider than a narrow plot", () => {
    expect(tooltipPosition({ ...area, areaWidth: 100, pointX: 50, pointY: 50 }).left).toBe(0);
  });
});

describe("chartSelectionReducer", () => {
  const key = "INFY|1D|line|75|a|b|";
  const run = (events: Parameters<typeof chartSelectionReducer>[1][], from: ChartSelection = NO_SELECTION) =>
    events.reduce(chartSelectionReducer, from);

  it("pointer enter/move/leave: follows the pointer, then clears", () => {
    let s = run([{ type: "hover", index: 3, seriesKey: key }]);
    expect(activeIndexFor(s, key)).toBe(3);
    s = chartSelectionReducer(s, { type: "hover", index: 7, seriesKey: key });
    expect(activeIndexFor(s, key)).toBe(7);
    s = chartSelectionReducer(s, { type: "leave" });
    expect(activeIndexFor(s, key)).toBeNull();
  });

  it("touch: the selection persists after the finger lifts", () => {
    const s = run([
      { type: "press", index: 2, seriesKey: key },
      { type: "press", index: 5, seriesKey: key },
      { type: "release" },
    ]);
    expect(activeIndexFor(s, key)).toBe(5);
    expect(s.source).toBe("touch");
  });

  it("touch: a new tap replaces the selection; dismiss clears it", () => {
    let s = run([{ type: "press", index: 2, seriesKey: key }, { type: "release" }]);
    s = run([{ type: "press", index: 9, seriesKey: key }, { type: "release" }], s);
    expect(activeIndexFor(s, key)).toBe(9);
    s = chartSelectionReducer(s, { type: "dismiss" });
    expect(s).toEqual(NO_SELECTION);
  });

  it("a stray hover does not steal a held touch selection", () => {
    const s = run([{ type: "press", index: 4, seriesKey: key }, { type: "release" }, { type: "hover", index: 1, seriesKey: key }]);
    expect(activeIndexFor(s, key)).toBe(4);
  });

  it("a mouse leave fired around a touch does not clear the touch selection", () => {
    // Browsers and hybrid devices emit mouse pointerleave next to a tap.
    const s = run([{ type: "press", index: 4, seriesKey: key, pointer: "touch" }, { type: "release" }, { type: "leave" }]);
    expect(activeIndexFor(s, key)).toBe(4);
  });

  it("a mouse click behaves like hover: it follows the pointer and ends on leave", () => {
    let s = run([{ type: "press", index: 3, seriesKey: key, pointer: "mouse" }, { type: "release" }]);
    expect(activeIndexFor(s, key)).toBe(3);
    expect(s.source).toBe("hover");
    s = chartSelectionReducer(s, { type: "hover", index: 8, seriesKey: key });
    expect(activeIndexFor(s, key)).toBe(8);
    s = chartSelectionReducer(s, { type: "leave" });
    expect(activeIndexFor(s, key)).toBeNull();
  });

  it("keyboard selections survive the pointer leaving; Escape clears", () => {
    let s = run([{ type: "key", index: 6, seriesKey: key }, { type: "leave" }]);
    expect(activeIndexFor(s, key)).toBe(6);
    s = chartSelectionReducer(s, { type: "dismiss" });
    expect(activeIndexFor(s, key)).toBeNull();
  });

  it("ignores events that resolve to no bar", () => {
    const s = run([{ type: "press", index: 4, seriesKey: key }, { type: "press", index: null, seriesKey: key }]);
    expect(activeIndexFor(s, key)).toBe(4);
  });

  it("range or chart-type switches never show a stale selection", () => {
    const raw = series([10, 11, 12]);
    const lineKey = chartSeriesKey({ symbol: "INFY", range: "1D", mode: "line", drawn: raw });
    const candleKey = chartSeriesKey({ symbol: "INFY", range: "1D", mode: "candle", drawn: raw });
    const weekKey = chartSeriesKey({ symbol: "INFY", range: "1W", mode: "line", drawn: raw });
    const refreshedKey = chartSeriesKey({ symbol: "INFY", range: "1D", mode: "line", drawn: raw, asOf: "later" });
    const s = run([{ type: "press", index: 2, seriesKey: lineKey }]);
    expect(activeIndexFor(s, lineKey)).toBe(2);
    expect(activeIndexFor(s, candleKey)).toBeNull();
    expect(activeIndexFor(s, weekKey)).toBeNull();
    expect(activeIndexFor(s, refreshedKey)).toBeNull();
  });
});

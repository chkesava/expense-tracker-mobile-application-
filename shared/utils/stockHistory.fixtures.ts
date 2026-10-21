/** Test fixtures for the stock history normaliser and function (SPENDLY-558). */

/** A Yahoo v8 chart body with `n` bars `stepSec` apart. */
export function yahooChart(
  n: number,
  {
    startSec = 1_760_586_300, // 2025-10-16 09:15 IST
    stepSec = 300,
    meta = {},
    close = (i: number) => 100 + i,
  }: {
    startSec?: number;
    stepSec?: number;
    meta?: Record<string, unknown>;
    close?: (i: number) => number | null;
  } = {}
) {
  const timestamp = Array.from({ length: n }, (_, i) => startSec + i * stepSec);
  const closes = timestamp.map((_, i) => close(i));
  return {
    chart: {
      result: [
        {
          meta: {
            symbol: "KPITTECH.NS",
            longName: "KPIT Technologies Limited",
            currency: "INR",
            exchangeTimezoneName: "Asia/Kolkata",
            gmtoffset: 19800,
            dataGranularity: "5m",
            regularMarketPrice: 200,
            regularMarketTime: startSec + n * stepSec,
            chartPreviousClose: 99,
            ...meta,
          },
          timestamp,
          indicators: {
            quote: [
              {
                open: closes.map((c) => (c == null ? null : c - 0.5)),
                high: closes.map((c) => (c == null ? null : c + 1)),
                low: closes.map((c) => (c == null ? null : c - 1)),
                close: closes,
                volume: closes.map((c) => (c == null ? null : 1000)),
              },
            ],
          },
        },
      ],
      error: null,
    },
  };
}

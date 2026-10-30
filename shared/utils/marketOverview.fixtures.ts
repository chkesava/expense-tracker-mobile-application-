/**
 * Yahoo v8 chart payloads for the benchmark indices (SPENDLY-642).
 * Shapes and values are from a live probe on 2026-10-30, a trading day.
 * Test-only: never imported by app or function code.
 */

/** 2026-10-30 09:15 IST and 15:30 IST, in epoch seconds. */
export const SESSION_START_SEC = 1793331900;
export const SESSION_END_SEC = 1793354400;

const BASE: Record<string, Record<string, unknown>> = {
  "^NSEI": {
    symbol: "^NSEI",
    longName: "NIFTY 50",
    exchangeName: "NSI",
    instrumentType: "INDEX",
    regularMarketPrice: 23053.1,
    chartPreviousClose: 22698.8,
    regularMarketDayHigh: 23118.1,
    regularMarketDayLow: 22905.1,
  },
  "^BSESN": {
    symbol: "^BSESN",
    longName: "S&P BSE SENSEX",
    exchangeName: "BSE",
    instrumentType: "INDEX",
    regularMarketPrice: 74459.53,
    chartPreviousClose: 73246,
    regularMarketDayHigh: 74742.59,
    regularMarketDayLow: 74082.03,
  },
  "^NSEBANK": {
    symbol: "^NSEBANK",
    longName: "NIFTY BANK",
    exchangeName: "NSI",
    instrumentType: "INDEX",
    regularMarketPrice: 54686.95,
    chartPreviousClose: 54267.4,
    regularMarketDayHigh: 55068.5,
    regularMarketDayLow: 54580.75,
  },
};

export type IndexChartOptions = {
  tradeSec?: number;
  sessionStartSec?: number;
  sessionEndSec?: number;
  meta?: Record<string, unknown>;
};

/** A chart payload for one index. `tradeSec` defaults to just after the close, as Yahoo reports it. */
export function indexChart(symbol: string, opts: IndexChartOptions = {}) {
  const tradeSec = opts.tradeSec ?? SESSION_END_SEC + 71;
  const start = opts.sessionStartSec ?? SESSION_START_SEC;
  const end = opts.sessionEndSec ?? SESSION_END_SEC;
  return {
    chart: {
      result: [
        {
          meta: {
            currency: "INR",
            exchangeTimezoneName: "Asia/Kolkata",
            gmtoffset: 19800,
            ...BASE[symbol],
            regularMarketTime: tradeSec,
            currentTradingPeriod: {
              pre: { start, end: start },
              regular: { start, end },
              post: { start: end, end },
            },
            ...opts.meta,
          },
          timestamp: [tradeSec],
          indicators: { quote: [{}] },
        },
      ],
      error: null,
    },
  };
}

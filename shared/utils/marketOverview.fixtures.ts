/**
 * Yahoo v8 chart payloads for the benchmark indices (SPENDLY-642).
 * Shapes and values are from a live probe on 2026-10-30, a trading day.
 * Test-only: never imported by app or function code.
 */

/**
 * The real 5-day daily closes (Mon 26 – Fri 30 Oct 2026) and their bar times
 * (09:15 IST). `chartPreviousClose` in BASE below is the **stale** value Yahoo
 * returned on 30 Oct (two sessions old) — kept so tests prove it is ignored
 * (SPENDLY-659).
 */
export const DAILY_BAR_SEC = [1792986300, 1793072700, 1793159100, 1793245500, 1793331900];
export const DAILY_CLOSES: Record<string, number[]> = {
  "^NSEI": [22753.19921875, 22749.75, 22698.849609375, 22936.75, 23053.099609375],
  "^BSESN": [74500, 74300, 73246, 74151.04, 74459.53],
  "^NSEBANK": [54300, 54400, 54267.4, 54909.65, 54686.95],
};

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
  /** Daily closes for the 5-day series; null for none. Defaults to the real 26–30 Oct closes. */
  daily?: (number | null)[] | null;
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
          timestamp: opts.daily === null ? [] : DAILY_BAR_SEC.slice(-(opts.daily ?? DAILY_CLOSES[symbol] ?? []).length),
          indicators: { quote: [{ close: opts.daily === null ? [] : (opts.daily ?? DAILY_CLOSES[symbol] ?? []) }] },
        },
      ],
      error: null,
    },
  };
}

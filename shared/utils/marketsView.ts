/**
 * What the Markets tab shows, as plain data (SPENDLY-622, story SPENDLY-645).
 *
 * The components only draw this. Every state decision — loading, offline,
 * delayed, unavailable, empty — is made here, so it is covered by tests in a
 * repo that does not render components under test.
 *
 * Index levels are points, not money: they are shown without a currency
 * symbol even though the provider reports INR. Stock prices are rupees.
 */

import type { IndexQuoteDTO, MarketOverviewDTO, MarketState, MoverDTO, MoversUnavailableReason } from "../types/market";
import { formatQuotePrice } from "./stockChartInspect";
import { classifyFreshness, formatIstTime, freshnessLabel, marketStateAt } from "./marketOverview";

export type Direction = "up" | "down" | "flat";

export type IndexView = {
  symbol: string;
  name: string;
  /** "23,053.10" — points, no currency. */
  value: string;
  /** "+354.30" */
  change: string;
  /** "+1.56%" */
  changePercent: string;
  direction: Direction;
  /** "22,905.10 – 23,118.10", or null when the provider gave no range. */
  dayRange: string | null;
  /** "15:31 IST" or "29 Oct, 15:31 IST". */
  asOf: string;
  accessibilityLabel: string;
};

export type MoverView = {
  symbol: string;
  /** "RELIANCE" — the NSE ticker without Yahoo's suffix. */
  ticker: string;
  name: string;
  /** "₹1,164.90" */
  price: string;
  /** "-0.21%" */
  changePercent: string;
  direction: Direction;
  accessibilityLabel: string;
};

export type BannerView = { tone: "warning" | "error" | "info"; text: string; retry: boolean };

export type MarketsView =
  /** First load with nothing saved on the device. */
  | { kind: "loading" }
  /** Nothing to show and the load failed, or the device is offline. */
  | { kind: "empty"; title: string; description: string; retry: boolean }
  | {
      kind: "ready";
      status: { state: MarketState; label: string };
      banner: BannerView | null;
      /** Dims figures that are a day or more old. */
      dimmed: boolean;
      refreshing: boolean;
      indices: { kind: "list"; items: IndexView[] } | { kind: "unavailable"; text: string };
      movers:
        | { kind: "lists"; caption: string; asOf: string; gainers: MoverView[]; losers: MoverView[] }
        | { kind: "unavailable"; title: string; text: string };
    };

export type MarketsViewInput = {
  /** `undefined` until something has loaded; `null` when no market API is configured. */
  data: MarketOverviewDTO | null | undefined;
  /** A request is in flight. */
  isFetching: boolean;
  isOffline: boolean;
  /** Copy for the last failed load, or null. */
  errorMessage: string | null;
  nowMs: number;
};

const POINTS = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function direction(value: number): Direction {
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
}

function signed(text: string, dir: Direction): string {
  return dir === "up" ? `+${text}` : dir === "down" ? `-${text}` : text;
}

export function formatPoints(value: number): string {
  return Number.isFinite(value) ? POINTS.format(value) : "—";
}

/** "+354.30" / "-12.05" / "0.00". */
export function formatSignedPoints(value: number): string {
  return signed(formatPoints(Math.abs(value)), direction(value));
}

/** "+1.56%" / "-0.21%" / "0.00%", always two decimals. */
export function formatSignedPct(value: number): string {
  return signed(`${Math.abs(value).toFixed(2)}%`, direction(value));
}

const SPOKEN: Record<Direction, string> = { up: "up", down: "down", flat: "unchanged" };

export function indexView(quote: IndexQuoteDTO, nowMs: number): IndexView {
  const dir = direction(quote.change);
  const dayRange =
    quote.dayLow != null && quote.dayHigh != null ? `${formatPoints(quote.dayLow)} – ${formatPoints(quote.dayHigh)}` : null;
  const asOf = formatIstTime(quote.asOf, nowMs);
  const value = formatPoints(quote.price);
  const move = dir === "flat" ? "unchanged" : `${SPOKEN[dir]} ${formatPoints(Math.abs(quote.change))} points, ${Math.abs(quote.changePercent).toFixed(2)} percent`;
  return {
    symbol: quote.symbol,
    name: quote.name,
    value,
    change: formatSignedPoints(quote.change),
    changePercent: formatSignedPct(quote.changePercent),
    direction: dir,
    dayRange,
    asOf,
    accessibilityLabel: `${quote.name} ${value}, ${move}, as of ${asOf}`,
  };
}

export function moverView(mover: MoverDTO): MoverView {
  const dir = direction(mover.changePercent);
  const price = formatQuotePrice(mover.price, mover.currency);
  const ticker = mover.symbol.replace(/\.(NS|BO)$/, "");
  return {
    symbol: mover.symbol,
    ticker,
    name: mover.name,
    price,
    changePercent: formatSignedPct(mover.changePercent),
    direction: dir,
    accessibilityLabel: `${mover.name}, ${price}, ${SPOKEN[dir]} ${Math.abs(mover.changePercent).toFixed(2)} percent`,
  };
}

const MOVERS_UNAVAILABLE: Record<MoversUnavailableReason, string> = {
  LOW_COVERAGE: "Too few NIFTY 50 prices came back to rank gainers and losers fairly. They'll show when more prices are in.",
  UPSTREAM: "The price provider didn't return enough NIFTY 50 prices. Gainers and losers will show when it does.",
  DISABLED: "Gainers and losers aren't available yet.",
};

function banner(input: MarketsViewInput, data: MarketOverviewDTO): BannerView | null {
  if (input.isOffline) return { tone: "info", text: "You're offline. Showing the last prices saved on this device.", retry: false };
  const freshness = classifyFreshness(data, input.nowMs);
  if (input.errorMessage) return { tone: "error", text: `${input.errorMessage} Showing saved prices.`, retry: true };
  if (freshness === "expired") return { tone: "warning", text: "These prices are more than a day old.", retry: true };
  if (data.stale) return { tone: "warning", text: "The price provider is unavailable. These are the last prices we received.", retry: true };
  return null;
}

export function marketsView(input: MarketsViewInput): MarketsView {
  const { data, nowMs } = input;
  if (!data) {
    if (input.isOffline) {
      return {
        kind: "empty",
        title: "You're offline",
        description: "Market prices will load when you're back online.",
        retry: false,
      };
    }
    if (input.errorMessage) {
      return { kind: "empty", title: "Market data unavailable", description: input.errorMessage, retry: true };
    }
    // `undefined`: nothing loaded yet. `null`: the app has no market API configured.
    if (data === undefined) return { kind: "loading" };
    return {
      kind: "empty",
      title: "Market data unavailable",
      description: "Market data isn't set up for this build yet.",
      retry: true,
    };
  }

  const freshness = classifyFreshness(data, nowMs);
  const movers = data.movers;
  return {
    kind: "ready",
    status: { state: marketStateAt(data.status, nowMs), label: freshnessLabel(data, nowMs, { offline: input.isOffline }) },
    banner: banner(input, data),
    dimmed: freshness === "expired",
    refreshing: input.isFetching,
    indices:
      data.indices.length > 0
        ? { kind: "list", items: data.indices.map((q) => indexView(q, nowMs)) }
        : { kind: "unavailable", text: "Index levels aren't available right now." },
    movers: movers.available
      ? {
          kind: "lists",
          caption: "Among NIFTY 50 stocks",
          asOf: formatIstTime(movers.asOf, nowMs),
          gainers: movers.gainers.map(moverView),
          losers: movers.losers.map(moverView),
        }
      : { kind: "unavailable", title: "Gainers and losers unavailable", text: MOVERS_UNAVAILABLE[movers.reason] },
  };
}

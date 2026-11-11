import { roundMoney } from "@/shared/utils/money";
import { csvField, csvNumber, csvRow, joinCsvLines } from "@/shared/utils/csv";
import type {
  Broker,
  Holding,
  InstrumentType,
  OrderStatus,
  PortfolioTransaction,
  TransactionType,
} from "../types";
import { tradeFees } from "./tradeCharges";

export type PortfolioHistoryTypeFilter = "all" | "BUY" | "SELL" | "other";

export type PortfolioHistoryInstrumentFilter = "all" | InstrumentType;

export type PortfolioHistorySort =
  | "date_desc"
  | "date_asc"
  | "amount_desc"
  | "amount_asc";

export type PortfolioHistoryPeriod = "all" | "this_month" | "custom";

export type PortfolioHistoryRange = { from?: string; to?: string };

export interface PortfolioHistoryFilterOptions {
  query?: string;
  type?: PortfolioHistoryTypeFilter;
  instrument?: PortfolioHistoryInstrumentFilter;
  period?: PortfolioHistoryPeriod;
  range?: PortfolioHistoryRange;
  sort?: PortfolioHistorySort;
  today?: string;
}

export interface PortfolioHistoryItem {
  id: string;
  date: string;
  symbol: string;
  name: string;
  type: TransactionType;
  instrumentType: InstrumentType;
  quantity: number;
  price: number;
  fees: number;
  gross: number;
  net: number;
  broker?: Broker;
  notes?: string;
  orderStatus: OrderStatus;
  createdAt?: unknown;
  raw: PortfolioTransaction;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves instrument display metadata (name, instrumentType) using current holdings
 * with a resilient fallback for positions that have been completely sold or deleted.
 */
export function resolveTransactionMetadata(
  tx: Pick<PortfolioTransaction, "holdingId" | "profileId" | "symbol">,
  holdings: ReadonlyArray<Holding>
): { name: string; instrumentType: InstrumentType } {
  const normSymbol = (tx.symbol || "").trim().toUpperCase();

  // 1. Direct match by holding ID
  let match = holdings.find((h) => h.id === tx.holdingId);

  // 2. Match by profile ID
  if (!match && tx.profileId) {
    match = holdings.find((h) => h.profileId === tx.profileId);
  }

  // 3. Match by normalized symbol
  if (!match && normSymbol) {
    match = holdings.find((h) => (h.symbol || "").trim().toUpperCase() === normSymbol);
  }

  if (match) {
    return {
      name: match.name || tx.symbol || "",
      instrumentType: match.instrumentType || "stock",
    };
  }

  // Fallback heuristics when instrument is deleted or not found
  let instrumentType: InstrumentType = "stock";
  if (normSymbol) {
    if (
      normSymbol.includes("GOLD") ||
      normSymbol.endsWith("GOLDBEES") ||
      normSymbol.startsWith("GOLDBEES")
    ) {
      instrumentType = "gold";
    } else if (
      normSymbol.endsWith("BEES") ||
      normSymbol.includes("ETF") ||
      normSymbol.endsWith("BEES.NS")
    ) {
      instrumentType = "etf";
    } else if (["BTC", "ETH", "USDT", "SOL"].some((c) => normSymbol.includes(c))) {
      instrumentType = "crypto";
    }
  }

  return {
    name: tx.symbol || "",
    instrumentType,
  };
}

/**
 * Pure selector that applies search, type, instrument, date-range filtering,
 * and deterministic sorting to the transaction ledger.
 */
export function filterAndSortPortfolioHistory(
  transactions: ReadonlyArray<PortfolioTransaction>,
  holdings: ReadonlyArray<Holding>,
  options: PortfolioHistoryFilterOptions = {}
): PortfolioHistoryItem[] {
  const {
    query = "",
    type = "all",
    instrument = "all",
    period = "all",
    range,
    sort = "date_desc",
    today = "",
  } = options;

  const normalizedQuery = query.trim().toLowerCase();

  // Resolve date boundaries
  let fromBound: string | undefined;
  let toBound: string | undefined;

  if (period === "this_month" && today) {
    const month = today.slice(0, 7);
    fromBound = `${month}-01`;
    toBound = `${month}-31`;
  } else if (period === "custom" && range) {
    if (range.from && DATE_KEY.test(range.from)) fromBound = range.from;
    if (range.to && DATE_KEY.test(range.to)) toBound = range.to;
  }

  const items: PortfolioHistoryItem[] = [];

  for (const tx of transactions) {
    // Exclude cancelled and pending orders by default
    if (tx.orderStatus === "cancelled" || tx.orderStatus === "pending") {
      continue;
    }

    // Type filter
    if (type === "BUY" && tx.type !== "BUY") continue;
    if (type === "SELL" && tx.type !== "SELL") continue;
    if (type === "other" && (tx.type === "BUY" || tx.type === "SELL")) continue;

    // Date range filter
    const txDate = tx.date || "";
    if (fromBound && txDate < fromBound) continue;
    if (toBound && txDate > toBound) continue;

    // Metadata resolution
    const meta = resolveTransactionMetadata(tx, holdings);

    // Instrument filter
    if (instrument !== "all" && meta.instrumentType !== instrument) {
      continue;
    }

    // Search query matching symbol or instrument name
    if (normalizedQuery) {
      const matchSymbol = (tx.symbol || "").toLowerCase().includes(normalizedQuery);
      const matchName = meta.name.toLowerCase().includes(normalizedQuery);
      if (!matchSymbol && !matchName) continue;
    }

    const qty = Number(tx.quantity) || 0;
    const price = Number(tx.price) || 0;
    const gross = roundMoney(qty * price);
    const fees = tradeFees(tx);
    const net =
      tx.type === "BUY"
        ? roundMoney(gross + fees)
        : tx.type === "SELL"
          ? roundMoney(gross - fees)
          : gross;

    items.push({
      id: tx.id,
      date: txDate,
      symbol: tx.symbol || "",
      name: meta.name,
      type: tx.type,
      instrumentType: meta.instrumentType,
      quantity: qty,
      price,
      fees,
      gross,
      net,
      broker: tx.broker,
      notes: tx.notes,
      orderStatus: tx.orderStatus,
      createdAt: tx.createdAt,
      raw: tx,
    });
  }

  // Sorting with deterministic tie-breaking
  items.sort((a, b) => {
    switch (sort) {
      case "date_asc": {
        const cmp = a.date.localeCompare(b.date);
        if (cmp !== 0) return cmp;
        const createdCmp = String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
        return createdCmp !== 0 ? createdCmp : a.id.localeCompare(b.id);
      }
      case "amount_desc": {
        const diff = b.gross - a.gross;
        if (Math.abs(diff) > 0.0001) return diff;
        const dateCmp = b.date.localeCompare(a.date);
        return dateCmp !== 0 ? dateCmp : b.id.localeCompare(a.id);
      }
      case "amount_asc": {
        const diff = a.gross - b.gross;
        if (Math.abs(diff) > 0.0001) return diff;
        const dateCmp = b.date.localeCompare(a.date);
        return dateCmp !== 0 ? dateCmp : a.id.localeCompare(b.id);
      }
      case "date_desc":
      default: {
        const cmp = b.date.localeCompare(a.date);
        if (cmp !== 0) return cmp;
        const createdCmp = String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
        return createdCmp !== 0 ? createdCmp : b.id.localeCompare(a.id);
      }
    }
  });

  return items;
}

/**
 * Formats a transaction quantity for UI presentation.
 * Returns integer representation if whole, or up to 4 decimal places.
 */
export function formatHistoryQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

/**
 * Generates an RFC-4180 compliant CSV string representing the given history items.
 * Guaranteed formula-injection safe via `csvField` and `csvNumber`.
 */
export function generatePortfolioHistoryCsv(
  items: ReadonlyArray<PortfolioHistoryItem>,
  currency = "INR"
): string {
  const headers = [
    "Date",
    "Symbol",
    "Name",
    "Type",
    "Instrument",
    "Quantity",
    "Price",
    "Gross Value",
    "Fees",
    "Net Amount",
    "Currency",
    "Broker",
    "Notes",
    "Status",
    "ID",
  ];

  const rows = items.map((item) =>
    csvRow([
      item.date,
      item.symbol,
      item.name,
      item.type,
      item.instrumentType,
      csvNumber(item.quantity),
      csvNumber(item.price),
      csvNumber(item.gross),
      csvNumber(item.fees),
      csvNumber(item.net),
      currency,
      item.broker ?? "",
      item.notes ?? "",
      item.orderStatus,
      item.id,
    ])
  );

  return joinCsvLines([csvRow(headers), ...rows]);
}

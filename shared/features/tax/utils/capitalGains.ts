/**
 * SPENDLY-293 — capital-gain rows for one financial year: from the user's
 * Spendly trades (first-in-first-out lots) and from rows or broker-statement
 * totals they add. Source values and calculated fields are kept apart:
 *
 *   source:     asset, quantity, bought on, sold on, cost, sale value, charges
 *   calculated: days held, short/long term (with the rule used), gain
 *
 * Rules
 * - Lots: per instrument (portfolio profile + symbol), executed BUY rows in
 *   date order; a SELL consumes the oldest lots first. A BUY's charges are part
 *   of its cost; a SELL's charges are its transfer expenses, shared across the
 *   lots it consumes.
 * - Missing history is never filled in: a sale that runs past the recorded
 *   buys has an unknown cost, and so does a sale after a SPLIT, BONUS or
 *   ADJUSTMENT row (their effect on cost isn't traceable here). Unknown cost →
 *   unknown gain.
 * - Same-day buy and sell is flagged: intraday trading is not a capital gain.
 * - Term: by the holding-period rule in force on the sale date
 *   (`data/capitalGainRules.ts`); debt-fund units bought from 1 April 2023 are
 *   short-term (s.50AA); virtual digital assets are unsupported.
 * - Rows from trades are calculated, so they don't count until the user
 *   confirms the sale (the portfolio may hold practice trades). A broker
 *   statement total for an asset class replaces Spendly's rows of that class.
 */

import { roundMoney } from "@/shared/utils/money";
import type { Holding, PortfolioTransaction } from "@/shared/features/portfolio/types";
import {
  GRANDFATHERING_ACQUIRED_BEFORE,
  holdingPeriodRuleFor,
  SPECIFIED_FUND_DEEMED_SHORT_FROM,
} from "../data/capitalGainRules";
import { TAX_ASSET_CLASSES } from "../types";
import type { FinancialYearKey, TaxAssetClass, TaxCgTerm, TaxEntry, TaxEntryOf, TaxReview, TaxReviewDecision } from "../types";
import { taxReviewDocId } from "./ids";
import { isDateInFinancialYear } from "./taxYear";

export const TAX_CG_ENGINE_VERSION = 1;

export type CgTerm = TaxCgTerm | "unsupported" | "unknown";

export type CgAttention =
  /** No recorded buy covers this sale (or a part of it). */
  | "cost_missing"
  /** A split, bonus or adjustment came before the sale; its cost isn't traceable. */
  | "adjusted"
  /** Spendly guessed the asset class (a mutual fund may be debt, an unknown holding). */
  | "check_asset_class"
  /** Listed equity bought before 1 Feb 2018: its 31 Jan 2018 value may set the cost. */
  | "grandfathering"
  /** Bought and sold the same day: intraday trading isn't a capital gain. */
  | "intraday";

export interface CapitalGainRow {
  key: string;
  fy: FinancialYearKey;
  origin: "calculated" | "user_entered";
  /** The sale this row comes from: a portfolio SELL, or the user's entry. */
  saleRef: { kind: "portfolio_transaction" | "tax_entry"; id: string };
  assetClass: TaxAssetClass;
  assetName: string;
  isin?: string;
  // Source values
  quantity: number | null;
  acquiredDate: string | null;
  soldDate: string;
  cost: number | null;
  saleValue: number;
  transferExpenses: number;
  // Calculated
  holdingDays: number | null;
  term: CgTerm;
  ruleId: string | null;
  gain: number | null;
  attention: CgAttention[];
  /** Counted toward the year's totals. */
  included: boolean;
  /** The user's stored decision about this sale, if any. */
  decision: TaxReviewDecision | null;
  /** Why it isn't counted, or why it needs a look. */
  status: "counted" | "confirm_to_count" | "left_out" | "replaced_by_statement" | "check_again";
}

const DAY_MS = 86_400_000;

export function isTaxAssetClass(value: unknown): value is TaxAssetClass {
  return typeof value === "string" && (TAX_ASSET_CLASSES as readonly string[]).includes(value);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / DAY_MS);
}

/** `date` + `months`, calendar-aware ("2024-01-31" + 1 → "2024-02-29"). */
export function addMonths(date: string, months: number): string {
  const y = +date.slice(0, 4);
  const m = +date.slice(5, 7) - 1 + months;
  const d = +date.slice(8, 10);
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Short- or long-term for one lot, by the rule in force on the sale date. */
export function classifyHolding(
  assetClass: TaxAssetClass,
  acquiredDate: string | null,
  soldDate: string
): { term: CgTerm; ruleId: string | null } {
  const rule = holdingPeriodRuleFor(soldDate);
  if (!rule) return { term: "unknown", ruleId: null };
  const months = rule.months[assetClass];
  if (months === null) return { term: "unsupported", ruleId: rule.id };
  if (!acquiredDate) return { term: "unknown", ruleId: rule.id };
  if (assetClass === "debt_mutual_fund" && acquiredDate >= SPECIFIED_FUND_DEEMED_SHORT_FROM) {
    return { term: "short_term", ruleId: "s50AA-specified-fund" };
  }
  // Long-term only when held for MORE than the threshold.
  return { term: soldDate > addMonths(acquiredDate, months) ? "long_term" : "short_term", ruleId: rule.id };
}

/** Spendly's instrument type → tax asset class; `guessed` when it can't be sure. */
export function assetClassOfHolding(holding: Pick<Holding, "instrumentType"> | undefined): { assetClass: TaxAssetClass; guessed: boolean } {
  switch (holding?.instrumentType) {
    case "stock":
    case "etf":
      return { assetClass: "listed_equity", guessed: false };
    case "mutual_fund":
      // Could be a debt fund: the user should check.
      return { assetClass: "equity_mutual_fund", guessed: true };
    case "gold":
      return { assetClass: "gold", guessed: false };
    case "crypto":
      return { assetClass: "virtual_digital_asset", guessed: false };
    default:
      return { assetClass: "listed_equity", guessed: true };
  }
}

type Lot = { date: string; quantity: number; unitCost: number; buyId: string };
type Sale = {
  sellId: string;
  instrument: string;
  symbol: string;
  holdingId: string;
  date: string;
  pieces: { lot: Lot | null; quantity: number }[];
  quantity: number;
  price: number;
  fees: number;
  adjusted: boolean;
  intraday: boolean;
};

function executed(tx: PortfolioTransaction): boolean {
  return (tx.orderStatus ?? "executed") === "executed";
}

const TYPE_ORDER: Record<string, number> = { BUY: 0, BONUS: 1, SPLIT: 1, ADJUSTMENT: 1, SELL: 2, DIVIDEND: 3 };

/** Walk every instrument's history once and return each SELL with the lots it consumed. */
export function matchSales(transactions: readonly PortfolioTransaction[]): Sale[] {
  const byInstrument = new Map<string, PortfolioTransaction[]>();
  for (const tx of transactions) {
    if (!executed(tx) || !tx.date || !tx.symbol) continue;
    const key = `${tx.profileId ?? "default"}|${tx.symbol.toUpperCase()}`;
    const list = byInstrument.get(key);
    if (list) list.push(tx);
    else byInstrument.set(key, [tx]);
  }
  const sales: Sale[] = [];
  for (const [instrument, list] of byInstrument) {
    list.sort((a, b) => a.date.localeCompare(b.date) || (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || a.id.localeCompare(b.id));
    const lots: Lot[] = [];
    let adjusted = false;
    for (const tx of list) {
      const quantity = Number(tx.quantity) || 0;
      if (tx.type === "BUY" && quantity > 0) {
        const cost = quantity * (Number(tx.price) || 0) + (Number(tx.fees) || 0);
        lots.push({ date: tx.date, quantity, unitCost: cost / quantity, buyId: tx.id });
      } else if (tx.type === "SPLIT" || tx.type === "BONUS" || tx.type === "ADJUSTMENT") {
        adjusted = true;
      } else if (tx.type === "SELL" && quantity > 0) {
        const pieces: Sale["pieces"] = [];
        let left = quantity;
        while (left > 1e-9 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(lot.quantity, left);
          pieces.push({ lot: { ...lot }, quantity: take });
          lot.quantity -= take;
          left -= take;
          if (lot.quantity <= 1e-9) lots.shift();
        }
        if (left > 1e-9) pieces.push({ lot: null, quantity: left });
        sales.push({
          sellId: tx.id,
          instrument,
          symbol: tx.symbol,
          holdingId: tx.holdingId,
          date: tx.date,
          pieces,
          quantity,
          price: Number(tx.price) || 0,
          fees: Number(tx.fees) || 0,
          adjusted,
          intraday: pieces.some((p) => p.lot?.date === tx.date),
        });
      }
    }
  }
  return sales;
}

/** One sale's rows: one per lot it consumed, plus one for any part no buy covers. */
export function saleRows(
  sale: Sale,
  fy: FinancialYearKey,
  holding: Pick<Holding, "instrumentType" | "name"> | undefined,
  assetClassOverride?: TaxAssetClass
): CapitalGainRow[] {
  const guess = assetClassOfHolding(holding);
  const assetClass = assetClassOverride ?? guess.assetClass;
  return sale.pieces.map((piece, i) => {
    const share = piece.quantity / sale.quantity;
    const saleValue = roundMoney(piece.quantity * sale.price);
    const transferExpenses = roundMoney(sale.fees * share);
    const known = piece.lot !== null && !sale.adjusted;
    const cost = known && piece.lot ? roundMoney(piece.quantity * piece.lot.unitCost) : null;
    const acquiredDate = piece.lot?.date ?? null;
    const { term, ruleId } = classifyHolding(assetClass, acquiredDate, sale.date);
    const attention: CgAttention[] = [];
    if (!piece.lot) attention.push("cost_missing");
    if (sale.adjusted) attention.push("adjusted");
    if (guess.guessed && !assetClassOverride) attention.push("check_asset_class");
    if (assetClass === "listed_equity" && acquiredDate && acquiredDate < GRANDFATHERING_ACQUIRED_BEFORE) attention.push("grandfathering");
    if (piece.lot?.date === sale.date) attention.push("intraday");
    return {
      key: `${sale.sellId}:${i}`,
      fy,
      origin: "calculated",
      saleRef: { kind: "portfolio_transaction", id: sale.sellId },
      assetClass,
      assetName: holding?.name || sale.symbol,
      quantity: roundQuantity(piece.quantity),
      acquiredDate,
      soldDate: sale.date,
      cost,
      saleValue,
      transferExpenses,
      holdingDays: acquiredDate ? daysBetween(acquiredDate, sale.date) : null,
      term,
      ruleId,
      gain: cost === null ? null : roundMoney(saleValue - cost - transferExpenses),
      attention,
      included: false,
      decision: null,
      status: "confirm_to_count",
    };
  });
}

function roundQuantity(q: number): number {
  return Math.round(q * 1e8) / 1e8;
}

/** A row the user entered (a single sale). */
export function entrySaleRow(entry: TaxEntryOf<"capital_gain">): CapitalGainRow {
  const f = entry.fields;
  const { term, ruleId } = classifyHolding(f.assetClass, f.acquiredDate ?? null, f.soldDate);
  const transferExpenses = f.transferExpenses ?? 0;
  const attention: CgAttention[] = [];
  if (f.costOfAcquisition === null) attention.push("cost_missing");
  if (f.assetClass === "listed_equity" && f.acquiredDate && f.acquiredDate < GRANDFATHERING_ACQUIRED_BEFORE) attention.push("grandfathering");
  return {
    key: `tax_entry:${entry.id}`,
    fy: entry.fy,
    origin: "user_entered",
    saleRef: { kind: "tax_entry", id: entry.id },
    assetClass: f.assetClass,
    assetName: f.assetName,
    ...(f.isin ? { isin: f.isin } : {}),
    quantity: f.quantity ?? null,
    acquiredDate: f.acquiredDate ?? null,
    soldDate: f.soldDate,
    cost: f.costOfAcquisition,
    saleValue: f.saleValue,
    transferExpenses,
    holdingDays: f.acquiredDate ? daysBetween(f.acquiredDate, f.soldDate) : null,
    term,
    ruleId,
    gain: f.costOfAcquisition === null ? null : roundMoney(f.saleValue - f.costOfAcquisition - transferExpenses),
    attention,
    included: true,
    decision: null,
    status: "counted",
  };
}

export interface CgTotals {
  saleValue: number;
  /** `null` when any counted row's cost is unknown. */
  cost: number | null;
  gain: number | null;
  rows: number;
}

export interface CgClassSummary {
  assetClass: TaxAssetClass;
  /** Broker-statement totals the user entered for this class; when present they replace Spendly's rows. */
  statementTotals: TaxEntryOf<"capital_gain">[];
  rows: CapitalGainRow[];
  byTerm: Record<CgTerm, CgTotals>;
}

export interface TaxCapitalGainsSummary {
  fy: FinancialYearKey;
  classes: CgClassSummary[];
  /** Sales Spendly found that wait for the user to confirm them. */
  toConfirm: number;
  /** Counted rows whose cost is unknown. */
  missingCost: number;
}

function emptyTotals(): CgTotals {
  return { saleValue: 0, cost: 0, gain: 0, rows: 0 };
}

function addTo(t: CgTotals, saleValue: number, cost: number | null, gain: number | null): void {
  t.saleValue = roundMoney(t.saleValue + saleValue);
  t.cost = t.cost === null || cost === null ? null : roundMoney(t.cost + cost);
  t.gain = t.gain === null || gain === null ? null : roundMoney(t.gain + gain);
  t.rows += 1;
}

export function assembleCapitalGains(args: {
  fy: FinancialYearKey;
  transactions: readonly PortfolioTransaction[];
  holdings: readonly Pick<Holding, "id" | "symbol" | "instrumentType" | "name">[];
  entries: readonly TaxEntry[];
  reviews: readonly TaxReview[];
}): TaxCapitalGainsSummary {
  const { fy } = args;
  const reviewById = new Map(args.reviews.filter((r) => r.fy === fy).map((r) => [r.id, r]));
  const holdingOf = (sale: Sale) =>
    args.holdings.find((h) => h.id === sale.holdingId) ?? args.holdings.find((h) => h.symbol?.toUpperCase() === sale.symbol.toUpperCase());

  const live = args.entries.filter((e): e is TaxEntryOf<"capital_gain"> => e.fy === fy && !e.deletedAt && e.kind === "capital_gain");
  const statementClasses = new Set(live.filter((e) => e.fields.mode === "statement_total").map((e) => e.fields.assetClass));

  const rows: CapitalGainRow[] = [];
  for (const sale of matchSales(args.transactions)) {
    if (!isDateInFinancialYear(sale.date, fy)) continue;
    const review = reviewById.get(taxReviewDocId(fy, { kind: "portfolio_transaction", id: sale.sellId }));
    const override = review?.decision === "recategorize" && isTaxAssetClass(review.category) ? review.category : undefined;
    for (const derived of saleRows(sale, fy, holdingOf(sale), override)) {
      const row = { ...derived, decision: review?.decision ?? null };
      if (statementClasses.has(row.assetClass)) {
        rows.push({ ...row, included: false, status: "replaced_by_statement" });
        continue;
      }
      const saleValue = roundMoney(sale.quantity * sale.price);
      const changed = review && review.sourceAmount !== null && Math.abs(review.sourceAmount - saleValue) >= 0.005;
      if (!review || changed) {
        rows.push({ ...row, status: changed ? "check_again" : "confirm_to_count" });
      } else if (review.decision === "exclude") {
        rows.push({ ...row, status: "left_out" });
      } else {
        rows.push({ ...row, included: true, status: "counted" });
      }
    }
  }
  for (const entry of live) if (entry.fields.mode === "row") rows.push(entrySaleRow(entry));

  const classes = [...new Set([...rows.map((r) => r.assetClass), ...statementClasses])].sort().map((assetClass) => {
    const classRows = rows.filter((r) => r.assetClass === assetClass);
    const statementTotals = live.filter((e) => e.fields.mode === "statement_total" && e.fields.assetClass === assetClass);
    const byTerm = { short_term: emptyTotals(), long_term: emptyTotals(), unsupported: emptyTotals(), unknown: emptyTotals() };
    if (statementTotals.length > 0) {
      for (const t of statementTotals) {
        const f = t.fields;
        const gain = f.costOfAcquisition === null ? null : roundMoney(f.saleValue - f.costOfAcquisition - (f.transferExpenses ?? 0));
        addTo(byTerm[f.term ?? "unknown"], f.saleValue, f.costOfAcquisition, gain);
      }
      // User-entered single sales still count beside a statement total; Spendly's don't.
      for (const r of classRows.filter((r) => r.included && r.origin === "user_entered")) addTo(byTerm[r.term], r.saleValue, r.cost, r.gain);
    } else {
      for (const r of classRows.filter((r) => r.included)) addTo(byTerm[r.term], r.saleValue, r.cost, r.gain);
    }
    return {
      assetClass,
      statementTotals,
      rows: classRows.sort((a, b) => b.soldDate.localeCompare(a.soldDate) || a.key.localeCompare(b.key)),
      byTerm,
    };
  });

  return {
    fy,
    classes,
    toConfirm: new Set(rows.filter((r) => r.status === "confirm_to_count" || r.status === "check_again").map((r) => r.saleRef.id)).size,
    missingCost: rows.filter((r) => r.included && r.cost === null).length,
  };
}

/** Gains across all asset classes, by term; `null` when any counted cost is unknown. */
export function capitalGainTotals(summary: TaxCapitalGainsSummary): Record<CgTerm, CgTotals> {
  const out = { short_term: emptyTotals(), long_term: emptyTotals(), unsupported: emptyTotals(), unknown: emptyTotals() };
  for (const c of summary.classes) {
    for (const term of Object.keys(out) as CgTerm[]) {
      const t = c.byTerm[term];
      if (t.rows === 0) continue;
      out[term].saleValue = roundMoney(out[term].saleValue + t.saleValue);
      out[term].cost = out[term].cost === null || t.cost === null ? null : roundMoney(out[term].cost + t.cost);
      out[term].gain = out[term].gain === null || t.gain === null ? null : roundMoney(out[term].gain + t.gain);
      out[term].rows += t.rows;
    }
  }
  return out;
}

/**
 * Runway sources (SPENDLY-207): every Spendly resource and obligation that
 * runway can see, classified with the SPENDLY-205 rules and the user's
 * overrides. Pure — the hook gathers the same inputs as net worth.
 *
 * Amounts reconcile with their sources: bank balances use computeBankBalance,
 * card dues computeOutstandingCredit, investments getInvestmentValuation, and
 * the stock, EPF, receivable and borrowing totals are the net-worth figures.
 * Net worth itself is not changed.
 */

import type { RunwayOverride, RunwayResource, RunwayResourceKind } from "../types/runway";
import { computeBankBalance, computeOutstandingCredit } from "./accountBalance";
import { getInvestmentValuation } from "./investmentInterest";
import { roundMoney } from "./money";
import type { NetWorthInputs } from "./netWorth";
import { classifyAccountResource, classifyResource, liquidTotal, runwayOverrideId } from "./runwayContract";

export interface RunwaySourcesInput extends NetWorthInputs {
  displayCurrency: string;
  overrides: readonly Pick<RunwayOverride, "kind" | "refId" | "included">[];
}

export interface RunwaySources {
  resources: RunwayResource[];
  /** Counted toward runway. */
  counted: RunwayResource[];
  /** Money the user has but runway doesn't count (near-liquid, restricted, unknown, owed to them). */
  notCounted: RunwayResource[];
  /** Amounts the user owes. Never resources. */
  obligations: RunwayResource[];
  liquidTotal: number;
}

const INVESTMENT_KIND: Record<string, RunwayResourceKind> = {
  fixed_deposit: "fixed_deposit",
  interest_savings: "interest_savings",
  mutual_fund: "mutual_fund",
};

export function buildRunwaySources(input: RunwaySourcesInput): RunwaySources {
  const overrideById = new Map(input.overrides.map((o) => [runwayOverrideId(o.kind, o.refId), o]));
  const ov = (kind: RunwayResourceKind, refId: string) => overrideById.get(runwayOverrideId(kind, refId)) ?? null;
  const asOf = input.today;
  const displayCurrency = input.displayCurrency;
  const resources: RunwayResource[] = [];

  for (const a of input.accounts) {
    const typeName = input.typeMap.get(a.typeId) || "";
    const probe = classifyAccountResource({ account: a, typeName, balance: 0, asOf, displayCurrency });
    if (probe.kind === "credit_card") {
      const owed = computeOutstandingCredit(a, input.expenses, input.payments, input.bills, input.today).totalOutstanding;
      resources.push({ ...probe, amount: roundMoney(owed) });
      continue;
    }
    const balance = computeBankBalance(
      a,
      input.expenses,
      input.incomes,
      input.payments,
      input.entries,
      input.transfers,
      input.borrowings,
      input.borrowingRepayments,
      input.receivables,
      input.receivableRepayments,
      input.today
    );
    resources.push(
      classifyResource({
        kind: probe.kind,
        refId: a.id,
        label: a.name,
        amount: balance,
        currency: a.currency,
        displayCurrency,
        override: ov(probe.kind, a.id),
        provenance: { source: "accounts", refId: a.id, asOf, certainty: "actual" },
      })
    );
  }

  for (const inv of input.investments) {
    if (inv.status !== "active" && inv.status !== "matured") continue;
    const kind = INVESTMENT_KIND[inv.kind];
    if (!kind) continue;
    resources.push(
      classifyResource({
        kind,
        refId: inv.id,
        label: inv.name,
        amount: getInvestmentValuation(inv, asOf).totalValue,
        displayCurrency,
        override: ov(kind, inv.id),
        // Valuations accrue interest or use the last NAV, so they are estimates.
        provenance: { source: "investments", refId: inv.id, asOf, certainty: "estimated" },
      })
    );
  }

  const aggregate = (kind: RunwayResourceKind, refId: string, label: string, amount: number, source: string, certainty: "actual" | "estimated" | "expected") => {
    if (!amount) return;
    resources.push(
      classifyResource({ kind, refId, label, amount, displayCurrency, override: ov(kind, refId), provenance: { source, refId, asOf, certainty } })
    );
  };

  aggregate("demat_cash", "portfolio", "Demat cash", input.investmentCashBalance, "portfolioCash", "actual");
  let stocks = 0;
  for (const h of input.holdings) stocks += h.quantity * (input.quotes.get(h.yahooSymbol)?.currentPrice ?? h.averageBuyPrice);
  aggregate("stocks", "holdings", "Stocks and ETFs", stocks, "holdings", "estimated");
  aggregate("epf", "epf", "EPF", input.epfValue, "epf", input.epfUnreconciledCount > 0 ? "estimated" : "actual");
  aggregate("receivable", "receivables", "Money owed to you", input.receivableOutstanding, "receivables", "expected");
  aggregate("borrowing", "borrowings", "Loans you owe", input.borrowingOutstanding, "borrowings", "actual");

  const counted = resources.filter((r) => r.included);
  const obligations = resources.filter((r) => r.liquidity === "obligation");
  const notCounted = resources.filter((r) => !r.included && r.liquidity !== "obligation");
  return { resources, counted, notCounted, obligations, liquidTotal: liquidTotal(resources) };
}

/**
 * Dashboard Cash Flow card — pure composition.
 *
 * `closing` is the one live, trustworthy balance this file is handed (the
 * month's live cash-on-hand, e.g. `useUnifiedNetWorth`'s `liquidBankAssets`).
 * There is no point-in-time ledger reconstruction in this repo to derive a
 * true historical "balance at the start of the month" independently, so
 * `opening` is derived algebraically from the figures that already are
 * trustworthy (`income`, `expenses`) rather than invented or recomputed from
 * raw rows: `opening = closing - income + expenses`.
 *
 * `transfersTotal` is shown as its own, separate line — it is never added to
 * or subtracted from `income`/`expenses`/`closing`, which is exactly the
 * "must not double-count transfers" invariant: a transfer between two tracked
 * accounts changes which account holds the money, not the total, so it can
 * never move `closing` beyond what `income`/`expenses` already reflect.
 */
import { roundMoney } from "../money";

export interface CashFlowSummary {
  opening: number;
  income: number;
  expenses: number;
  /** Informational only — never folded into income, expenses or the balances. */
  transfersTotal: number;
  closing: number;
}

export function buildCashFlowSummary(input: {
  income: number;
  expenses: number;
  transfersTotal: number;
  /** The month's live cash-on-hand (e.g. `liquidBankAssets`). */
  closing: number;
}): CashFlowSummary {
  const income = roundMoney(input.income);
  const expenses = roundMoney(input.expenses);
  const closing = roundMoney(input.closing);
  const opening = roundMoney(closing - income + expenses);
  return {
    opening,
    income,
    expenses,
    transfersTotal: roundMoney(input.transfersTotal),
    closing,
  };
}

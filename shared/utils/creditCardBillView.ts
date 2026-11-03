import type { CreditCardBill, CreditCardBillStatus } from "../types/creditCardBill";
import { isCashbackPayment, type AccountPayment } from "../types/expense";
import { computeCreditCardBillStatus } from "./creditCardBillStatus";
import type { CreditCardLedger } from "./creditCardLedger";
import { roundMoney } from "./money";

/**
 * SPENDLY-675 — what a statement shows for paid / remaining / status.
 *
 * A stored bill's `amountPaid` is written by the bill pass in
 * CreditCardBillsProvider, which only runs on first load and app focus. Until
 * it runs (a bill created by another device or the legacy cron, a cashback
 * recorded since) the stored fields lag the ledger, and the statement screen
 * and cycle history contradicted the card's Total outstanding, which already
 * comes from the ledger. Screens now read this view instead: the ledger's
 * allocation for the bill when the ledger has claimed it, the stored fields
 * otherwise (cancelled bills, bills outside the ledger's window).
 *
 * Read-only: nothing here writes, and no payment is inferred — the ledger only
 * allocates recorded payments, cashback, refunds and adjustments.
 */
export type CreditCardBillView = {
  statementAmount: number;
  /** Everything applied to the statement: payments, cashback, credits. */
  amountPaid: number;
  remainingAmount: number;
  /** The part of `amountPaid` that was provider cashback, not money paid. */
  cashbackApplied: number;
  status: CreditCardBillStatus;
  /** Ids of what settled the statement (may include synthetic movement ids). */
  paymentIds: string[];
  source: "ledger" | "stored";
};

type BillSlice = Pick<
  CreditCardBill,
  "id" | "statementAmount" | "amountPaid" | "remainingAmount" | "status" | "dueDate"
> &
  Partial<Pick<CreditCardBill, "paymentIds">>;

/**
 * Cashback's share of `paid`. Payments, refunds and adjustments are counted
 * first, so a cashback that also settled an older statement isn't claimed
 * twice (₹392.29 cashback split ₹156 / ₹236.29 shows as those two parts).
 */
function cashbackShare(paid: number, ids: string[], payments: AccountPayment[]): number {
  const linked = new Set(ids.filter(Boolean));
  if (linked.size === 0 || paid <= 0) return 0;
  let cashback = 0;
  let other = 0;
  for (const payment of payments) {
    if (!linked.has(payment.id) || payment.voidedAt) continue;
    if (isCashbackPayment(payment)) cashback += payment.amount;
    else other += payment.amount;
  }
  return roundMoney(Math.max(0, Math.min(cashback, paid - Math.min(paid, other))));
}

export function creditCardBillView(
  bill: BillSlice,
  ledger: Pick<CreditCardLedger, "statements"> | undefined,
  payments: AccountPayment[],
  today: string
): CreditCardBillView {
  const statement =
    bill.status === "CANCELLED"
      ? undefined
      : ledger?.statements.find((s) => s.billId === bill.id && !s.cancelled);

  if (!statement) {
    const paid = roundMoney(Number(bill.amountPaid) || 0);
    const ids = (bill.paymentIds ?? []).filter(Boolean);
    return {
      statementAmount: bill.statementAmount,
      amountPaid: paid,
      remainingAmount: bill.remainingAmount,
      cashbackApplied: cashbackShare(paid, ids, payments),
      status: bill.status,
      paymentIds: ids,
      source: "stored",
    };
  }

  const paid = roundMoney(statement.paid);
  const storedPaid = roundMoney(Number(bill.amountPaid) || 0);
  return {
    statementAmount: bill.statementAmount,
    amountPaid: paid,
    remainingAmount: roundMoney(statement.remaining),
    cashbackApplied: cashbackShare(paid, statement.paymentIds, payments),
    // Keep the stored date-driven status (UPCOMING / DUE_SOON / OVERDUE) when
    // the amounts agree; recompute only when the ledger moved them.
    status:
      paid === storedPaid
        ? bill.status
        : computeCreditCardBillStatus({
            today,
            dueDate: bill.dueDate,
            amountPaid: paid,
            statementAmount: bill.statementAmount,
          }),
    paymentIds: statement.paymentIds,
    source: "ledger",
  };
}

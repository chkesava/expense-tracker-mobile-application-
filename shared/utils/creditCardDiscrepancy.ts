import { CreditCardLedger, LedgerBillSlice } from "./creditCardLedger";
import type { Account, Expense } from "../types/expense";
import { isActiveLedgerRow } from "./ledgerRow";
import { roundMoney } from "./money";
import { isDateKeyInInclusiveRange } from "./billingCycle";
import { parseLocalDate } from "./dates";

export type StatementDiscrepancy = {
  billId: string;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  billedAmount: number;
  historyAmount: number;
  discrepancyAmount: number;
  status: LedgerBillSlice["status"];
};

export type CreditCardDiscrepancyReport = {
  accountId: string;
  discrepancies: StatementDiscrepancy[];
};

/**
 * Returns a report of settled statements whose billed amount 
 * disagrees with the recomputed window spend from full history.
 * 
 * Only evaluates settled (PAID) statements. An open/unpaid statement
 * might naturally differ if history changed and the bill needs 
 * recalculation (handled by SPENDLY-99).
 */
export function buildSettledStatementDiscrepancyReport(input: {
  account: Account;
  expenses: Expense[];
  bills: LedgerBillSlice[];
  ledger: CreditCardLedger;
}): CreditCardDiscrepancyReport {
  const discrepancies: StatementDiscrepancy[] = [];
  
  const cardExpenses = input.expenses.filter(
    (expense) => isActiveLedgerRow(expense) && expense.accountId === input.account.id
  );
  
  const billById = new Map(input.bills.map(b => [b.id, b]));

  for (const statement of input.ledger.statements) {
    if (!statement.billId || statement.cancelled) continue;
    
    const bill = billById.get(statement.billId);
    if (!bill) continue;

    // We only care about settled (PAID) statements for this discrepancy report.
    // Unpaid ones use the manual recalculation flow (SPENDLY-99).
    if (bill.status !== "PAID") continue;

    const windowSpend = roundMoney(
      cardExpenses
        .filter((expense) =>
          isDateKeyInInclusiveRange(
            expense.date,
            parseLocalDate(statement.periodStart),
            parseLocalDate(statement.periodEnd)
          )
        )
        .reduce((sum, expense) => sum + expense.amount, 0)
    );

    const billedAmount = Math.max(0, Number(bill.statementAmount) || 0);

    if (billedAmount !== windowSpend) {
      discrepancies.push({
        billId: statement.billId,
        statementDate: statement.statementDate,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        billedAmount,
        historyAmount: windowSpend,
        discrepancyAmount: roundMoney(billedAmount - windowSpend),
        status: bill.status
      });
    }
  }

  return {
    accountId: input.account.id,
    discrepancies
  };
}

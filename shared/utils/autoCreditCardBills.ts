import type {
  Account,
  AccountPayment,
  Expense,
} from "../types/expense";
import type {
  CreateCreditCardBillInput,
  CreditCardBill,
} from "../types/creditCardBill";
import {
  AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
  CREDIT_CARD_PAYMENT_WINDOW_DAYS,
} from "../types/creditCardBill";
import { getAccountKind } from "./accountKind";
import { roundMoney } from "./accountBalance";
import { getBillingCycleDates } from "./billingCycle";
import { billDateForMonth, parseLocalDate, shiftDateKey, toLocalDateKey } from "./dates";

const AUTO_BILL_MIN_DUE_RATE = 0.05;
const AUTO_BILL_NOTE = "Auto-created from cycle spend";

export type BuildAutoCreditCardBillDraftInput = {
  account: Account;
  typeName?: string;
  expenses: Expense[];
  payments: AccountPayment[];
  existingBills: Pick<CreditCardBill, "accountId" | "statementDate">[];
  today: string;
};

function minimumDueForStatement(statementAmount: number): number {
  return Math.min(
    statementAmount,
    roundMoney(statementAmount * AUTO_BILL_MIN_DUE_RATE)
  );
}

/**
 * Latest closed cycle for a card as of `today`: generation day through the
 * previous generation day. Spend in that window is the statement amount.
 */
export function buildAutoCreditCardBillDraft(
  input: BuildAutoCreditCardBillDraftInput
): CreateCreditCardBillInput | null {
  const { account, typeName, expenses, payments, existingBills, today } = input;
  if (getAccountKind(typeName || "") !== "credit") return null;
  if (account.billGenerationDay == null) return null;

  const billDay = account.billGenerationDay;
  if (!Number.isFinite(billDay) || billDay < 1) return null;

  const asOf = parseLocalDate(today);
  const { previousBillDate } = getBillingCycleDates(billDay, asOf);
  const cycleEnd = previousBillDate;
  const cycleStart = billDateForMonth(
    cycleEnd.getFullYear(),
    cycleEnd.getMonth() - 1,
    billDay
  );
  const statementDate = toLocalDateKey(cycleEnd);
  if (today < statementDate) return null;

  const alreadyExists = existingBills.some(
    (bill) => bill.accountId === account.id && bill.statementDate === statementDate
  );
  if (alreadyExists) return null;

  const billedAmount = roundMoney(
    expenses
      .filter((expense) => {
        if (expense.accountId !== account.id) return false;
        const date = parseLocalDate(expense.date);
        return date >= cycleStart && date < cycleEnd;
      })
      .reduce((sum, expense) => sum + expense.amount, 0)
  );

  const paidAmount = roundMoney(
    payments
      .filter((payment) => {
        if (payment.toAccountId !== account.id) return false;
        const date = parseLocalDate(payment.date);
        return date >= cycleStart && date < cycleEnd;
      })
      .reduce((sum, payment) => sum + payment.amount, 0)
  );

  const statementAmount = roundMoney(Math.max(0, billedAmount - paidAmount));
  if (statementAmount <= 0) return null;

  return {
    accountId: account.id,
    statementAmount,
    minimumDueAmount: minimumDueForStatement(statementAmount),
    statementDate,
    dueDate: shiftDateKey(statementDate, CREDIT_CARD_PAYMENT_WINDOW_DAYS),
    billingPeriodStart: toLocalDateKey(cycleStart),
    billingPeriodEnd: statementDate,
    note: AUTO_BILL_NOTE,
    reminderEnabled: true,
    reminderFrequency: AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
  };
}

export function collectAutoCreditCardBillDrafts(input: {
  accounts: Account[];
  typeNameById: Map<string, string>;
  expenses: Expense[];
  payments: AccountPayment[];
  existingBills: Pick<CreditCardBill, "accountId" | "statementDate">[];
  today: string;
}): CreateCreditCardBillInput[] {
  const drafts: CreateCreditCardBillInput[] = [];
  const seen = new Set(
    input.existingBills.map((bill) => `${bill.accountId}:${bill.statementDate}`)
  );

  for (const account of input.accounts) {
    const draft = buildAutoCreditCardBillDraft({
      account,
      typeName: input.typeNameById.get(account.typeId) || "",
      expenses: input.expenses,
      payments: input.payments,
      existingBills: input.existingBills,
      today: input.today,
    });
    if (!draft) continue;
    const key = `${draft.accountId}:${draft.statementDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push(draft);
  }

  return drafts;
}

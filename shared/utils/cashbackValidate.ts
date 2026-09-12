import type {
  Account,
  AccountPayment,
  AccountType,
  CashbackKind,
  Expense,
} from "../types/expense";
import { isCashbackPayment } from "../types/expense";
import { getAccountKind } from "./accountKind";
import { isValidDateKey } from "./dates";
import { roundMoney } from "./money";
import { resolveAccountTypeName } from "./creditCardBillValidate";

export type CashbackValidationResult = { ok: true } | { ok: false; error: string };

/** Money comparisons are rounded first so 0.1 + 0.2 never fails a limit. */
const EPSILON = 0.005;

export type CashbackInput = {
  cardId: string;
  amount: number;
  date: string;
  kind: CashbackKind;
  linkedExpenseId?: string;
};

export type CashbackContext = {
  accounts: Account[];
  accountTypes: AccountType[];
  /** Expenses on the card, used to validate a linked purchase. */
  expenses: Expense[];
  /** Every credit already recorded against this card, voided rows included. */
  payments: AccountPayment[];
  /** What the card owes right now, from `computeOutstandingCredit`. */
  totalOutstanding: number;
};

/** Cashback must land on a credit card — a bank account has no liability. */
export function validateCashbackAccount(
  cardId: string,
  accounts: Account[],
  accountTypes: AccountType[]
): CashbackValidationResult {
  if (!cardId.trim()) {
    return { ok: false, error: "Select the credit card the cashback was credited to" };
  }
  const account = accounts.find((a) => a.id === cardId);
  if (!account) {
    return { ok: false, error: "Credit card account not found" };
  }
  if (getAccountKind(resolveAccountTypeName(account, accountTypes)) !== "credit") {
    return {
      ok: false,
      error: "Cashback must be recorded against a Credit Card account",
    };
  }
  return { ok: true };
}

/**
 * Cashback already recorded against one purchase, ignoring voided rows and
 * optionally one record being edited.
 */
export function cashbackAppliedToExpense(
  expenseId: string,
  payments: AccountPayment[],
  excludePaymentId?: string
): number {
  return roundMoney(
    payments
      .filter(
        (payment) =>
          isCashbackPayment(payment) &&
          !payment.voidedAt &&
          payment.linkedExpenseId === expenseId &&
          payment.id !== excludePaymentId
      )
      .reduce((sum, payment) => sum + payment.amount, 0)
  );
}

/**
 * Whether a cashback record can be saved.
 *
 * Two limits matter, for different reasons:
 *
 * 1. It may not exceed what the card owes. `buildCreditCardLedger` deliberately
 *    drops credit that outlives every debt, so an oversized cashback would be
 *    accepted and then silently vanish — the user would see no balance change
 *    and no error. Better to refuse it and say what is owed.
 * 2. A `statement_credit` may not exceed the purchase it is linked to, and
 *    repeated credits may not add up past it. That is what stops the same
 *    purchase being fully cashed back twice. A general `reward` is not tied to
 *    a purchase, so it is not held to the second limit.
 */
export function validateCashbackInput(
  input: CashbackInput,
  context: CashbackContext,
  excludePaymentId?: string
): CashbackValidationResult {
  const accountCheck = validateCashbackAccount(
    input.cardId,
    context.accounts,
    context.accountTypes
  );
  if (!accountCheck.ok) return accountCheck;

  if (!Number.isFinite(input.amount) || !(input.amount > 0)) {
    return { ok: false, error: "Enter a cashback amount greater than zero" };
  }
  const amount = roundMoney(input.amount);

  if (!isValidDateKey(input.date)) {
    return { ok: false, error: "Enter a valid cashback date (YYYY-MM-DD)" };
  }

  const outstanding = roundMoney(Math.max(0, context.totalOutstanding));
  if (outstanding <= 0) {
    return {
      ok: false,
      error: "This card has nothing outstanding, so there is no balance for cashback to reduce",
    };
  }
  if (amount > outstanding + EPSILON) {
    return {
      ok: false,
      error: `Cashback cannot exceed the ${outstanding.toLocaleString()} outstanding on this card`,
    };
  }

  if (input.linkedExpenseId) {
    const expense = context.expenses.find((e) => e.id === input.linkedExpenseId);
    if (!expense) {
      return { ok: false, error: "Linked purchase not found" };
    }
    if (expense.accountId !== input.cardId) {
      return {
        ok: false,
        error: "The linked purchase was not made on this credit card",
      };
    }
    if (input.kind === "statement_credit") {
      const already = cashbackAppliedToExpense(
        input.linkedExpenseId,
        context.payments,
        excludePaymentId
      );
      const purchase = roundMoney(expense.amount);
      if (already >= purchase - EPSILON) {
        return {
          ok: false,
          error: "This purchase has already been fully cashed back",
        };
      }
      if (roundMoney(already + amount) > purchase + EPSILON) {
        const room = roundMoney(purchase - already);
        return {
          ok: false,
          error: `Only ${room.toLocaleString()} of this purchase is still eligible for cashback`,
        };
      }
    }
  }

  return { ok: true };
}

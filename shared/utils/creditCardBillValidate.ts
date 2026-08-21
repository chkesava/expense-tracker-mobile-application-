import type { Account, AccountType } from "../types/expense";
import type { CreateCreditCardBillInput, CreditCardBill } from "../types/creditCardBill";
import { getAccountKind } from "./accountKind";
import { isValidDateKey } from "./dates";
import { hasCreditCardBillForStatementDate } from "./creditCardBillStatus";

export type BillValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function resolveAccountTypeName(
  account: Account | undefined,
  accountTypes: AccountType[]
): string {
  if (!account) return "";
  return accountTypes.find((t) => t.id === account.typeId)?.name || "";
}

/** Bill accountId must reference an existing credit-card account. */
export function validateCreditCardBillAccount(
  accountId: string,
  accounts: Account[],
  accountTypes: AccountType[]
): BillValidationResult {
  if (!accountId.trim()) {
    return { ok: false, error: "Credit card account is required" };
  }
  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    return { ok: false, error: "Credit card account not found" };
  }
  const typeName = resolveAccountTypeName(account, accountTypes);
  if (getAccountKind(typeName) !== "credit") {
    return {
      ok: false,
      error: "Bill must reference a Credit Card account (not Bank/Cash)",
    };
  }
  return { ok: true };
}

export function validateCreateCreditCardBillInput(
  input: CreateCreditCardBillInput,
  accounts: Account[],
  accountTypes: AccountType[],
  existingBills: Pick<
    CreditCardBill,
    "accountId" | "statementDate" | "status"
  >[] = []
): BillValidationResult {
  const accountCheck = validateCreditCardBillAccount(
    input.accountId,
    accounts,
    accountTypes
  );
  if (!accountCheck.ok) return accountCheck;

  if (
    hasCreditCardBillForStatementDate(
      existingBills,
      input.accountId,
      input.statementDate
    )
  ) {
    return {
      ok: false,
      error: "A statement bill already exists for this date",
    };
  }

  const statementAmount = Number(input.statementAmount);
  if (!Number.isFinite(statementAmount) || statementAmount <= 0) {
    return { ok: false, error: "Statement amount must be greater than zero" };
  }

  const minimumDue = Number(input.minimumDueAmount);
  if (!Number.isFinite(minimumDue) || minimumDue < 0) {
    return { ok: false, error: "Minimum due must be zero or greater" };
  }
  if (minimumDue > statementAmount) {
    return { ok: false, error: "Minimum due cannot exceed statement amount" };
  }

  if (!isValidDateKey(input.statementDate)) {
    return { ok: false, error: "Statement date must be YYYY-MM-DD" };
  }
  if (!isValidDateKey(input.dueDate)) {
    return { ok: false, error: "Due date must be YYYY-MM-DD" };
  }
  if (input.dueDate < input.statementDate) {
    return { ok: false, error: "Due date cannot be before statement date" };
  }

  if (
    input.billingPeriodStart &&
    !isValidDateKey(input.billingPeriodStart)
  ) {
    return { ok: false, error: "Billing period start must be YYYY-MM-DD" };
  }
  if (input.billingPeriodEnd && !isValidDateKey(input.billingPeriodEnd)) {
    return { ok: false, error: "Billing period end must be YYYY-MM-DD" };
  }
  if (
    input.billingPeriodStart &&
    input.billingPeriodEnd &&
    input.billingPeriodEnd < input.billingPeriodStart
  ) {
    return {
      ok: false,
      error: "Billing period end cannot be before start",
    };
  }

  return { ok: true };
}

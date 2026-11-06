import type { CreditCardBill, CreditCardBillStatus } from "../types/creditCardBill";
import { OPEN_BILL_STATUSES } from "../types/creditCardBill";
import { toLocalDateKey } from "./dates";
import { roundMoney } from "./money";

export type ComputeBillStatusInput = {
  today: string;
  dueDate: string;
  amountPaid: number;
  statementAmount: number;
  /** Inclusive window before due date treated as DUE_SOON (default 3). */
  dueSoonDays?: number;
  cancelled?: boolean;
};

/**
 * Deterministic bill status.
 * Payment states override date states (except CANCELLED).
 */
export function computeCreditCardBillStatus(
  input: ComputeBillStatusInput
): CreditCardBillStatus {
  if (input.cancelled) return "CANCELLED";

  const statement = roundMoney(Math.max(0, Number(input.statementAmount) || 0));
  const paid = roundMoney(Math.max(0, Number(input.amountPaid) || 0));
  const dueSoonDays = Math.max(0, input.dueSoonDays ?? 3);

  if (statement > 0 && paid >= statement) return "PAID";
  if (paid > 0 && paid < statement) return "PARTIALLY_PAID";

  const today = input.today;
  const due = input.dueDate;

  if (today > due) return "OVERDUE";
  if (today === due) return "DUE_TODAY";

  const daysUntil = daysBetweenDateKeys(today, due);
  if (daysUntil >= 0 && daysUntil <= dueSoonDays) return "DUE_SOON";

  return "UPCOMING";
}

/** Whole calendar days from `from` to `to` (YYYY-MM-DD). Negative if to < from. */
export function daysBetweenDateKeys(from: string, to: string): number {
  const a = parseUtcNoon(from);
  const b = parseUtcNoon(to);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function parseUtcNoon(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function computeRemainingAmount(
  statementAmount: number,
  amountPaid: number
): number {
  return roundMoney(
    Math.max(0, (Number(statementAmount) || 0) - (Number(amountPaid) || 0))
  );
}

export function earliestOpenCreditCardBill<
  T extends Pick<CreditCardBill, "accountId" | "status" | "dueDate">,
>(bills: T[], accountId: string): T | undefined {
  return bills
    .filter(
      (bill) =>
        bill.accountId === accountId && OPEN_BILL_STATUSES.includes(bill.status)
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
}

export function hasCreditCardBillForStatementDate(
  bills: Pick<CreditCardBill, "accountId" | "statementDate" | "status">[],
  accountId: string,
  statementDate: string
): boolean {
  return bills.some(
    (bill) =>
      bill.accountId === accountId &&
      bill.statementDate === statementDate &&
      bill.status !== "CANCELLED"
  );
}

export function shouldSendBillReminder(opts: {
  status: CreditCardBillStatus;
  remainingAmount: number;
  reminderEnabled: boolean;
  globalRemindersEnabled: boolean;
}): boolean {
  if (!opts.globalRemindersEnabled) return false;
  if (!opts.reminderEnabled) return false;
  if (opts.status === "PAID" || opts.status === "CANCELLED") return false;
  if (opts.remainingAmount <= 0) return false;
  return true;
}

/**
 * A stored bill as the app uses it (SPENDLY-231: shared by the app's listener
 * mapping and the server push). The stored `status` is never trusted:
 * CANCELLED is a manual override, every other status is recomputed for `today`
 * (SPENDLY-417), and `remainingAmount` falls back to statement − paid.
 */
export function parseStoredBill(id: string, raw: Record<string, unknown>, today: string): CreditCardBill {
  const data = raw as Partial<CreditCardBill>;
  const statementAmount = Number(data.statementAmount) || 0;
  const amountPaid = Number(data.amountPaid) || 0;
  return {
    ...data,
    id,
    statementAmount,
    amountPaid,
    remainingAmount:
      data.remainingAmount == null ? computeRemainingAmount(statementAmount, amountPaid) : Number(data.remainingAmount),
    paymentIds: data.paymentIds ?? [],
    status:
      data.status === "CANCELLED"
        ? "CANCELLED"
        : computeCreditCardBillStatus({ today, dueDate: data.dueDate || "", amountPaid, statementAmount }),
  } as CreditCardBill;
}

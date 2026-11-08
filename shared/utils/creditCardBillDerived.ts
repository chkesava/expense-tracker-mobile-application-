import {
  DEFAULT_CREDIT_CARD_BILL_REMINDERS,
  type CreditCardBill,
} from "../types/creditCardBill";
import { computeNextReminderAt } from "./creditCardBillReminders";
import { computeCreditCardBillStatus, computeRemainingAmount } from "./creditCardBillStatus";
import { todayDateKey } from "./dates";

/**
 * A bill's derived fields from its stored amounts and due date: remaining,
 * status (CANCELLED kept) and the next reminder date.
 *
 * SPENDLY-725: moved unchanged out of `CreditCardBillsProvider` so the
 * server-side bill job (SPENDLY-727) stamps exactly what the app's bill pass
 * stamps. Pure; no Firestore.
 */
export function refreshCreditCardBillDerivedFields(
  bill: Pick<
    CreditCardBill,
    | "dueDate"
    | "statementAmount"
    | "amountPaid"
    | "status"
    | "reminderEnabled"
    | "reminderFrequency"
    | "lastReminderSentAt"
  >,
  timezone: string,
  globalEnabled: boolean
): Pick<CreditCardBill, "status" | "remainingAmount" | "nextReminderAt"> {
  const remainingAmount = computeRemainingAmount(bill.statementAmount, bill.amountPaid);
  const status =
    bill.status === "CANCELLED"
      ? "CANCELLED"
      : computeCreditCardBillStatus({
          today: todayDateKey(timezone),
          dueDate: bill.dueDate,
          amountPaid: bill.amountPaid,
          statementAmount: bill.statementAmount,
        });
  const nextReminderAt =
    computeNextReminderAt({
      bill: {
        ...bill,
        status,
        remainingAmount,
      },
      today: todayDateKey(timezone),
      globalPrefs: {
        ...DEFAULT_CREDIT_CARD_BILL_REMINDERS,
        enabled: globalEnabled,
      },
    }) ?? undefined;
  return { status, remainingAmount, nextReminderAt };
}

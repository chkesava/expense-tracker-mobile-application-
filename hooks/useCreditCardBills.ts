import { useCreditCardBillsContext } from "@/providers/CreditCardBillsProvider";
import type { CreditCardBillStatus } from "@/shared/types/creditCardBill";
import { OPEN_BILL_STATUSES } from "@/shared/types/creditCardBill";

export function useCreditCardBills() {
  const ctx = useCreditCardBillsContext();
  return {
    bills: ctx.bills,
    loading: ctx.billsLoading,
    createBill: ctx.createBill,
    updateBill: ctx.updateBill,
    applyPaymentToBill: ctx.applyPaymentToBill,
    markBillPaid: ctx.markBillPaid,
    cancelBill: ctx.cancelBill,
    snoozeBillReminder: ctx.snoozeBillReminder,
    refreshReminderSchedules: ctx.refreshReminderSchedules,
  };
}

export function useOpenCreditCardBillsForAccount(accountId: string) {
  const { bills, loading } = useCreditCardBills();
  const open = bills.filter(
    (b) =>
      b.accountId === accountId &&
      OPEN_BILL_STATUSES.includes(b.status as CreditCardBillStatus)
  );
  return { bills: open, loading };
}

import { useEffect } from "react";
import { useCreditCardBillsContext } from "@/providers/CreditCardBillsProvider";
import type { CreditCardBillStatus } from "@/shared/types/creditCardBill";
import { OPEN_BILL_STATUSES } from "@/shared/types/creditCardBill";

export function useCreditCardBills(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const ctx = useCreditCardBillsContext();

  useEffect(() => {
    if (!enabled) return;
    return ctx.registerSubscriber?.();
  }, [enabled, ctx.registerSubscriber]);

  return {
    bills: ctx.bills,
    loading: ctx.billsLoading,
    billsLoading: ctx.billsLoading,
    createBill: ctx.createBill,
    updateBill: ctx.updateBill,
    applyPaymentToBill: ctx.applyPaymentToBill,
    recordBillPayment: ctx.recordBillPayment,
    editBillPayment: ctx.editBillPayment,
    markBillPaid: ctx.markBillPaid,
    cancelBill: ctx.cancelBill,
    /** SPENDLY-99: settled-statement correction. Preview is pure. */
    previewBillRecalculation: ctx.previewBillRecalculation,
    recalculateBill: ctx.recalculateBill,
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

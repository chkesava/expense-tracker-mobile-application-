/**
 * Bill reminder wording. Moved to shared/utils/billReminderCopy (SPENDLY-231)
 * so the server push uses exactly the same text; re-exported for existing callers.
 */
export {
  buildBillReminderCopy,
  formatCardLabel,
  maskAccountLast4,
  type BillNotificationCopy,
} from "@/shared/utils/billReminderCopy";

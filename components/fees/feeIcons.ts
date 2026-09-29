import {
  ArrowLeftRight,
  BadgePercent,
  Banknote,
  Building2,
  CalendarClock,
  CircleSlash,
  Clock,
  CreditCard,
  FileText,
  Globe,
  HandCoins,
  Landmark,
  Percent,
  Receipt,
  Scale,
  Smartphone,
  TrendingUp,
  Undo2,
  type LucideIcon,
} from "lucide-react-native";

import type { FeeRecord, FeeTypeId } from "@/shared/types/fee";

/**
 * SPENDLY-315 — icon per fee family. Kept out of shared modules, like
 * `ledgerSectionIcons`, so pure logic never imports a UI library.
 */
const TYPE_ICONS: Record<FeeTypeId, LucideIcon> = {
  atm_cash: Banknote,
  bank_service: Landmark,
  min_balance: Scale,
  debit_card: CreditCard,
  credit_card: CreditCard,
  late_payment: Clock,
  cash_advance: HandCoins,
  emi_conversion: CalendarClock,
  forex: Globe,
  payment_upi: Smartphone,
  cheque: FileText,
  transfer_remittance: ArrowLeftRight,
  investment: TrendingUp,
  loan: Building2,
  other: Receipt,
};

export function feeTypeIcon(type: FeeTypeId): LucideIcon {
  return TYPE_ICONS[type];
}

export function feeRecordIcon(record: Pick<FeeRecord, "role" | "feeType">): LucideIcon {
  switch (record.role) {
    case "tax_on_fee":
      return Percent;
    case "interest":
      return BadgePercent;
    case "reversal":
    case "refund":
      return Undo2;
    case "not_fee":
      return CircleSlash;
    default:
      return record.feeType ? TYPE_ICONS[record.feeType] : Receipt;
  }
}

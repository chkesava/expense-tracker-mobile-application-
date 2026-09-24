import type { ComponentType } from "react";
import {
  ArrowDownLeft,
  Calendar,
  CreditCard,
  History,
  Landmark,
  Repeat,
  Wallet,
} from "lucide-react-native";

import type { LedgerHubTabId } from "@/shared/config/navigation";

type SectionIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

export const LEDGER_SECTION_ICONS: Record<LedgerHubTabId, SectionIcon> = {
  expenses: History,
  accounts: Wallet,
  cards: CreditCard,
  ccBills: Calendar,
  borrowings: Landmark,
  receivables: ArrowDownLeft,
  subscriptions: Repeat,
};

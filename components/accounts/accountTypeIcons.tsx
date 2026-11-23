import {
  Banknote,
  CreditCard,
  HelpCircle,
  Landmark,
  PiggyBank,
  Wallet,
} from "lucide-react-native";
import type { ComponentType } from "react";

import type { AccountTypeCatalogIconName } from "@/shared/data/accountTypeCatalog";

type IconComponent = ComponentType<{ size?: number; color?: string }>;

const ACCOUNT_TYPE_ICONS: Record<AccountTypeCatalogIconName, IconComponent> = {
  PiggyBank,
  Landmark,
  Banknote,
  CreditCard,
  Wallet,
  HelpCircle,
};

export function getAccountTypeIcon(
  iconName: AccountTypeCatalogIconName
): IconComponent {
  return ACCOUNT_TYPE_ICONS[iconName];
}

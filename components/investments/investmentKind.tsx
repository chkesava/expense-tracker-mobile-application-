import { Banknote, Landmark, TrendingUp, type LucideIcon } from "lucide-react-native";

import type { InvestmentKind } from "@/shared/types/investment";
import { investmentKindLabel } from "@/shared/utils/investmentPresentation";
import { useTheme } from "@/theme/ThemeProvider";

/** Label, icon and theme colour for an investment kind (SPENDLY-542). */
export function useInvestmentKindStyle(kind: InvestmentKind): {
  label: string;
  color: string;
  Icon: LucideIcon;
} {
  const { theme } = useTheme();
  if (kind === "fixed_deposit") {
    return { label: investmentKindLabel(kind), color: theme.colors.info, Icon: Landmark };
  }
  if (kind === "interest_savings") {
    return { label: investmentKindLabel(kind), color: theme.colors.success, Icon: Banknote };
  }
  return { label: investmentKindLabel(kind), color: theme.colors.primary, Icon: TrendingUp };
}

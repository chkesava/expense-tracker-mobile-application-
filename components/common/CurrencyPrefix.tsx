import { Text } from "react-native";

import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { currencySymbol } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The display currency's symbol as an amount field's leading mark
 * (SPENDLY-552): `<Input leadingIcon={<CurrencyPrefix />} … />`. Follows the
 * user's display currency, so a form never shows a hardcoded ₹ or a bare code.
 */
export function CurrencyPrefix({ currency }: { currency?: string }) {
  const { theme } = useTheme();
  const displayCurrency = useDisplayCurrency();
  return (
    <Text
      style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: 16 }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {currencySymbol(currency ?? displayCurrency)}
    </Text>
  );
}

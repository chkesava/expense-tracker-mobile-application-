import { Text, type StyleProp, type TextStyle } from "react-native";

import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

export type AmountProps = {
  value: number;
  /** Defaults to INR until SystemSettings lands in Phase 2. */
  currency?: string;
  prefix?: string;
  fractionDigits?: number;
  style?: StyleProp<TextStyle>;
};

export function Amount({
  value,
  currency = "INR",
  prefix,
  fractionDigits,
  style,
}: AmountProps) {
  const { theme } = useTheme();

  return (
    <Text
      accessibilityLabel={`Amount ${value}`}
      style={[
        {
          color: theme.colors.foreground,
          fontSize: theme.typography.lg,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
        },
        style,
      ]}
    >
      {formatAmount(value, currency, { prefix, fractionDigits })}
    </Text>
  );
}

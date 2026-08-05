import { Text, type StyleProp, type TextStyle } from "react-native";
import { useSettings } from "@/providers/SettingsProvider";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

export type AmountProps = {
  value: number;
  /** Defaults to INR until SystemSettings lands in Phase 2. */
  currency?: string;
  prefix?: string;
  fractionDigits?: number;
  ghostable?: boolean;
  style?: StyleProp<TextStyle>;
};

export function Amount({
  value,
  currency = "INR",
  prefix,
  fractionDigits,
  ghostable = false,
  style,
}: AmountProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();

  const isGhosted = ghostable && settings?.ghostMode;

  return (
    <Text
      accessibilityLabel={isGhosted ? "Hidden amount" : `Amount ${value}`}
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
      {isGhosted ? "••••••" : formatAmount(value, currency, { prefix, fractionDigits })}
    </Text>
  );
}

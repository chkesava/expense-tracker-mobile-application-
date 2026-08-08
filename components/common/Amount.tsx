import { Text, type StyleProp, type TextStyle } from "react-native";
import { useSettings } from "@/providers/SettingsProvider";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { AnimatedCounter } from "./AnimatedCounter";

export type AmountProps = {
  value: number;
  /** Defaults to INR until SystemSettings lands in Phase 2. */
  currency?: string;
  prefix?: string;
  fractionDigits?: number;
  ghostable?: boolean;
  animated?: boolean;
  animationDuration?: number;
  style?: StyleProp<TextStyle>;
};

export function Amount({
  value,
  currency = "INR",
  prefix,
  fractionDigits,
  ghostable = false,
  animated = false,
  animationDuration,
  style,
}: AmountProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();

  const isGhosted = ghostable && settings?.ghostMode;

  if (isGhosted) {
    return (
      <Text
        accessibilityLabel="Hidden amount"
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
        ••••••
      </Text>
    );
  }

  if (animated) {
    return (
      <AnimatedCounter
        value={value}
        currency={currency}
        prefix={prefix}
        fractionDigits={fractionDigits}
        duration={animationDuration}
        accessibilityLabel={`Amount ${value}`}
        style={[
          {
            color: theme.colors.foreground,
            fontSize: theme.typography.lg,
            fontWeight: "700",
          },
          style,
        ]}
      />
    );
  }

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


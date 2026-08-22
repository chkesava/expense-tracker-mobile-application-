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
  startFromZero?: boolean;
  style?: StyleProp<TextStyle>;
  /** Clamp the rendered line count — keeps tight metric columns from wrapping. */
  numberOfLines?: number;
  /** Shrink the glyphs instead of wrapping when the column is narrow. */
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
};

export function Amount({
  value,
  currency,
  prefix,
  fractionDigits,
  ghostable = false,
  animated = false,
  animationDuration,
  startFromZero,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: AmountProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();

  const isGhosted = ghostable && settings?.ghostMode;
  const effectiveCurrency = currency || settings?.currency || "INR";
  const numberFormatStyle = settings?.numberFormat || "auto";

  if (isGhosted) {
    return (
      <Text
        accessibilityLabel="Hidden amount"
        numberOfLines={numberOfLines}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        minimumFontScale={minimumFontScale}
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
        currency={effectiveCurrency}
        prefix={prefix}
        fractionDigits={fractionDigits}
        duration={animationDuration}
        startFromZero={startFromZero}
        accessibilityLabel={`Amount ${value}`}
        numberOfLines={numberOfLines}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        minimumFontScale={minimumFontScale}
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
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
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
      {formatAmount(value, effectiveCurrency, {
        prefix,
        fractionDigits,
        numberFormatStyle,
      })}
    </Text>
  );
}



import { memo } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

import { Amount } from "@/components/common/Amount";
import { useSettings } from "@/providers/SettingsProvider";
import { signedCurrencyPrefix } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

/** One type scale for money on the dashboard. */
export const AMOUNT_SIZES = {
  hero: { fontSize: 38, lineHeight: 44, letterSpacing: -1 },
  xl: { fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  lg: { fontSize: 20, lineHeight: 26, letterSpacing: -0.5 },
  md: { fontSize: 16, lineHeight: 22, letterSpacing: -0.3 },
  sm: { fontSize: 14, lineHeight: 19, letterSpacing: -0.1 },
  xs: { fontSize: 12.5, lineHeight: 17, letterSpacing: 0 },
} as const;

export type AmountSize = keyof typeof AMOUNT_SIZES;

/**
 * - `none`: the value as given (a negative still shows its minus).
 * - `auto`: "+" for positive, "-" for negative, nothing for zero.
 * - `minus`: always a minus (money out / owed), for a positive magnitude.
 * - `plus`: always a plus (money in), for a positive magnitude.
 */
export type AmountSign = "none" | "auto" | "minus" | "plus";

/**
 * - `default`: ink. `muted`: secondary ink.
 * - `positive` / `negative`: fixed semantic colour.
 * - `auto`: positive green, negative red, zero ink — by the value's sign.
 *
 * Colour always rides alongside a sign or label, never instead of one.
 */
export type AmountTone = "default" | "muted" | "positive" | "negative" | "auto";

export type FinancialAmountProps = {
  value: number;
  currency: string;
  size?: AmountSize;
  sign?: AmountSign;
  tone?: AmountTone;
  weight?: "medium" | "semibold" | "bold";
  /** Count from the previous value when it changes (never from zero). */
  animated?: boolean;
  /** Shrinks to fit instead of wrapping; on by default for single-line money. */
  fit?: boolean;
  style?: StyleProp<TextStyle>;
};

/**
 * SPENDLY-533 — every dashboard amount goes through here, so sign, colour,
 * privacy (ghost mode), size and overflow behave the same everywhere. Wraps
 * the app's `Amount`; formatting stays in `shared/utils/formatCurrency`.
 */
export const FinancialAmount = memo(function FinancialAmount({
  value,
  currency,
  size = "md",
  sign = "none",
  tone = "default",
  weight = "semibold",
  animated = false,
  fit = true,
  style,
}: FinancialAmountProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const scale = AMOUNT_SIZES[size];

  let display = value;
  let prefix: string | undefined;
  if (sign === "auto") {
    display = Math.abs(value);
    prefix = value > 0 ? signedCurrencyPrefix("+", currency) : value < 0 ? signedCurrencyPrefix("-", currency) : undefined;
  } else if (sign === "minus" || sign === "plus") {
    display = Math.abs(value);
    prefix = value === 0 ? undefined : signedCurrencyPrefix(sign === "minus" ? "-" : "+", currency);
  } else if (value < 0) {
    // `prefix` replaces the symbol, so a raw negative would read "₹-500".
    display = Math.abs(value);
    prefix = signedCurrencyPrefix("-", currency);
  }

  const color =
    tone === "muted"
      ? theme.colors.mutedForeground
      : tone === "positive"
        ? theme.colors.success
        : tone === "negative"
          ? theme.colors.destructive
          : tone === "auto"
            ? value > 0
              ? theme.colors.success
              : value < 0
                ? theme.colors.destructive
                : theme.colors.foreground
            : theme.colors.foreground;

  const textStyle = [
    scale,
    { color, fontFamily: theme.fontFamily[weight], fontVariant: ["tabular-nums" as const] },
    style,
  ];

  // SPENDLY-535: `Amount` drops its prefix when amounts are hidden, which
  // would erase "money in" vs "money out". Keep the sign: "-••••••".
  if (settings?.ghostMode) {
    const signChar = prefix?.startsWith("-") ? "-" : prefix?.startsWith("+") ? "+" : "";
    return (
      <Text
        style={textStyle}
        numberOfLines={1}
        accessibilityLabel={
          signChar === "-" ? "Hidden amount, money out" : signChar === "+" ? "Hidden amount, money in" : "Hidden amount"
        }
      >
        {signChar}••••••
      </Text>
    );
  }

  return (
    <Amount
      value={display}
      currency={currency}
      prefix={prefix}
      ghostable
      animated={animated}
      startFromZero={false}
      numberOfLines={1}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.65 : undefined}
      style={textStyle}
    />
  );
});

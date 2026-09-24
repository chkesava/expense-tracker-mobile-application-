import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";

import { Amount } from "@/components/common/Amount";
import { ACCOUNT_RED } from "@/components/accounts/accountScreenTheme";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/**
 * Money that is owed, rendered so it can never be mistaken for money held
 * (SPENDLY-139).
 *
 * The Cards screen used to print outstanding and available limit side by side
 * at the same size and weight, separated only by hue. That fails in greyscale,
 * for a colour-blind reader, and in ghost mode where both collapse to the same
 * `••••••`.
 *
 * So the sign is a sibling of `Amount` rather than its `prefix`: `Amount`
 * returns early when ghosted and drops the prefix, which would have put the
 * distinction back where it started. Rendered this way the minus survives
 * ghost mode, and with the caller's own label the value is triple-coded —
 * sign, colour, and label.
 */
export function LiabilityAmount({
  value,
  currency,
  ghostable = false,
  style,
  /** Omit the sign for a zero balance — "-₹0" reads as an error, not a debt. */
  signZero = false,
}: {
  value: number;
  currency?: string;
  ghostable?: boolean;
  style?: StyleProp<TextStyle>;
  signZero?: boolean;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const owes = signZero ? value >= 0 : value > 0;
  const color = owes
    ? isDark
      ? ACCOUNT_RED
      : theme.colors.destructive
    : theme.colors.foreground;

  return (
    <View style={styles.row}>
      {owes ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[style, { color }]}
        >
          -
        </Text>
      ) : null}
      <Amount
        value={value}
        currency={currency}
        ghostable={ghostable}
        style={[style, { color }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
  },
});

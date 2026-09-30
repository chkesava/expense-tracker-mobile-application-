import { StyleSheet, Text, View } from "react-native";

import type { FeeStatus } from "@/shared/types/fee";
import { feeStatusPresentation, type FeeStatusTone } from "@/shared/utils/feeReviewForm";
import { withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Non-interactive status pill (SPENDLY-315). Each status has its own label
 * *and* colour, so "detected", "needs review", "confirmed" and "corrected"
 * stay distinguishable without relying on colour alone.
 */
export function FeeStatusBadge({ status }: { status: FeeStatus }) {
  const { theme } = useTheme();
  const { label, tone } = feeStatusPresentation(status);
  const color = toneColor(tone, theme.colors);

  return (
    <View
      style={[styles.pill, { backgroundColor: withAlpha(color, 0.14), borderRadius: theme.radius.full }]}
      accessibilityLabel={`Status: ${label}`}
    >
      <Text style={[styles.label, { color, fontFamily: theme.fontFamily.semibold }]}>{label}</Text>
    </View>
  );
}

function toneColor(
  tone: FeeStatusTone,
  colors: { primary: string; success: string; warning: string; mutedForeground: string }
): string {
  switch (tone) {
    case "primary":
      return colors.primary;
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    default:
      return colors.mutedForeground;
  }
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: 11,
    lineHeight: 15,
  },
});

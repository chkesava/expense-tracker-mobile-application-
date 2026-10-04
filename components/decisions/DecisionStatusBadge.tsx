import { StyleSheet, Text, View } from "react-native";

import type { DecisionStatus } from "@/shared/types/decision";
import { decisionStatusLabel } from "@/shared/utils/decisionModel";
import { withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/** Non-interactive status pill (SPENDLY-363). Label and colour both carry the state. */
export function DecisionStatusBadge({ status }: { status: DecisionStatus }) {
  const { theme } = useTheme();
  const color =
    status === "draft" || status === "closed" || status === "archived"
      ? theme.colors.mutedForeground
      : status === "decided" || status === "reviewed"
        ? theme.colors.success
        : theme.colors.primary;
  const label = decisionStatusLabel(status);
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(color, 0.14), borderRadius: theme.radius.full }]} accessibilityLabel={`Status: ${label}`}>
      <Text style={{ color, fontFamily: theme.fontFamily.semibold, fontSize: 11, lineHeight: 15 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" },
});

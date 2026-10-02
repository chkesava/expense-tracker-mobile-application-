import { StyleSheet, Switch, Text, View } from "react-native";
import { Lock } from "lucide-react-native";

import type { RunwayResource } from "@/shared/types/runway";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { RUNWAY_KIND_LABELS, RUNWAY_LIQUIDITY_LABELS, canToggleRunwayResource, runwayReasonText } from "@/shared/utils/runwayLabels";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One runway source (SPENDLY-207): name, kind, amount, why it is or isn't
 * counted, and a switch when the user may change it. Locked sources show a
 * lock instead of a switch so it's clear the choice isn't available.
 */
export function RunwaySourceRow({
  resource,
  currency,
  busy,
  onToggle,
}: {
  resource: RunwayResource;
  currency: string;
  busy?: boolean;
  onToggle: (resource: RunwayResource, included: boolean) => void;
}) {
  const { theme } = useTheme();
  const editable = canToggleRunwayResource(resource);
  const reason = runwayReasonText(resource);
  const amount = formatAmount(resource.amount, currency);

  return (
    <View
      style={[styles.row, { gap: theme.space.md, paddingVertical: theme.space.md, borderBottomColor: theme.colors.border }]}
      accessible={!editable}
      accessibilityLabel={editable ? undefined : `${resource.label}, ${RUNWAY_KIND_LABELS[resource.kind]}, ${amount}. ${reason}`}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
          {resource.label}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {RUNWAY_KIND_LABELS[resource.kind]} · {RUNWAY_LIQUIDITY_LABELS[resource.liquidity]}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{reason}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: theme.space.xs }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{amount}</Text>
        {editable ? (
          <Switch
            value={resource.included}
            disabled={busy}
            onValueChange={(v) => onToggle(resource, v)}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            thumbColor="#FFFFFF"
            accessibilityLabel={`Count ${resource.label} toward runway`}
            accessibilityHint={reason}
          />
        ) : (
          <Lock size={14} color={theme.colors.mutedForeground} accessibilityElementsHidden importantForAccessibility="no" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
});

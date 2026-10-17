import { StyleSheet, Switch, Text, View } from "react-native";
import { Lock } from "lucide-react-native";

import type { RunwayResource } from "@/shared/types/runway";
import { RUNWAY_KIND_LABELS, RUNWAY_LIQUIDITY_LABELS, canToggleRunwayResource, runwayReasonText } from "@/shared/utils/runwayLabels";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useSurfaces } from "@/theme/surfaces";
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
  divider = true,
  onToggle,
}: {
  resource: RunwayResource;
  currency: string;
  busy?: boolean;
  /** Hairline under the row; off for the last row in a section. */
  divider?: boolean;
  onToggle: (resource: RunwayResource, included: boolean) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  // SPENDLY-545: ghost-aware; the amount and its label used to show in ghost mode.
  const money = useGhostMoney(currency);
  const editable = canToggleRunwayResource(resource);
  const reason = runwayReasonText(resource);
  const amount = money(resource.amount);

  return (
    <View
      style={[styles.row, { gap: theme.space.md, paddingVertical: theme.space.md, borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0, borderBottomColor: surfaces.divider }]}
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
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm, fontVariant: ["tabular-nums"] }}>{amount}</Text>
        {editable ? (
          <Switch
            value={resource.included}
            disabled={busy}
            onValueChange={(v) => onToggle(resource, v)}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            thumbColor={resource.included ? theme.colors.primaryForeground : theme.colors.mutedForeground}
            // react-native-web ignores thumbColor when on and falls back to teal.
            {...({ activeThumbColor: theme.colors.primaryForeground } as object)}
            accessibilityLabel={`Count ${resource.label} toward runway`}
            accessibilityHint={reason}
          />
        ) : (
          // The a11y props sit on a View: on web, lucide passes them to the
          // <svg> as unknown DOM attributes (two console errors per load).
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Lock size={14} color={theme.colors.mutedForeground} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 56 },
});

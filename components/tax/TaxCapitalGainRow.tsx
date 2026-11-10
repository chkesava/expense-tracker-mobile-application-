import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { capitalGainStatus, saleListSummary } from "@/shared/features/tax/utils/capitalGainLabels";
import type { CapitalGainRow } from "@/shared/features/tax/utils/capitalGains";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One sale Spendly found in the portfolio (SPENDLY-293), its lots together:
 * what, when, the term, the gain Spendly worked out, and its status in words.
 * A list row, not a card.
 */
export const TaxCapitalGainRow = memo(function TaxCapitalGainRow({
  rows,
  currency,
  formatDate,
  onPress,
}: {
  rows: readonly CapitalGainRow[];
  currency: string;
  formatDate: (date: string) => string;
  onPress: (saleId: string) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { title, subtitle, gain } = saleListSummary(rows, formatDate);
  const status = capitalGainStatus(rows[0]);
  const flagged = rows.some((r) => r.attention.length > 0);
  const muted = rows[0].status === "left_out" || rows[0].status === "replaced_by_statement";
  return (
    <Pressable
      onPress={() => onPress(rows[0].saleRef.id)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}, ${status.label}${flagged ? ", needs a look" : ""}`}
      accessibilityHint="Opens the sale's details and what you can do with it"
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.space.lg,
          paddingVertical: theme.space.md,
          gap: theme.space.md,
          borderBottomColor: surfaces.divider,
          backgroundColor: pressed ? surfaces.tile : "transparent",
        },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
          {title}
        </Text>
        <Text numberOfLines={2} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          Calculated by Spendly · {subtitle}
        </Text>
        <Text
          style={{
            color: status.tone === "warning" ? theme.colors.warning : status.tone === "success" ? theme.colors.success : theme.colors.mutedForeground,
            fontFamily: theme.fontFamily.medium,
            fontSize: theme.typography.xs,
          }}
        >
          {status.label}
          {flagged ? " · needs a look" : ""}
        </Text>
      </View>
      <View style={styles.trailing}>
        <View style={{ alignItems: "flex-end" }}>
          {gain === null ? (
            <Text style={{ color: theme.colors.mutedForeground }}>—</Text>
          ) : (
            <Amount
              value={gain}
              currency={currency}
              ghostable
              style={{
                color: muted ? theme.colors.mutedForeground : theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
                fontSize: theme.typography.sm,
                textDecorationLine: muted ? "line-through" : "none",
              }}
            />
          )}
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: 11 }}>
            {gain === null ? "Cost unknown" : gain < 0 ? "Loss" : "Gain"}
          </Text>
        </View>
        <ChevronRight size={16} color={theme.colors.mutedForeground} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  trailing: { flexDirection: "row", alignItems: "center", gap: 4 },
});

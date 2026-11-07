import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import type { TaxEntry } from "@/shared/features/tax/types";
import type { TaxRecordSummary } from "@/shared/features/tax/utils/tdsReconcile";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One tax record the user entered (SPENDLY-291): what it is, who it's from
 * (TAN masked), the figure, attached proofs, and a duplicate warning.
 */
export const TaxRecordRow = memo(function TaxRecordRow({
  entry,
  summary,
  duplicate,
  status,
  currency,
  onPress,
}: {
  entry: TaxEntry;
  summary: TaxRecordSummary;
  duplicate: boolean;
  /** A screen's own status line, e.g. a payment's match (SPENDLY-294). */
  status?: { label: string; tone: "success" | "warning" | "muted" };
  currency: string;
  onPress: (entry: TaxEntry) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const proofs = entry.documentIds?.length ?? 0;
  const subtitle = [summary.subtitle, proofs > 0 ? `${proofs} proof${proofs === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityLabel={`${summary.title}, ${subtitle}${duplicate ? ", possible duplicate" : ""}`}
      accessibilityHint="Opens it to edit or delete"
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
          {summary.title}
        </Text>
        <Text numberOfLines={2} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {subtitle}
        </Text>
        {status ? (
          <Text
            style={{
              color: status.tone === "warning" ? theme.colors.warning : status.tone === "success" ? theme.colors.success : theme.colors.mutedForeground,
              fontFamily: theme.fontFamily.medium,
              fontSize: theme.typography.xs,
            }}
          >
            {status.label}
          </Text>
        ) : null}
        {duplicate ? (
          <Text style={{ color: theme.colors.warning, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.xs }}>
            Possible duplicate: the same details were entered twice
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        <View style={{ alignItems: "flex-end" }}>
          {summary.amount === null ? (
            <Text style={{ color: theme.colors.mutedForeground }}>—</Text>
          ) : (
            <Amount value={summary.amount} currency={currency} ghostable style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }} />
          )}
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: 11 }}>{summary.amountLabel}</Text>
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

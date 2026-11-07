import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { useSettings } from "@/providers/SettingsProvider";
import type { TaxLine } from "@/shared/features/tax/types";
import { categoryLabel, taxLineHint, taxLineOrigin, taxLineStatus, type TaxTone } from "@/shared/features/tax/utils/incomePresentation";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One tax income item (SPENDLY-290). A list row, not a card: what it is,
 * where the figure came from (Spendly, a calculation, or the user), its
 * status in words, the amount, and why it may need a look.
 */
export const TaxLineRow = memo(function TaxLineRow({
  line,
  currency,
  onPress,
  status: statusOverride,
  hint: hintOverride,
  meta: metaOverride,
}: {
  line: TaxLine;
  currency: string;
  onPress: (line: TaxLine) => void;
  /** Other screens' own wording (deductions, SPENDLY-292); income's by default. */
  status?: { label: string; tone: TaxTone };
  hint?: string | null;
  meta?: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const status = statusOverride ?? taxLineStatus(line);
  const hint = hintOverride !== undefined ? hintOverride : taxLineHint(line);
  const date = line.provenance.periodFrom ? formatDisplayDate(line.provenance.periodFrom, settings?.dateFormat) : null;
  const proofs = line.provenance.documentIds?.length ?? 0;
  const meta = metaOverride ?? [
    categoryLabel(line.category),
    taxLineOrigin(line),
    date,
    proofs > 0 ? `${proofs} proof${proofs === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const color = toneColor(status.tone, theme.colors);

  return (
    <Pressable
      onPress={() => onPress(line)}
      accessibilityRole="button"
      accessibilityLabel={`${line.label}, ${meta}, ${status.label}`}
      accessibilityHint="Opens what you can do with this income"
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
          {line.label}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {meta}
        </Text>
        <View style={[styles.pill, { backgroundColor: withAlpha(color, 0.14), borderRadius: theme.radius.full }]}>
          <Text style={{ color, fontFamily: theme.fontFamily.semibold, fontSize: 11, lineHeight: 15 }}>{status.label}</Text>
        </View>
        {hint ? (
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs, lineHeight: 17 }}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {line.value === null ? (
          <Text style={{ color: theme.colors.warning, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>—</Text>
        ) : (
          <Amount
            value={line.value}
            currency={currency}
            ghostable
            style={{
              color: line.included ? theme.colors.foreground : theme.colors.mutedForeground,
              fontFamily: theme.fontFamily.semibold,
              fontSize: theme.typography.sm,
              textDecorationLine: line.included ? "none" : "line-through",
            }}
          />
        )}
        <ChevronRight size={16} color={theme.colors.mutedForeground} />
      </View>
    </Pressable>
  );
});

export function toneColor(
  tone: TaxTone,
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
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start", marginTop: 2 },
  trailing: { flexDirection: "row", alignItems: "center", gap: 4 },
});

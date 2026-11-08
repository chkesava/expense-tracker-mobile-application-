import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import type { SectionReadiness } from "@/shared/features/tax/utils/readiness";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One section of the tax center (SPENDLY-296): what it holds, its headline
 * figure (labelled as a recorded fact or a calculation), and its readiness in
 * words. Tapping opens the section, where the figure is broken down.
 */
export const ReadinessSectionRow = memo(function ReadinessSectionRow({
  title,
  subtitle,
  icon,
  readiness,
  currency,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  readiness?: SectionReadiness;
  currency: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const status = readiness ? statusOf(readiness) : null;
  const tone = status?.tone === "warning" ? theme.colors.warning : status?.tone === "success" ? theme.colors.success : theme.colors.mutedForeground;
  const figure = readiness?.figure;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${status ? `, ${status.label}` : ""}`}
      style={({ pressed }) => [
        styles.row,
        {
          gap: theme.space.md,
          padding: theme.space.lg,
          borderRadius: theme.radius.lg,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? surfaces.tile : theme.colors.card,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>{title}</Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{subtitle}</Text>
        {status ? <Text style={{ color: tone, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.xs }}>{status.label}</Text> : null}
      </View>
      {figure || readiness?.note ? (
        <View style={{ alignItems: "flex-end", maxWidth: "40%" }}>
          {figure ? (
            figure.amount === null ? (
              <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold }}>—</Text>
            ) : (
              <Amount value={figure.amount} currency={currency} ghostable style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }} />
            )
          ) : (
            <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.xs }}>{readiness?.note}</Text>
          )}
          {figure ? (
            <Text numberOfLines={2} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: 11, textAlign: "right" }}>
              {figure.label}
            </Text>
          ) : null}
        </View>
      ) : null}
      <ChevronRight size={18} color={theme.colors.mutedForeground} />
    </Pressable>
  );
});

function statusOf(r: SectionReadiness): { label: string; tone: "success" | "warning" | "muted" } {
  if (r.state === "to_check") return { label: `${r.openRequired} to finish`, tone: "warning" };
  if (r.state === "worth_a_look") return { label: `${r.openOptional} worth a look`, tone: "muted" };
  return { label: "Nothing open", tone: "success" };
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});

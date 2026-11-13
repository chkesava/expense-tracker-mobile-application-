import { memo, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import { DASH_RADIUS, useSurfaces } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
import { signedCurrencyPrefix } from "@/shared/utils/formatCurrency";
import type { TotalChange } from "@/shared/utils/dashboardDesktop";
import { useTheme } from "@/theme/ThemeProvider";

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * A generic dashboard KPI tile: icon, label, amount, and a signed change row
 * against a prior period. `NetWorthTotalCard` (Total Assets / Total
 * Liabilities) is a thin wrapper over this for its existing call sites; the
 * dashboard's Income/Expense KPI cards use this directly.
 */
export const KpiCard = memo(function KpiCard({
  icon: Icon,
  label,
  value,
  currency,
  change,
  changeTone,
  when,
  loading = false,
  onPress,
  style,
  testID,
}: {
  icon: IconType;
  label: string;
  value: number;
  currency: string;
  change: TotalChange;
  changeTone: "good" | "bad" | "flat";
  /** "over the past month", "since 12 Oct" — the hero's period wording. */
  when: string;
  loading?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const ghost = Boolean(settings.ghostMode);

  const hue =
    changeTone === "good" ? theme.colors.success : changeTone === "bad" ? theme.colors.destructive : theme.colors.primary;
  const tone =
    changeTone === "good" ? theme.colors.success : changeTone === "bad" ? theme.colors.destructive : theme.colors.mutedForeground;
  const Arrow = change.change === null || change.change === 0 ? Minus : change.change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      accessibilityRole="link"
      accessibilityHint={`Opens ${label.toLowerCase()}`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: hovered ? theme.colors.outline : theme.colors.border,
        },
        pressed && styles.pressed,
        style,
      ]}
      testID={testID}
    >
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={[styles.glyph, { backgroundColor: surfaces.wash(hue) }]}>
            <Icon size={16} color={hue} strokeWidth={2.3} />
          </View>
          <Text
            style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
        </View>
        {loading ? (
          <Skeleton width="70%" height={26} borderRadius={6} />
        ) : (
          <Amount
            value={Math.round(value)}
            currency={currency}
            fractionDigits={0}
            ghostable
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={[styles.value, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}
          />
        )}
        {loading || change.change === null ? (
          <Text
            style={[styles.caption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={1}
          >
            {loading ? " " : "No change history yet"}
          </Text>
        ) : (
          <View
            style={styles.changeRow}
            accessibilityLabel={
              ghost
                ? `${label} change hidden`
                : `${change.change === 0 ? "No change" : change.change > 0 ? "Up" : "Down"} ${when}`
            }
          >
            <Arrow size={15} color={tone} strokeWidth={2.6} />
            {ghost ? (
              <Text style={[styles.changeText, { color: tone, fontFamily: theme.fontFamily.semibold }]}>••••</Text>
            ) : change.changePct !== null && change.change !== 0 ? (
              <Text style={[styles.changeText, { color: tone, fontFamily: theme.fontFamily.semibold }]}>
                {change.changePct >= 0 ? "+" : ""}
                {change.changePct.toFixed(1)}%
              </Text>
            ) : change.change !== 0 ? (
              <Amount
                value={Math.round(Math.abs(change.change))}
                currency={currency}
                prefix={signedCurrencyPrefix(change.change > 0 ? "+" : "-", currency)}
                fractionDigits={0}
                ghostable
                numberOfLines={1}
                style={[styles.changeText, { color: tone, fontFamily: theme.fontFamily.semibold }]}
              />
            ) : (
              <Text style={[styles.changeText, { color: tone, fontFamily: theme.fontFamily.semibold }]}>No change</Text>
            )}
            <Text
              style={[styles.caption, styles.when, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
              numberOfLines={1}
            >
              {when}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: DASH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  glyph: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    flex: 1,
    fontSize: 14,
  },
  value: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  changeText: {
    fontSize: 13.5,
    fontVariant: ["tabular-nums"],
  },
  caption: {
    fontSize: 12.5,
  },
  when: {
    flexShrink: 1,
  },
});

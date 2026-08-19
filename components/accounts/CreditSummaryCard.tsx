import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CreditCard } from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_RED,
  CARD_INDIGO_BORDER,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function CreditSummaryCard({
  totalUsed,
  totalLimit,
  totalAvailable,
  utilizationRate,
  currency,
}: {
  totalUsed: number;
  totalLimit: number;
  totalAvailable: number;
  utilizationRate: number;
  currency: string;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const utilizationPercent = Math.round(utilizationRate);
  const pillColor =
    utilizationRate > 70
      ? theme.colors.destructive
      : utilizationRate > 30
        ? theme.colors.warning
        : ACCOUNT_GREEN;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: isDark ? CARD_INDIGO_BORDER : "rgba(217, 119, 6, 0.45)",
          backgroundColor: isDark ? "#16132C" : "#F5F3FF",
        },
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ["rgba(99, 72, 210, 0.28)", "rgba(22, 19, 44, 0.2)", "#12101F"]
            : ["rgba(124, 58, 237, 0.12)", "#F8FAFC", "#F5F3FF"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glow,
          { backgroundColor: isDark ? "rgba(251, 191, 36, 0.16)" : "rgba(251, 191, 36, 0.12)" },
        ]}
      />

      <View style={styles.header}>
        <View style={styles.titleRow}>
          <CreditCard size={18} color={CARD_ORANGE} strokeWidth={2.2} />
          <Text
            style={[
              styles.kicker,
              { color: isDark ? "#E2E8F0" : theme.colors.mutedForeground },
            ]}
          >
            TOTAL CREDIT USED
          </Text>
        </View>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: isDark ? "rgba(15, 23, 42, 0.72)" : "rgba(255,255,255,0.86)",
              borderColor: `${pillColor}55`,
            },
          ]}
        >
          <Text style={[styles.pillText, { color: pillColor }]}>
            {utilizationPercent}% Utilized
          </Text>
        </View>
      </View>

      <Amount
        value={totalUsed}
        currency={currency}
        ghostable
        style={[
          styles.heroAmount,
          { color: isDark ? ACCOUNT_RED : theme.colors.destructive },
        ]}
      />

      <View
        style={[
          styles.track,
          { backgroundColor: isDark ? "rgba(76, 70, 120, 0.55)" : "rgba(15, 23, 42, 0.08)" },
        ]}
      >
          <View
            style={[
              styles.fill,
              {
                width: `${Math.min(100, Math.max(0, utilizationRate))}%`,
                backgroundColor: CARD_ORANGE,
              },
            ]}
          />
      </View>

      <View style={styles.metrics}>
        <View style={styles.metricCol}>
          <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
            Total Limit
          </Text>
          <Amount
            value={totalLimit}
            currency={currency}
            ghostable
            style={[styles.metricValue, { color: theme.colors.foreground }]}
          />
        </View>
        <View
          style={[
            styles.divider,
            { backgroundColor: isDark ? "rgba(148, 163, 184, 0.22)" : "rgba(15, 23, 42, 0.1)" },
          ]}
        />
        <View style={styles.metricCol}>
          <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
            Available Credit
          </Text>
          <Amount
            value={totalAvailable}
            currency={currency}
            ghostable
            style={[
              styles.metricValue,
              { color: isDark ? ACCOUNT_GREEN : theme.colors.success },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
    padding: 18,
    gap: 12,
  },
  glow: {
    position: "absolute",
    right: -40,
    top: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  metrics: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingTop: 4,
  },
  metricCol: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    alignSelf: "stretch",
  },
});

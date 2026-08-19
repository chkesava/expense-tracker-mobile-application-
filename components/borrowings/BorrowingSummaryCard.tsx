import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  ACCOUNT_GREEN,
  ACCOUNT_GREEN_BORDER,
  ACCOUNT_RED,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function BorrowingSummaryCard({
  totalBorrowed,
  totalOutstanding,
  totalInterest,
  totalRepaid,
  overdueCount,
  currency,
}: {
  totalBorrowed: number;
  totalOutstanding: number;
  totalInterest: number;
  totalRepaid: number;
  overdueCount: number;
  currency: string;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const line = isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.1)";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "#0E1612" : "#F0FDF4",
          borderColor: isDark ? ACCOUNT_GREEN_BORDER : "rgba(22, 163, 74, 0.28)",
        },
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ["rgba(74, 222, 128, 0.16)", "rgba(14, 22, 18, 0.4)", "#0B1210"]
            : ["rgba(22, 163, 74, 0.1)", "#F8FAFC", "#F0FDF4"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            backgroundColor: isDark
              ? "rgba(74, 222, 128, 0.12)"
              : "rgba(22, 163, 74, 0.08)",
          },
        ]}
      />

      <View style={styles.grid}>
        <View style={styles.row}>
          <View style={styles.cell}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
              TOTAL BORROWED
            </Text>
            <Amount
              value={totalBorrowed}
              currency={currency}
              ghostable
              style={[styles.value, { color: theme.colors.foreground }]}
            />
          </View>
          <View style={[styles.vRule, { backgroundColor: line }]} />
          <View style={styles.cell}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
              OUTSTANDING
            </Text>
            <Amount
              value={totalOutstanding}
              currency={currency}
              ghostable
              style={[styles.value, { color: isDark ? ACCOUNT_RED : theme.colors.destructive }]}
            />
          </View>
        </View>
        <View style={[styles.hRule, { backgroundColor: line }]} />
        <View style={styles.row}>
          <View style={styles.cell}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
              INTEREST
            </Text>
            <Amount
              value={totalInterest}
              currency={currency}
              ghostable
              style={[styles.value, { color: CARD_ORANGE }]}
            />
          </View>
          <View style={[styles.vRule, { backgroundColor: line }]} />
          <View style={styles.cell}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
              REPAID
            </Text>
            <Amount
              value={totalRepaid}
              currency={currency}
              ghostable
              style={[styles.value, { color: isDark ? ACCOUNT_GREEN : theme.colors.success }]}
            />
          </View>
        </View>
      </View>

      {overdueCount > 0 ? (
        <Text style={[styles.overdue, { color: isDark ? ACCOUNT_RED : theme.colors.destructive }]}>
          {overdueCount} borrowing{overdueCount === 1 ? "" : "s"} past the due date
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
  },
  glow: {
    position: "absolute",
    right: -48,
    top: -56,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  grid: {
    gap: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  cell: {
    flex: 1,
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  vRule: {
    width: StyleSheet.hairlineWidth,
  },
  hRule: {
    height: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  value: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
  },
  overdue: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
  },
});

import { StyleSheet, Text, View } from "react-native";

import {
  accountAccent,
  ACCOUNT_RED,
} from "@/components/accounts/accountScreenTheme";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { formatActivityDateLabel } from "@/shared/utils/activityDisplay";
import type { AccountActivityStats } from "@/shared/utils/accountActivityStats";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Activity statistics and timeline over the shared history window. Every
 * figure comes from `computeAccountActivityStats()`; this component only
 * presents them.
 */
export function ActivityStatisticsCard({ stats }: { stats: AccountActivityStats }) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const tileBackground = isDark
    ? "rgba(255,255,255,0.03)"
    : "rgba(15,23,42,0.03)";
  const tileBorder = isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.07)";

  const tile = (
    key: string,
    label: string,
    value: string,
    caption?: string,
    color?: string
  ) => (
    <View
      key={key}
      style={[
        styles.tile,
        { backgroundColor: tileBackground, borderColor: tileBorder },
      ]}
    >
      <Text style={[styles.tileLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.tileValue,
          { color: color ?? theme.colors.foreground },
        ]}
      >
        {value}
      </Text>
      {caption ? (
        <Text style={[styles.tileCaption, { color: theme.colors.mutedForeground }]}>
          {caption}
        </Text>
      ) : null}
    </View>
  );

  const line = (label: string, value: string) => (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.lineValue, { color: theme.colors.foreground }]}>
        {value}
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            {
              color: theme.colors.foreground,
              fontFamily: theme.fontFamily.semibold,
            },
          ]}
        >
          Activity
        </Text>
        <Text style={[styles.total, { color: theme.colors.foreground }]}>
          {plural(stats.totalTransactions, "transaction", "transactions")}
        </Text>
      </View>

      <Text style={[styles.window, { color: theme.colors.mutedForeground }]}>
        Last {stats.window} months
      </Text>

      {stats.totalTransactions === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          Nothing recorded on this account in the last {stats.window} months.
        </Text>
      ) : (
        <>
          <View style={styles.grid}>
            {tile(
              "income",
              "Income",
              String(stats.incomeCount),
              undefined,
              stats.incomeCount > 0 ? accent : undefined
            )}
            {tile(
              "expenses",
              "Expenses",
              String(stats.expenseCount),
              undefined,
              stats.expenseCount > 0 ? ACCOUNT_RED : undefined
            )}
            {tile(
              "transfers",
              "Transfers",
              String(stats.transferCount),
              // Both legs of a transfer can land in this account. They are one
              // movement of money, so the count says so rather than doubling.
              stats.transferLegCount > stats.transferCount
                ? `${stats.transferLegCount} legs`
                : undefined
            )}
            {stats.refundCount > 0
              ? tile("refunds", "Refunds", String(stats.refundCount))
              : null}
            {stats.otherCount > 0
              ? tile("other", "Unclassified", String(stats.otherCount))
              : null}
          </View>

          <View style={styles.timeline}>
            {stats.firstActivityDate
              ? line("First activity", formatActivityDateLabel(stats.firstActivityDate))
              : null}
            {stats.lastActivityDate
              ? line("Last activity", formatActivityDateLabel(stats.lastActivityDate))
              : null}
            {line(
              "Active days",
              stats.spanDays === undefined
                ? plural(stats.activeDays, "day", "days")
                : `${stats.activeDays} of ${plural(stats.spanDays, "day", "days")}`
            )}
            {stats.averageTransactionsPerActiveDay === undefined
              ? null
              : line(
                  "Per active day",
                  `${stats.averageTransactionsPerActiveDay.toFixed(1)} transactions`
                )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 15,
  },
  total: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  window: {
    fontSize: 11,
    marginTop: -6,
  },
  empty: {
    fontSize: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 96,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 3,
  },
  tileLabel: {
    fontSize: 11,
  },
  tileValue: {
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  tileCaption: {
    fontSize: 10,
  },
  timeline: {
    gap: 6,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  lineLabel: {
    fontSize: 12,
  },
  lineValue: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import {
  accountAccent,
  ACCOUNT_RED,
} from "@/components/accounts/accountScreenTheme";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { formatActivityDateLabel } from "@/shared/utils/activityDisplay";
import {
  ACCOUNT_HISTORY_WINDOWS,
  type AccountHealthMetrics,
  type AccountHistoryWindow,
} from "@/shared/utils/accountHealth";

/**
 * Account health over a selectable history window. Every figure comes from
 * `computeAccountHealthMetrics()`; this component only presents them.
 */
export function AccountHealthCard({
  metrics,
  currency,
  currentBalance,
  currentBalanceLabel,
  window,
  onWindowChange,
}: {
  metrics: AccountHealthMetrics;
  currency: string;
  /** Undefined for credit cards, whose outstanding is shown in the hero. */
  currentBalance?: number;
  currentBalanceLabel: string;
  window: AccountHistoryWindow;
  onWindowChange: (window: AccountHistoryWindow) => void;
}) {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const metric = (
    key: string,
    label: string,
    value: number | undefined,
    caption?: string,
    color?: string
  ) => (
    <View
      key={key}
      style={[
        styles.metric,
        {
          backgroundColor: surfaces.tile,
          borderColor: isDark
            ? "rgba(148,163,184,0.14)"
            : "rgba(15,23,42,0.07)",
        },
      ]}
    >
      <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      {value === undefined ? (
        <Text style={[styles.metricValue, { color: theme.colors.mutedForeground }]}>
          —
        </Text>
      ) : (
        <Amount
          value={value}
          currency={currency}
          ghostable
          style={[styles.metricValue, color ? { color } : undefined]}
        />
      )}
      {caption ? (
        <Text style={[styles.metricCaption, { color: theme.colors.mutedForeground }]}>
          {caption}
        </Text>
      ) : null}
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
          Account health
        </Text>
        <HorizontalSwipeBoundary>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.windows}
          >
            {ACCOUNT_HISTORY_WINDOWS.map((option) => {
              const selected = option === window;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    void haptic.selection();
                    onWindowChange(option);
                  }}
                  style={[
                    styles.window,
                    {
                      backgroundColor: surfaces.tile,
                      borderColor: selected ? accent : "transparent",
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Last ${option} months`}
                >
                  <Text
                    style={[
                      styles.windowLabel,
                      { color: selected ? accent : theme.colors.foreground },
                    ]}
                  >
                    {option}M
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </HorizontalSwipeBoundary>
      </View>

      <View style={styles.grid}>
        {metric("current", currentBalanceLabel, currentBalance)}
        {metric("avg-balance", "Average balance", metrics.averageMonthlyBalance)}
        {metric(
          "avg-income",
          "Average income",
          metrics.averageMonthlyIncome,
          "per month",
          metrics.averageMonthlyIncome ? accent : undefined
        )}
        {metric(
          "avg-spend",
          "Average spend",
          metrics.averageMonthlySpend,
          "per month",
          metrics.averageMonthlySpend ? ACCOUNT_RED : undefined
        )}
        {metric(
          "highest",
          "Highest balance",
          metrics.highestBalance?.amount,
          metrics.highestBalance
            ? formatActivityDateLabel(metrics.highestBalance.date)
            : undefined
        )}
        {metric(
          "lowest",
          "Lowest balance",
          metrics.lowestBalance?.amount,
          metrics.lowestBalance
            ? formatActivityDateLabel(metrics.lowestBalance.date)
            : undefined
        )}
      </View>

      <Text style={[styles.footer, { color: theme.colors.mutedForeground }]}>
        {metrics.transactionCount === 0
          ? `No activity in the last ${window} months`
          : `${metrics.transactionCount} ${
              metrics.transactionCount === 1 ? "transaction" : "transactions"
            } across ${metrics.monthsWithActivity} of ${window} months` +
            (metrics.lastActivityDate
              ? ` · last on ${formatActivityDateLabel(metrics.lastActivityDate)}`
              : "")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 12,
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
  windows: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  window: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  windowLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metric: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 104,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 3,
  },
  metricLabel: {
    fontSize: 11,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  metricCaption: {
    fontSize: 10,
  },
  footer: {
    fontSize: 11,
  },
});

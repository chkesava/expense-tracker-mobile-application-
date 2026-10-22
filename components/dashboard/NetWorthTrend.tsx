import { memo, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react-native";

import { SpendingCurveChart } from "@/components/charts/SpendingCurveChart";
import { Amount } from "@/components/common/Amount";
import { Chip } from "@/components/ui/Chip";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { signedCurrencyPrefix } from "@/shared/utils/formatCurrency";
import {
  MIN_POINTS_FOR_TREND,
  NET_WORTH_PERIODS,
  netWorthTrend,
  type NetWorthPeriod,
  type NetWorthPoint,
} from "@/shared/utils/netWorthHistory";
import { useTheme } from "@/theme/ThemeProvider";

const PERIOD_WORDS: Record<NetWorthPeriod, string> = {
  "1M": "this month",
  "3M": "over 3 months",
  "6M": "over 6 months",
  "1Y": "over the year",
};

/**
 * SPENDLY-568 — the net-worth card's trend: period chips, the change in words
 * and colour, and the line of recorded days. Every figure comes from stored
 * snapshots (`netWorthTrend`); with too little history it says so instead of
 * drawing a line. Amounts and the percentage are hidden in ghost mode.
 */
export const NetWorthTrend = memo(function NetWorthTrend({
  points,
  todayKey,
  currency,
  loading,
  failed,
}: {
  points: NetWorthPoint[];
  todayKey: string;
  currency: string;
  loading: boolean;
  failed: boolean;
}) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const ghost = Boolean(settings.ghostMode);
  const [period, setPeriod] = useState<NetWorthPeriod>("1M");

  const trend = useMemo(() => netWorthTrend(points, period, todayKey), [points, period, todayKey]);
  const chartPoints = useMemo(
    () =>
      trend.series.map((p) => ({
        date: formatDisplayDate(p.date, settings.dateFormat),
        amount: p.netWorth,
      })),
    [trend.series, settings.dateFormat]
  );

  if (loading) return null;

  if (failed || points.length < MIN_POINTS_FOR_TREND) {
    return (
      <Text
        style={[styles.note, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
        testID="net-worth-trend-empty"
      >
        {failed
          ? "Couldn't load your net-worth history."
          : "Trend appears after a few days of history."}
      </Text>
    );
  }

  const change = trend.change;
  const direction = change === null || change === 0 ? "flat" : change > 0 ? "up" : "down";
  const tone =
    direction === "up" ? theme.colors.success : direction === "down" ? theme.colors.destructive : theme.colors.mutedForeground;
  const Arrow = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const word = direction === "up" ? "Up" : direction === "down" ? "Down" : "No change";
  const when =
    trend.coversFullPeriod || !trend.baseline
      ? PERIOD_WORDS[period]
      : `since ${formatDisplayDate(trend.baseline.date, settings.dateFormat)}`;

  return (
    <View style={styles.wrap} testID="net-worth-trend">
      <View style={styles.changeRow}>
        <Arrow size={16} color={tone} strokeWidth={2.6} />
        <Text style={[styles.changeWord, { color: tone, fontFamily: theme.fontFamily.semibold }]}>{word}</Text>
        {change !== null && change !== 0 ? (
          <Amount
            // Whole rupees, like the net-worth figure above it.
            value={Math.round(Math.abs(change))}
            currency={currency}
            prefix={signedCurrencyPrefix(change > 0 ? "+" : "-", currency)}
            ghostable
            numberOfLines={1}
            style={{ fontSize: 15, fontFamily: theme.fontFamily.semibold, color: tone }}
          />
        ) : null}
        {trend.changePct !== null && !ghost ? (
          <Text style={[styles.changePct, { color: tone, fontFamily: theme.fontFamily.semibold }]}>
            ({trend.changePct >= 0 ? "+" : ""}
            {trend.changePct.toFixed(1)}%)
          </Text>
        ) : null}
        <Text
          style={[styles.when, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          numberOfLines={1}
        >
          {when}
        </Text>
      </View>

      {chartPoints.length >= 2 ? (
        <SpendingCurveChart
          points={chartPoints}
          height={110}
          currency={currency}
          lineColor={theme.colors.primary}
          autoDomain
          tightDomain
          xTickCount={2}
          dots="ends"
        />
      ) : (
        <Text style={[styles.note, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          Not enough history in this period yet.
        </Text>
      )}

      <View style={styles.periods} accessibilityRole="radiogroup" accessibilityLabel="Trend period">
        {NET_WORTH_PERIODS.map((p) => (
          <Chip
            key={p}
            size="sm"
            label={p}
            appearance="tonal"
            selected={p === period}
            onPress={() => setPeriod(p)}
            accessibilityRole="radio"
            accessibilityLabel={`Show change ${PERIOD_WORDS[p]}`}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    gap: 6,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 5,
    rowGap: 2,
  },
  changeWord: {
    fontSize: 15,
  },
  changePct: {
    fontSize: 15,
  },
  when: {
    fontSize: 13,
    flexShrink: 1,
  },
  periods: {
    flexDirection: "row",
    gap: 8,
  },
  note: {
    fontSize: 12.5,
    marginTop: 8,
  },
});

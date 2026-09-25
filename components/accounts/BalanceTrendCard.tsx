import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import { SpendingCurveChart } from "@/components/charts/SpendingCurveChart";
import {
  accountAccent,
  ACCOUNT_RED,
} from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { formatActivityDateLabel } from "@/shared/utils/activityDisplay";
import {
  BALANCE_TREND_PERIODS,
  BALANCE_TREND_PERIOD_LABELS,
  downsampleBalanceTrend,
  type AccountBalanceTrend,
  type BalanceMarker,
  type BalanceTrendPeriod,
} from "@/shared/utils/accountBalanceTrend";

/**
 * Enough points to keep the curve's shape on a phone-width chart without
 * rendering a node per day across a year.
 */
const MAX_CHART_POINTS = 90;

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "2-digit",
});

function chartLabel(dateKey: string, period: BalanceTrendPeriod): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return period === "30d" || period === "3m"
    ? SHORT_DATE.format(date)
    : MONTH_YEAR.format(date);
}

export function BalanceTrendCard({
  trend,
  currency,
  period,
  onPeriodChange,
  unavailableReason,
}: {
  trend: AccountBalanceTrend;
  currency: string;
  period: BalanceTrendPeriod;
  onPeriodChange: (period: BalanceTrendPeriod) => void;
  /** Shown instead of the chart when no balance can be plotted. */
  unavailableReason: string;
}) {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const points = useMemo(
    () =>
      downsampleBalanceTrend(trend.points, MAX_CHART_POINTS).map((point) => ({
        date: chartLabel(point.date, period),
        amount: point.balance,
      })),
    [period, trend.points]
  );

  const movedUp =
    trend.current && trend.opening
      ? trend.current.balance >= trend.opening.balance
      : true;

  const marker = (key: string, label: string, value?: BalanceMarker) => (
    <View key={key} style={styles.marker}>
      <Text style={[styles.markerLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      {value ? (
        <>
          <Amount
            value={value.balance}
            currency={currency}
            ghostable
            style={[styles.markerValue, { color: theme.colors.foreground }]}
          />
          <Text
            style={[styles.markerDate, { color: theme.colors.mutedForeground }]}
          >
            {formatActivityDateLabel(value.date)}
          </Text>
        </>
      ) : (
        <Text style={[styles.markerValue, { color: theme.colors.mutedForeground }]}>
          —
        </Text>
      )}
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
          Balance trend
        </Text>
        <View style={styles.periods}>
          {BALANCE_TREND_PERIODS.map((option) => {
            const selected = option === period;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  void haptic.selection();
                  onPeriodChange(option);
                }}
                style={[
                  styles.period,
                  {
                    backgroundColor: surfaces.tile,
                    borderColor: selected ? accent : "transparent",
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show the last ${BALANCE_TREND_PERIOD_LABELS[option]}`}
              >
                <Text
                  style={[
                    styles.periodLabel,
                    { color: selected ? accent : theme.colors.foreground },
                  ]}
                >
                  {BALANCE_TREND_PERIOD_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {trend.available ? (
        <>
          <SpendingCurveChart
            points={points}
            height={180}
            currency={currency}
            lineColor={movedUp ? accent : ACCOUNT_RED}
            showYAxis
            xTickCount={4}
            autoDomain
            animateDots={false}
          />
          <View style={styles.markers}>
            {marker("opening", "Opening", trend.opening)}
            {marker("current", "Current", trend.current)}
            {marker("highest", "Highest", trend.highest)}
            {marker("lowest", "Lowest", trend.lowest)}
          </View>
          <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
            Tap a point for its date and balance.
          </Text>
        </>
      ) : (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          {unavailableReason}
        </Text>
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
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  title: {
    fontSize: 15,
  },
  periods: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  period: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  periodLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  markers: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  marker: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 80,
    gap: 2,
  },
  markerLabel: {
    fontSize: 11,
  },
  markerValue: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  markerDate: {
    fontSize: 10,
  },
  hint: {
    fontSize: 11,
  },
  empty: {
    fontSize: 12,
  },
});

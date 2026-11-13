import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react-native";

import { SpendingCurveChart } from "@/components/charts/SpendingCurveChart";
import { Card } from "@/components/ui/Card";
import { useSurfaces } from "@/components/dashboard/primitives";
import { monthOverMonthChange } from "@/shared/utils/dashboardDesktop";
import { monthLabel } from "@/shared/utils/monthLabel";
import { useTheme } from "@/theme/ThemeProvider";

export interface SpendingTrendMonth {
  month: string;
  spent: number;
}

export interface SpendingTrendCardProps {
  /** Oldest first, same shape the Income vs Expenses chart already builds. */
  months: readonly SpendingTrendMonth[];
  currency: string;
  fill?: boolean;
}

/**
 * Month-over-month spending change with a compact trend line, from the same
 * `cashFlow` series `QuickInsightsWidget` already renders — no new monthly
 * aggregation, just a different, lighter-weight view of it.
 */
export const SpendingTrendCard = memo(function SpendingTrendCard({ months, currency, fill = false }: SpendingTrendCardProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const { change, hasEnoughHistory } = useMemo(() => {
    if (months.length < 2) return { change: { change: null, changePct: null }, hasEnoughHistory: false };
    const current = months[months.length - 1]!;
    const previous = months[months.length - 2]!;
    return { change: monthOverMonthChange(current.spent, previous.spent), hasEnoughHistory: true };
  }, [months]);

  const chartPoints = useMemo(
    () => months.map((m) => ({ date: monthLabel(m.month), amount: m.spent })),
    [months]
  );

  const tone = change.change === null || change.change === 0 ? "flat" : change.change > 0 ? "bad" : "good";
  const color = tone === "good" ? theme.colors.success : tone === "bad" ? theme.colors.destructive : theme.colors.mutedForeground;
  const Arrow = tone === "flat" ? Minus : change.change! > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card variant="outlined" style={fill ? styles.fill : undefined} contentStyle={styles.content} testID="dash-spending-trend">
      <View style={styles.header}>
        <View style={[styles.glyph, { backgroundColor: surfaces.wash(theme.colors.primary) }]}>
          <TrendingUp size={16} color={theme.colors.primary} strokeWidth={2.3} />
        </View>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
            Spending Trend
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            Month over month change
          </Text>
        </View>
      </View>

      {hasEnoughHistory && change.changePct !== null ? (
        <View style={[styles.badge, { backgroundColor: surfaces.wash(color) }]}>
          <Arrow size={16} color={color} strokeWidth={2.6} />
          <Text style={[styles.badgeText, { color, fontFamily: theme.fontFamily.bold }]}>
            {Math.abs(change.changePct).toFixed(0)}%
          </Text>
        </View>
      ) : (
        <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          Not enough history yet
        </Text>
      )}

      {chartPoints.length >= 2 ? (
        <View style={styles.chartSlot}>
          <SpendingCurveChart
            points={chartPoints}
            height={64}
            currency={currency}
            lineColor={theme.colors.primary}
            autoDomain
            tightDomain
            dots="ends"
            showXAxis={false}
          />
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  content: {
    gap: 10,
  },
  fill: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  titleCol: {
    gap: 1,
  },
  title: {
    fontSize: 15,
  },
  subtitle: {
    fontSize: 11.5,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 15,
  },
  chartSlot: {
    marginHorizontal: -10,
  },
});

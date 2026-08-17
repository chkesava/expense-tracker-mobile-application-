import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gauge } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import {
  MetaLabel,
  ProgressTrack,
  Section,
  StatTile,
  useSurfaces,
} from "@/components/dashboard/primitives";
import type { Expense } from "@/shared/types/expense";
import { computeDailySpendingPace } from "@/shared/utils/dashboardWidgets";
import { useTheme } from "@/theme/ThemeProvider";

export interface InsightWidgetProps {
  expenses: Expense[];
  activeMonth: string;
  monthlyBudget?: number;
  currency: string;
}

export function InsightWidget({
  expenses,
  activeMonth,
  monthlyBudget = 0,
  currency,
}: InsightWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const pace = useMemo(() => {
    return computeDailySpendingPace(expenses, activeMonth, monthlyBudget);
  }, [expenses, activeMonth, monthlyBudget]);

  if (expenses.length === 0) {
    return (
      <Section
        title="Daily Spending Pace"
        icon={<Gauge size={16} color={theme.colors.mutedForeground} strokeWidth={2.3} />}
      >
        <EmptyState
          illustration="analytics"
          compact
          title="Insights Coming Soon"
          description="Spending velocity, projected monthly run rate, and pace alerts will calculate automatically."
          tip="Log expenses as they happen for the most accurate daily velocity tracking."
        />
      </Section>
    );
  }

  const paceColor = pace.isOverPace
    ? theme.colors.destructive
    : theme.colors.success;

  /**
   * How far through the month we are vs how far through the budget — the
   * clearest way to show current pace against target pace.
   */
  const monthPct = (pace.daysElapsed / pace.daysInMonth) * 100;
  const budgetPct =
    monthlyBudget > 0 ? (pace.totalSpent / monthlyBudget) * 100 : monthPct;

  return (
    <Section
      title="Daily Spending Pace"
      subtitle={`${activeMonth} · day ${pace.daysElapsed} of ${pace.daysInMonth}`}
      icon={<Gauge size={16} color={paceColor} strokeWidth={2.3} />}
      iconTint={surfaces.wash(paceColor)}
    >
      <View style={styles.tiles}>
        <StatTile
          label="Daily average"
          meta={<MetaLabel>per day spent</MetaLabel>}
        >
          <Amount
            value={pace.averageDailySpend}
            currency={currency}
            ghostable
            style={{
              fontSize: 17,
              letterSpacing: -0.4,
              fontFamily: theme.fontFamily.bold,
              color: theme.colors.foreground,
            }}
          />
        </StatTile>

        <StatTile
          label="Projected total"
          meta={
            <Text
              style={[
                styles.paceMeta,
                { color: paceColor, fontFamily: theme.fontFamily.medium },
              ]}
              numberOfLines={1}
            >
              {pace.isOverPace ? "Over budget pace" : "Within pace"}
            </Text>
          }
        >
          <Amount
            value={pace.projectedMonthEnd}
            currency={currency}
            ghostable
            style={{
              fontSize: 17,
              letterSpacing: -0.4,
              fontFamily: theme.fontFamily.bold,
              color: pace.isOverPace
                ? theme.colors.destructive
                : theme.colors.foreground,
            }}
          />
        </StatTile>
      </View>

      {monthlyBudget > 0 ? (
        <View style={styles.compare}>
          <View style={styles.compareLine}>
            <MetaLabel>Budget used</MetaLabel>
            <Text
              style={[
                styles.comparePct,
                { color: paceColor, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {Math.round(budgetPct)}%
            </Text>
          </View>
          <ProgressTrack pct={budgetPct} color={paceColor} height={6} />

          <View style={styles.compareLine}>
            <MetaLabel>Month elapsed</MetaLabel>
            <MetaLabel>{Math.round(monthPct)}%</MetaLabel>
          </View>
          <ProgressTrack
            pct={monthPct}
            color={theme.colors.mutedForeground}
            height={6}
          />
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: "row",
    gap: 10,
  },
  paceMeta: {
    fontSize: 11,
    lineHeight: 15,
  },
  compare: {
    marginTop: 14,
    gap: 6,
  },
  compareLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
  },
  comparePct: {
    fontSize: 12,
  },
});

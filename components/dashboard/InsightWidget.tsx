import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertCircle, CheckCircle2, Sparkles, TrendingUp } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/Card";
import type { Expense } from "@/shared/types/expense";
import { computeDailySpendingPace } from "@/shared/utils/dashboardWidgets";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const pace = useMemo(() => {
    return computeDailySpendingPace(expenses, activeMonth, monthlyBudget);
  }, [expenses, activeMonth, monthlyBudget]);

  if (expenses.length === 0) {
    return (
      <Card title="Daily Spending Pace">
        <EmptyState
          illustration="analytics"
          compact
          title="Insights Coming Soon"
          description="Spending velocity, projected monthly run rate, and pace alerts will calculate automatically."
          tip="Log expenses as they happen for the most accurate daily velocity tracking."
        />
      </Card>
    );
  }

  return (
    <Card
      title="Daily Spending Pace"
      subtitle={`${activeMonth} · ${pace.daysElapsed} of ${pace.daysInMonth} days elapsed`}
    >
      <View style={styles.grid}>
        {/* Daily Average Box */}
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.03)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.statLabel,
              { color: theme.colors.mutedForeground },
            ]}
          >
            Daily Average
          </Text>
          <Amount
            value={pace.averageDailySpend}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.md,
              fontWeight: "800",
              color: theme.colors.foreground,
            }}
          />
          <Text
            style={{
              fontSize: 10,
              color: theme.colors.mutedForeground,
            }}
          >
            per day spent
          </Text>
        </View>

        {/* Projected Month End Box */}
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.03)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.statLabel,
              { color: theme.colors.mutedForeground },
            ]}
          >
            Projected Total
          </Text>
          <Amount
            value={pace.projectedMonthEnd}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.md,
              fontWeight: "800",
              color: pace.isOverPace
                ? theme.colors.destructive
                : theme.colors.foreground,
            }}
          />
          <Text
            style={{
              fontSize: 10,
              color: pace.isOverPace
                ? theme.colors.destructive
                : theme.colors.success,
              fontWeight: "600",
            }}
          >
            {pace.isOverPace ? "Over budget pace" : "Within pace"}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});

import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ArrowDownRight, ArrowUpRight, Minus, Trophy } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/Card";
import { useSurfaces } from "@/components/dashboard/primitives";
import type { Expense } from "@/shared/types/expense";
import { getTopCategories } from "@/shared/utils/categoryInsights";
import { monthOverMonthChange } from "@/shared/utils/dashboardDesktop";
import { isInMonth } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

export interface CategoryInsightsWidgetProps {
  expenses: readonly Expense[];
  activeMonth: string;
  previousMonth: string;
  currency: string;
  fill?: boolean;
}

/**
 * Current-vs-previous-month spend per top category. Built from the same
 * `getTopCategories`/`groupByCategory` the Spending Overview card already
 * uses, and `monthOverMonthChange` the KPI cards already use — no new
 * aggregation logic.
 */
export const CategoryInsightsWidget = memo(function CategoryInsightsWidget({
  expenses,
  activeMonth,
  previousMonth,
  currency,
  fill = false,
}: CategoryInsightsWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const rows = useMemo(() => {
    const current = expenses.filter((e) => isInMonth(e, activeMonth));
    const previous = expenses.filter((e) => isInMonth(e, previousMonth));
    const previousByCategory = new Map(previous.map((e) => [e.category, 0]));
    for (const e of previous) previousByCategory.set(e.category, (previousByCategory.get(e.category) ?? 0) + e.amount);

    return getTopCategories(current, 5).map((row) => ({
      category: row.category,
      value: row.value,
      change: monthOverMonthChange(row.value, previousByCategory.get(row.category) ?? 0),
    }));
  }, [expenses, activeMonth, previousMonth]);

  return (
    <Card variant="outlined" style={fill ? styles.fill : undefined} contentStyle={styles.content} testID="dash-category-insights">
      <View style={styles.header}>
        <View style={[styles.glyph, { backgroundColor: surfaces.wash(theme.colors.primary) }]}>
          <Trophy size={16} color={theme.colors.primary} strokeWidth={2.3} />
        </View>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
            Category Insights
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            vs last month
          </Text>
        </View>
      </View>

      {rows.length === 0 ? (
        <EmptyState title="No spending yet" description="Categories appear here once you log an expense." compact />
      ) : (
        <View style={styles.rows}>
          {rows.map((row) => {
            const tone = row.change.change === null || row.change.change === 0 ? "flat" : row.change.change > 0 ? "bad" : "good";
            const color = tone === "good" ? theme.colors.success : tone === "bad" ? theme.colors.destructive : theme.colors.mutedForeground;
            const Arrow = tone === "flat" ? Minus : row.change.change! > 0 ? ArrowUpRight : ArrowDownRight;
            return (
              <View key={row.category} style={styles.row}>
                <Text
                  style={[styles.rowLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
                  numberOfLines={1}
                >
                  {row.category}
                </Text>
                <Amount
                  value={Math.round(row.value)}
                  currency={currency}
                  fractionDigits={0}
                  ghostable
                  numberOfLines={1}
                  style={{ fontSize: 13, fontFamily: theme.fontFamily.semibold, color: theme.colors.foreground }}
                />
                <View style={styles.changeChip}>
                  <Arrow size={12} color={color} strokeWidth={2.6} />
                  <Text style={[styles.changeText, { color, fontFamily: theme.fontFamily.semibold }]}>
                    {row.change.changePct === null
                      ? "—"
                      : `${row.change.changePct >= 0 ? "+" : ""}${row.change.changePct.toFixed(0)}%`}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
});

const styles = StyleSheet.create({
  content: {
    gap: 12,
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
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
  },
  changeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minWidth: 52,
    justifyContent: "flex-end",
  },
  changeText: {
    fontSize: 12,
  },
});

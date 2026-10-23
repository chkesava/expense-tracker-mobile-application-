import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronDown, ChevronRight, Target } from "lucide-react-native";

import { DonutChart } from "@/components/charts/DonutChart";
import { EmptyState } from "@/components/common/EmptyState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import {
  ProgressIndicator,
  type ProgressStatus,
} from "@/components/dashboard/ProgressIndicator";
import { Section, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { spendingSliceColor } from "@/components/spending/palette";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { haptic } from "@/lib/haptics";
import {
  budgetProgressSummary,
  computeActiveCategoryBudgets,
  spendingBreakdown,
} from "@/shared/utils/dashboardWidgets";
import { budgetsHref } from "@/shared/utils/budgetDrilldown";
import {
  isFoldedOthersSlice,
  spendingOverviewTargetHref,
  totalSpendingHref,
} from "@/shared/utils/spendingDrilldown";
import type { SpendlyBudget } from "@/shared/utils/spendlyBudget";
import { useTheme } from "@/theme/ThemeProvider";

export interface SpendingOverviewCardProps {
  /** The active month's summary `categoryTotals` (parent and "Parent::Sub" keys). */
  categoryTotals: Record<string, number> | null;
  currency: string;
  activeMonth: string;
  monthLabel: string;
  onOpenMonthPicker: () => void;
  loading: boolean;
  unavailable: "missing" | "error" | null;
  monthlyBudget: number;
  /** `computeSpendlyBudget` for the month, from the screen. */
  budget: SpendlyBudget;
}

/** Legend entries before the rest fold into "Others". */
const LEGEND_LIMIT = 4;

function budgetStatusOf(status: SpendlyBudget["status"]): ProgressStatus {
  if (status === "attention") return "over";
  if (status === "watch") return "watch";
  return "good";
}

/**
 * SPENDLY-566 — Visual First "Spending Overview": the month's spend as a donut
 * with a top-four-plus-Others legend (`spendingBreakdown`, parent categories
 * only), and a budget progress row underneath. Budget figures come from
 * `computeActiveCategoryBudgets` / `computeSpendlyBudget`, the same sources as
 * the Monthly Budget card; this card only counts and displays them.
 */
export const SpendingOverviewCard = memo(function SpendingOverviewCard({
  categoryTotals,
  currency,
  activeMonth,
  monthLabel,
  onOpenMonthPicker,
  loading,
  unavailable,
  monthlyBudget,
  budget,
}: SpendingOverviewCardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  // Shared reference-data subscription (ref-counted with the Budgets card),
  // not a listener of this card's own.
  const { budgets: categoryBudgets } = useCategoryBudgets();

  const { categories, totalSpent } = useMemo(
    () => spendingBreakdown(categoryTotals, LEGEND_LIMIT),
    [categoryTotals]
  );

  const segments = useMemo(() => {
    return categories.map((c, i) => ({
      id: c.category,
      label: c.category,
      value: c.amount,
      color: spendingSliceColor(i, c.category, theme.colors),
    }));
  }, [categories, theme.colors.primary, theme.colors.info]);

  const budgetProgress = useMemo(() => {
    const items = computeActiveCategoryBudgets(categoryBudgets ?? [], categoryTotals ?? {}, activeMonth);
    return budgetProgressSummary(items);
  }, [categoryBudgets, categoryTotals, activeMonth]);

  // SPENDLY-574: the donut centre opens Total Spending; a slice or legend row
  // opens that category (the folded "Others" opens the ranked list). The
  // month travels with the route so the detail shows the same period.
  const openTotalSpending = () => {
    router.push(totalSpendingHref(activeMonth) as Href);
  };
  const openSlice = (index: number) => {
    const slice = categories[index];
    if (!slice) return;
    const folded = isFoldedOthersSlice(categories, index, categoryTotals, LEGEND_LIMIT);
    router.push(spendingOverviewTargetHref(slice.category, activeMonth, folded) as Href);
  };

  // SPENDLY-575: with any budget set, the row opens Budget Progress for this
  // month; with none, it still goes straight to setting one up.
  const hasAnyBudget = budgetProgress.total > 0 || monthlyBudget > 0;
  const openBudgets = () => {
    void haptic.selection();
    router.push((hasAnyBudget ? budgetsHref(activeMonth) : "/settings/money") as Href);
  };

  const monthChip = (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onOpenMonthPicker();
      }}
      hitSlop={6}
      android_ripple={{ color: surfaces.control, borderless: false }}
      style={({ pressed }) => [
        styles.monthChip,
        { backgroundColor: surfaces.control, borderColor: theme.colors.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Change month, currently ${monthLabel}`}
    >
      <Text
        style={[styles.monthChipText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
        numberOfLines={1}
      >
        {monthLabel}
      </Text>
      <ChevronDown size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />
    </Pressable>
  );

  if (loading) {
    return <DashboardSkeleton variant="section" rows={3} />;
  }

  // Budget row: category budgets first, else the monthly budget, else a nudge.
  let budgetTitle = "Budget progress";
  let budgetCaption = "No budget set yet";
  let budgetPct = 0;
  let budgetStatus: ProgressStatus = "neutral";
  if (budgetProgress.total > 0) {
    budgetCaption = `${budgetProgress.onTrack} of ${budgetProgress.total} on track`;
    budgetPct = (budgetProgress.onTrack / budgetProgress.total) * 100;
    budgetStatus = budgetProgress.onTrack === budgetProgress.total ? "good" : "watch";
  } else if (monthlyBudget > 0) {
    budgetCaption = budget.isOverBudget
      ? "Over the monthly budget"
      : `${Math.round(budget.pctUsed)}% of the monthly budget used`;
    budgetPct = budget.pctUsed;
    budgetStatus = budgetStatusOf(budget.status);
  } else {
    budgetTitle = "Set a budget";
    budgetCaption = "Get alerts before you overspend";
  }

  return (
    <Section title="Spending Overview" action={monthChip} testID="dashboard-spending-overview">
      {unavailable ? (
        <Text
          style={[styles.unavailable, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
        >
          {unavailable === "error"
            ? "Couldn't load this month's totals"
            : "Totals for this month aren't ready yet"}
        </Text>
      ) : categories.length === 0 ? (
        <EmptyState
          illustration="analytics"
          compact
          title="No spending yet this month"
          description="Your spending breakdown appears here as you record expenses."
        />
      ) : (
        <View style={styles.chartRow}>
          <DonutChart
            data={segments}
            size={140}
            strokeWidth={22}
            currency={currency}
            title="Total spent"
            titleBelow
            centerFractionDigits={0}
            showLegend={false}
            onCenterPress={openTotalSpending}
            onSlicePress={(_, index) => openSlice(index)}
            centerAccessibilityLabel={`Total spent for ${monthLabel}. Open total spending`}
          />
          <View style={styles.legend}>
            {categories.map((c, i) => (
              <Pressable
                key={c.category}
                onPress={() => {
                  void haptic.selection();
                  openSlice(i);
                }}
                android_ripple={{ color: surfaces.control, borderless: false }}
                style={({ pressed }) => [styles.legendRow, pressed && { backgroundColor: surfaces.control }]}
                accessibilityRole="button"
                accessibilityLabel={`${c.category}, ${totalSpent > 0 ? `${Math.round(c.percentage)}% of spending` : "no share"}. Open details`}
                testID={`spending-overview-row-${i}`}
              >
                <View style={[styles.dot, { backgroundColor: segments[i]?.color }]} />
                <Text
                  style={[styles.legendLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular }]}
                  numberOfLines={1}
                >
                  {c.category}
                </Text>
                <Text
                  style={[styles.legendPct, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
                >
                  {totalSpent > 0 ? `${Math.round(c.percentage)}%` : "—"}
                </Text>
                <ChevronRight size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Pressable
        onPress={openBudgets}
        android_ripple={{ color: surfaces.control, borderless: false }}
        style={({ pressed }) => [
          styles.budgetRow,
          { backgroundColor: surfaces.tile, borderColor: theme.colors.border },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${budgetTitle}: ${budgetCaption}. ${hasAnyBudget ? "Open budget progress" : "Set a budget"}`}
      >
        <View style={[styles.budgetGlyph, { backgroundColor: withAlpha(theme.colors.destructive, surfaces.isDark ? 0.18 : 0.1) }]}>
          <Target size={18} color={theme.colors.destructive} strokeWidth={2.2} />
        </View>
        <View style={styles.budgetBody}>
          <Text
            style={[styles.budgetTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            {budgetTitle}
          </Text>
          <Text
            style={[styles.budgetCaption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={1}
          >
            {budgetCaption}
          </Text>
          {budgetStatus !== "neutral" ? (
            <ProgressIndicator pct={budgetPct} status={budgetStatus} style={styles.budgetBar} />
          ) : null}
        </View>
        <ChevronRight size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />
      </Pressable>
    </Section>
  );
});

const styles = StyleSheet.create({
  monthChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    maxWidth: 150,
  },
  monthChipText: {
    fontSize: 13,
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.82,
  },
  unavailable: {
    fontSize: 13,
    paddingVertical: 16,
  },
  chartRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  legend: {
    flex: 1,
    minWidth: 156,
    gap: 2,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    // A full-width 40dp row is the tap target (SPENDLY-574); the old 10dp
    // gap between rows is now their padding.
    minHeight: 40,
    paddingHorizontal: 6,
    borderRadius: 10,
    overflow: "hidden",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13.5,
  },
  legendPct: {
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  budgetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  budgetGlyph: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  budgetBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  budgetTitle: {
    fontSize: 15,
  },
  budgetCaption: {
    fontSize: 13,
  },
  budgetBar: {
    marginTop: 6,
  },
});

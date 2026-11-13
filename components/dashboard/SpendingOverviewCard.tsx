import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronDown, ChevronRight, ListOrdered, Target, TrendingUp } from "lucide-react-native";

import { DonutChart } from "@/components/charts/DonutChart";
import { Amount } from "@/components/common/Amount";
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
import { trendsHref } from "@/shared/utils/spendingTrends";
import { topCategoriesHref } from "@/shared/utils/topCategories";
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
  /**
   * SPENDLY-718: the desktop dashboard's half-width card. The legend becomes
   * a table with each category's amount, and the three links sit in a row.
   */
  wide?: boolean;
  /** Stretch to the desktop row's height. */
  fill?: boolean;
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
  wide = false,
  fill = false,
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
      color: spendingSliceColor(i, c.category, theme),
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
    <Section title="Spending Overview" action={monthChip} fill={fill} testID="dashboard-spending-overview">
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
        <View style={[styles.chartRow, wide && styles.chartRowWide]}>
          <DonutChart
            data={segments}
            size={wide ? 150 : 140}
            strokeWidth={wide ? 24 : 22}
            currency={currency}
            title="Total spent"
            titleBelow
            centerFractionDigits={0}
            showLegend={false}
            onCenterPress={openTotalSpending}
            onSlicePress={(_, index) => openSlice(index)}
            centerAccessibilityLabel={`Total spent for ${monthLabel}. Open total spending`}
          />
          <View style={[styles.legend, wide && styles.legendWide]}>
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
                  style={[
                    styles.legendPct,
                    wide && styles.legendPctWide,
                    { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                  ]}
                >
                  {totalSpent > 0 ? `${Math.round(c.percentage)}%` : "—"}
                </Text>
                {wide ? (
                  <Amount
                    value={Math.round(c.amount)}
                    currency={currency}
                    fractionDigits={0}
                    ghostable
                    numberOfLines={1}
                    style={[styles.legendAmount, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
                  />
                ) : null}
                {wide ? null : <ChevronRight size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={wide ? styles.linkStrip : undefined}>
      {/* SPENDLY-580: the ranked categories for this month. */}
      <Pressable
        onPress={() => {
          void haptic.selection();
          router.push(topCategoriesHref(activeMonth) as Href);
        }}
        android_ripple={{ color: surfaces.control, borderless: false }}
        style={({ pressed }) => [
          styles.budgetRow,
          wide && styles.linkWide,
          { backgroundColor: surfaces.tile, borderColor: theme.colors.border },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Highest spending categories: see where you spend the most. Open the ranking"
        testID="dashboard-top-categories"
      >
        {wide ? null : (
          <View style={[styles.budgetGlyph, { backgroundColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.18 : 0.1) }]}>
            <ListOrdered size={18} color={theme.colors.primary} strokeWidth={2.2} />
          </View>
        )}
        <View style={styles.budgetBody}>
          <Text
            style={[styles.budgetTitle, wide && styles.linkTitleWide, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            {wide ? "Top categories" : "Highest spending categories"}
          </Text>
          <Text
            style={[styles.budgetCaption, wide && styles.linkCaptionWide, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={1}
          >
            {wide ? "Where you spend most" : "See where you spend the most"}
          </Text>
        </View>
        {wide ? null : <ChevronRight size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
      </Pressable>

      {/* SPENDLY-578: the entry to Spending Trends for this month. */}
      <Pressable
        onPress={() => {
          void haptic.selection();
          router.push(trendsHref(activeMonth) as Href);
        }}
        android_ripple={{ color: surfaces.control, borderless: false }}
        style={({ pressed }) => [
          styles.budgetRow,
          wide && styles.linkWide,
          { backgroundColor: surfaces.tile, borderColor: theme.colors.border },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Spending trend: see how your spending changes over time. Open spending trends"
        testID="dashboard-spending-trend"
      >
        {wide ? null : (
          <View style={[styles.budgetGlyph, { backgroundColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.18 : 0.1) }]}>
            <TrendingUp size={18} color={theme.colors.primary} strokeWidth={2.2} />
          </View>
        )}
        <View style={styles.budgetBody}>
          <Text
            style={[styles.budgetTitle, wide && styles.linkTitleWide, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            Spending trend
          </Text>
          <Text
            style={[styles.budgetCaption, wide && styles.linkCaptionWide, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={1}
          >
            {wide ? "Month over month" : "See how your spending changes over time"}
          </Text>
        </View>
        {wide ? null : <ChevronRight size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
      </Pressable>

      <Pressable
        onPress={openBudgets}
        android_ripple={{ color: surfaces.control, borderless: false }}
        style={({ pressed }) => [
          styles.budgetRow,
          wide && styles.linkWide,
          { backgroundColor: surfaces.tile, borderColor: theme.colors.border },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${budgetTitle}: ${budgetCaption}. ${hasAnyBudget ? "Open budget progress" : "Set a budget"}`}
      >
        {wide ? null : (
          <View style={[styles.budgetGlyph, { backgroundColor: withAlpha(theme.colors.destructive, surfaces.isDark ? 0.18 : 0.1) }]}>
            <Target size={18} color={theme.colors.destructive} strokeWidth={2.2} />
          </View>
        )}
        <View style={styles.budgetBody}>
          <Text
            style={[styles.budgetTitle, wide && styles.linkTitleWide, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            {budgetTitle}
          </Text>
          <Text
            style={[styles.budgetCaption, wide && styles.linkCaptionWide, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={1}
          >
            {budgetCaption}
          </Text>
          {budgetStatus !== "neutral" ? (
            <ProgressIndicator pct={budgetPct} status={budgetStatus} style={styles.budgetBar} />
          ) : null}
        </View>
        {wide ? null : <ChevronRight size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
      </Pressable>
      </View>
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
  legendWide: {
    // SPENDLY dashboard redesign fix: wide mode adds the amount column
    // (`legendAmount`, min 76) and a wider percentage column — the plain
    // 156 floor was sized for the narrow legend only and let the card's own
    // `overflow: hidden` clip the amount when the row couldn't grow.
    minWidth: 220,
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
  legendPctWide: {
    minWidth: 40,
    textAlign: "right",
  },
  legendAmount: {
    minWidth: 76,
    textAlign: "right",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  chartRowWide: {
    // SPENDLY dashboard redesign fix: a narrow desktop row (e.g. this card
    // sharing its row with Income vs Expenses and/or Budget) could force
    // the donut and legend into less width than either needs. `nowrap` then
    // let the card's own `overflow: hidden` clip the legend's amount column
    // instead of reflowing to the legend below the donut.
    gap: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  linkStrip: {
    flexDirection: "row",
    // Reflows to two rows instead of squeezing three links to an
    // unreadable sliver when the card's own row is narrow (SPENDLY
    // dashboard redesign fix).
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  linkWide: {
    flex: 1,
    // A floor so three links reliably wrap to two rows (flex-basis alone
    // doesn't force it) rather than compressing past readability.
    flexBasis: 140,
    minWidth: 140,
    marginTop: 0,
    padding: 10,
    gap: 10,
  },
  linkTitleWide: {
    fontSize: 13.5,
  },
  linkCaptionWide: {
    fontSize: 12,
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

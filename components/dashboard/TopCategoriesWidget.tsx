import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { PieChart } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import {
  categoryRamp,
  RowGlyph,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import { topCategoryShares } from "@/shared/utils/dashboardWidgets";
import { useTheme } from "@/theme/ThemeProvider";

export interface TopCategoriesWidgetProps {
  categoryTotals: Record<string, number> | null;
  currency: string;
  activeMonth: string;
}

/**
 * Spending breakdown (SPENDLY-533): the month's top five categories, each with
 * its glyph, amount, share of the total and a bar, from the period summary's
 * parent-category totals (`topCategoryShares`).
 */
export const TopCategoriesWidget = React.memo(function TopCategoriesWidget({
  categoryTotals,
  currency,
}: TopCategoriesWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  // Parent categories only: the summary also stores "Parent::Sub" keys, which
  // would double the total (SPENDLY-533).
  const { categories, totalSpent } = useMemo(
    () => topCategoryShares(categoryTotals, 5),
    [categoryTotals]
  );

  /** Darkest = largest share; ramp carries no positive/negative meaning. */
  const barColors = categoryRamp(theme.colors);

  const openAnalytics = () => router.push("/insights" as Href);

  if (categories.length === 0) {
    return (
      <Section
        title="Spending"
        icon={
          <PieChart size={16} color={theme.colors.mutedForeground} strokeWidth={2.3} />
        }
        iconTint={surfaces.tile}
      >
        <EmptyState
          illustration="analytics"
          compact
          title="No spending yet this month"
          description="Your top categories appear here as you record expenses."
        />
      </Section>
    );
  }

  return (
    <Section
      title="Spending"
      subtitle={`Top ${categories.length} this month`}
      icon={<PieChart size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={
        <SectionAction
          label="Details"
          onPress={openAnalytics}
          accessibilityLabel="Open spending analytics"
        />
      }
      contentStyle={styles.list}
    >
      <View style={[styles.totalRow, { backgroundColor: surfaces.tile }]}>
        <Text
          style={[styles.totalLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
        >
          Spent across categories
        </Text>
        <FinancialAmount value={totalSpent} currency={currency} size="md" weight="bold" />
      </View>

      {categories.map((cat, idx) => {
        const barColor = barColors[idx % barColors.length];
        const share = Math.round(cat.percentage);
        return (
          <ProgressIndicator
            key={cat.category}
            pct={cat.percentage}
            color={barColor}
            height={5}
            leading={
              <RowGlyph size={30} tint={surfaces.tile}>
                <Text style={styles.glyph} accessible={false}>
                  {getCategoryIcon(cat.category)}
                </Text>
              </RowGlyph>
            }
            label={cat.category}
            value={
              <View style={styles.valueCol}>
                <FinancialAmount value={cat.amount} currency={currency} size="sm" />
                <Text
                  style={[styles.share, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
                >
                  {share}% of total
                </Text>
              </View>
            }
            accessibilityLabel={`${cat.category}, ${share}% of spending`}
          />
        );
      })}
    </Section>
  );
});

const styles = StyleSheet.create({
  list: {
    gap: 14,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  totalLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
  },
  glyph: {
    fontSize: 15,
  },
  valueCol: {
    alignItems: "flex-end",
    gap: 1,
  },
  share: {
    fontSize: 11,
  },
});

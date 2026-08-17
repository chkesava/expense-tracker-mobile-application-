import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { PieChart } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import {
  CATEGORY_RAMP,
  MetaLabel,
  Section,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import type { Expense } from "@/shared/types/expense";
import { computeTopCategories } from "@/shared/utils/dashboardWidgets";
import { useTheme } from "@/theme/ThemeProvider";

export interface TopCategoriesWidgetProps {
  expenses: Expense[];
  currency: string;
  activeMonth: string;
}

function AnimatedCategoryBar({
  percentage,
  color,
  index,
  height,
}: {
  percentage: number;
  color: string;
  index: number;
  height: number;
}) {
  const widthProgress = useSharedValue(0);

  useEffect(() => {
    widthProgress.value = withDelay(
      index * 60,
      withSpring(Math.min(100, Math.max(2, percentage)), {
        damping: 18,
        stiffness: 180,
      })
    );
  }, [percentage, index, widthProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${widthProgress.value}%`,
  }));

  return (
    <Animated.View
      style={[
        { height, borderRadius: height / 2, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

export function TopCategoriesWidget({
  expenses,
  currency,
  activeMonth,
}: TopCategoriesWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const { categories, totalSpent } = useMemo(() => {
    return computeTopCategories(expenses, 5);
  }, [expenses]);

  /** Darkest = largest share; ramp carries no positive/negative meaning. */
  const barColors = surfaces.isDark
    ? [theme.colors.foreground, ...CATEGORY_RAMP.slice(1)]
    : CATEGORY_RAMP;

  if (categories.length === 0) {
    return (
      <Section
        title="Top Spending Categories"
        icon={
          <PieChart size={16} color={theme.colors.mutedForeground} strokeWidth={2.3} />
        }
      >
        <EmptyState
          illustration="analytics"
          compact
          title="No Spending Data Yet"
          description="Your category breakdown will automatically appear after recording transactions."
          tip="Track core essentials first: Housing, Food, Transport, and Utilities."
        />
      </Section>
    );
  }

  return (
    <Section
      title="Top Spending Categories"
      subtitle={`${activeMonth} · ${currency} ${totalSpent.toLocaleString()} total`}
      icon={<PieChart size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      contentStyle={styles.list}
    >
      {categories.map((cat, idx) => {
        const barColor = barColors[idx % barColors.length];
        return (
          <View key={cat.category} style={styles.item}>
            <View style={styles.itemTop}>
              <Text
                style={[
                  styles.rank,
                  {
                    color: theme.colors.mutedForeground,
                    fontFamily: theme.fontFamily.semibold,
                  },
                ]}
              >
                {idx + 1}
              </Text>
              <Text style={styles.glyph}>{getCategoryIcon(cat.category)}</Text>
              <Text
                style={[
                  styles.name,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.medium,
                  },
                ]}
                numberOfLines={1}
              >
                {cat.category}
              </Text>
              <Amount
                value={cat.amount}
                currency={currency}
                ghostable
                animated
                style={{
                  fontSize: 14,
                  fontFamily: theme.fontFamily.semibold,
                  color: theme.colors.foreground,
                }}
              />
              <MetaLabel style={styles.pct}>{cat.percentage}%</MetaLabel>
            </View>

            <View style={[styles.track, { backgroundColor: surfaces.track }]}>
              <AnimatedCategoryBar
                percentage={cat.percentage}
                color={barColor}
                index={idx}
                height={5}
              />
            </View>
          </View>
        );
      })}
    </Section>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 14,
  },
  item: {
    gap: 7,
  },
  itemTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rank: {
    fontSize: 11,
    width: 12,
    textAlign: "center",
  },
  glyph: {
    fontSize: 15,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  pct: {
    width: 34,
    textAlign: "right",
  },
  track: {
    height: 5,
    borderRadius: 2.5,
    overflow: "hidden",
    marginLeft: 20,
  },
});

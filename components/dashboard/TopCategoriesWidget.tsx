import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/Card";
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
}: {
  percentage: number;
  color: string;
  index: number;
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
        styles.progressBarFill,
        {
          backgroundColor: color,
        },
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

  const { categories, totalSpent } = useMemo(() => {
    return computeTopCategories(expenses, 5);
  }, [expenses]);

  if (categories.length === 0) {
    return (
      <Card title="Top Spending Categories">
        <EmptyState
          illustration="analytics"
          compact
          title="No Spending Data Yet"
          description="Your category breakdown will automatically appear after recording transactions."
          tip="Track core essentials first: Housing, Food, Transport, and Utilities."
        />
      </Card>
    );
  }

  return (
    <Card
      title="Top Spending Categories"
      subtitle={`${activeMonth} · ${currency} ${totalSpent.toLocaleString()} total`}
    >
      <View style={{ gap: 12 }}>
        {categories.map((cat, idx) => {
          const barColor =
            idx === 0
              ? theme.colors.primary
              : idx === 1
                ? "#8B5CF6"
                : idx === 2
                  ? "#EC4899"
                  : idx === 3
                    ? "#F59E0B"
                    : theme.colors.mutedForeground;

          return (
            <View key={cat.category} style={{ gap: 6 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={styles.catLabelRow}>
                  <View
                    style={[
                      styles.rankBadge,
                      { backgroundColor: theme.colors.muted },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: theme.colors.mutedForeground,
                      }}
                    >
                      #{idx + 1}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: theme.typography.sm,
                      fontWeight: "700",
                      color: theme.colors.foreground,
                    }}
                  >
                    {cat.category}
                  </Text>
                </View>

                <View style={styles.catAmountRow}>
                  <Amount
                    value={cat.amount}
                    currency={currency}
                    ghostable
                    animated
                    style={{
                      fontSize: theme.typography.sm,
                      fontWeight: "700",
                      color: theme.colors.foreground,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: theme.typography.xs,
                      fontWeight: "600",
                      color: theme.colors.mutedForeground,
                    }}
                  >
                    ({cat.percentage}%)
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.progressBarBg,
                  { backgroundColor: theme.colors.muted },
                ]}
              >
                <AnimatedCategoryBar
                  percentage={cat.percentage}
                  color={barColor}
                  index={idx}
                />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  catLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rankBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
});

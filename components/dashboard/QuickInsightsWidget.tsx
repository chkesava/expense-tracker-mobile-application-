import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, TrendingUp } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import {
  MetaLabel,
  Section,
  TrendText,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export interface QuickInsightsWidgetProps {
  monthlySpent: number;
  monthlyIncome: number;
  previousSpent: number;
  previousIncome: number;
  currency: string;
  monthLabel?: string;
  onOpenMonthPicker?: () => void;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) {
    if (current <= 0) return 0;
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

export function QuickInsightsWidget({
  monthlySpent,
  monthlyIncome,
  previousSpent,
  previousIncome,
  currency,
  monthLabel = "This Month",
  onOpenMonthPicker,
}: QuickInsightsWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const savingsRate = useMemo(() => {
    if (monthlyIncome <= 0) return 0;
    return Math.max(
      0,
      Math.round(((monthlyIncome - monthlySpent) / monthlyIncome) * 100)
    );
  }, [monthlyIncome, monthlySpent]);

  const prevSavingsRate = useMemo(() => {
    if (previousIncome <= 0) return 0;
    return Math.max(
      0,
      Math.round(((previousIncome - previousSpent) / previousIncome) * 100)
    );
  }, [previousIncome, previousSpent]);

  const spentDelta = pctChange(monthlySpent, previousSpent);
  const incomeDelta = pctChange(monthlyIncome, previousIncome);
  const savingsDelta =
    previousIncome > 0 ? savingsRate - prevSavingsRate : null;

  const metrics = [
    {
      key: "spent",
      label: "Total spent",
      value: monthlySpent,
      delta: spentDelta,
      invert: true,
      isPercent: false,
    },
    {
      key: "income",
      label: "Total income",
      value: monthlyIncome,
      delta: incomeDelta,
      invert: false,
      isPercent: false,
    },
    {
      key: "savings",
      label: "Savings rate",
      value: savingsRate,
      delta: savingsDelta,
      invert: false,
      isPercent: true,
    },
  ] as const;

  return (
    <Section
      title="Quick Insights"
      subtitle="Month-to-date snapshot"
      icon={<TrendingUp size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={
        onOpenMonthPicker ? (
          <Pressable
            onPress={() => {
              void haptic.selection();
              onOpenMonthPicker();
            }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.monthChip,
              { backgroundColor: surfaces.tile },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Change month, currently ${monthLabel}`}
          >
            <Text
              style={[
                styles.monthChipText,
                {
                  color: theme.colors.mutedForeground,
                  fontFamily: theme.fontFamily.medium,
                },
              ]}
              numberOfLines={1}
            >
              {monthLabel}
            </Text>
            <ChevronDown size={12} color={theme.colors.mutedForeground} />
          </Pressable>
        ) : null
      }
    >
      {/* Three scan-metrics separated by hairlines instead of nested cards. */}
      <View style={styles.row}>
        {metrics.map((metric, idx) => (
          <View
            key={metric.key}
            style={[
              styles.metric,
              idx > 0 && { paddingLeft: 12 },
              idx < metrics.length - 1 && {
                paddingRight: 12,
                borderRightWidth: StyleSheet.hairlineWidth,
                borderRightColor: surfaces.divider,
              },
            ]}
          >
            <MetaLabel>{metric.label}</MetaLabel>
            {metric.isPercent ? (
              <Text
                style={[
                  styles.value,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.bold,
                  },
                ]}
                numberOfLines={1}
              >
                {metric.value}%
              </Text>
            ) : (
              <Amount
                value={metric.value}
                currency={currency}
                ghostable
                style={{
                  fontSize: 18,
                  letterSpacing: -0.5,
                  fontFamily: theme.fontFamily.bold,
                  color: theme.colors.foreground,
                }}
              />
            )}
            <TrendText delta={metric.delta} invert={metric.invert} />
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  monthChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: 128,
    minHeight: 32,
  },
  monthChipText: {
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
  },
  metric: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  value: {
    fontSize: 20,
    letterSpacing: -0.5,
  },
});

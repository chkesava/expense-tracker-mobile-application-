import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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

function ChangeChip({
  value,
  invertColors,
}: {
  value: number | null;
  invertColors?: boolean;
}) {
  const { theme } = useTheme();

  if (value === null) {
    return (
      <Text style={[styles.changeText, { color: theme.colors.mutedForeground }]}>
        vs last month
      </Text>
    );
  }

  // For spending, down is good; for income/savings, up is good
  const isPositiveOutcome = invertColors ? value <= 0 : value >= 0;
  const color = isPositiveOutcome ? theme.colors.success : theme.colors.destructive;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  const abs = Math.abs(value);

  return (
    <View style={styles.changeRow}>
      <Icon size={11} color={color} strokeWidth={2.4} />
      <Text style={[styles.changeText, { color }]}>
        {value >= 0 ? "↑" : "↓"} {abs}% vs last month
      </Text>
    </View>
  );
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
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

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

  const cards = [
    {
      key: "spent",
      label: "Total Spent",
      value: monthlySpent,
      delta: spentDelta,
      invert: true,
      iconBg: isDark ? "rgba(168, 85, 247, 0.22)" : "rgba(168, 85, 247, 0.12)",
      iconColor: "#A855F7",
      Icon: Target,
      isPercent: false,
    },
    {
      key: "income",
      label: "Total Income",
      value: monthlyIncome,
      delta: incomeDelta,
      invert: false,
      iconBg: isDark ? "rgba(52, 211, 153, 0.18)" : "rgba(34, 197, 94, 0.12)",
      iconColor: "#34D399",
      Icon: Wallet,
      isPercent: false,
    },
    {
      key: "savings",
      label: "Savings Rate",
      value: savingsRate,
      delta: savingsDelta,
      invert: false,
      iconBg: isDark ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.12)",
      iconColor: "#3B82F6",
      Icon: TrendingUp,
      isPercent: true,
    },
  ] as const;

  return (
    <Card
      title="Quick Insights"
      subtitle="Month-to-date snapshot"
      icon={
        <View
          style={[
            styles.headerIcon,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.2)"
                : "rgba(79, 70, 255, 0.12)",
            },
          ]}
        >
          <TrendingUp size={16} color={theme.colors.primary} />
        </View>
      }
      headerRight={
        onOpenMonthPicker ? (
          <Pressable
            onPress={onOpenMonthPicker}
            style={({ pressed }) => [
              styles.monthChip,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
                borderColor: theme.colors.border,
              },
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Change month"
          >
            <Text
              style={[styles.monthChipText, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              {monthLabel}
            </Text>
            <ChevronDown size={12} color={theme.colors.mutedForeground} />
          </Pressable>
        ) : null
      }
      radius="xxl"
    >
      <View style={styles.grid}>
        {cards.map((card) => (
          <View
            key={card.key}
            style={[
              styles.insightCard,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.035)"
                  : "rgba(0,0,0,0.025)",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={[styles.iconCircle, { backgroundColor: card.iconBg }]}>
              <card.Icon size={14} color={card.iconColor} strokeWidth={2.3} />
            </View>
            <Text
              style={[styles.cardLabel, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              {card.label}
            </Text>
            {card.isPercent ? (
              <Text
                style={[styles.percentValue, { color: theme.colors.foreground }]}
                numberOfLines={1}
              >
                {card.value}%
              </Text>
            ) : (
              <Amount
                value={card.value}
                currency={currency}
                ghostable
                style={{
                  fontSize: 15,
                  fontWeight: "800",
                  color: theme.colors.foreground,
                }}
              />
            )}
            <ChangeChip value={card.delta} invertColors={card.invert} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  monthChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 120,
  },
  monthChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    gap: 8,
  },
  insightCard: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  percentValue: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  changeText: {
    fontSize: 9,
    fontWeight: "700",
    flexShrink: 1,
  },
});

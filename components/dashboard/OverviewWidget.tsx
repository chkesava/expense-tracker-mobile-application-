import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, Calendar } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import {
  MetaLabel,
  Section,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export interface OverviewWidgetProps {
  totalBalance: number;
  monthlyIncome: number;
  monthlySpent: number;
  activeMonth: string;
  currency: string;
  isLoading?: boolean;
  onOpenMonthPicker: () => void;
}

export function OverviewWidget({
  totalBalance,
  monthlyIncome,
  monthlySpent,
  activeMonth,
  currency,
  isLoading,
  onOpenMonthPicker,
}: OverviewWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const netSavings = monthlyIncome - monthlySpent;
  const savingsRate =
    monthlyIncome > 0
      ? Math.max(0, Math.round((netSavings / monthlyIncome) * 100))
      : 0;

  return (
    <Section
      title="Total Net Balance"
      action={
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
          accessibilityLabel={`Change month, currently ${activeMonth}`}
        >
          <Calendar size={12} color={theme.colors.mutedForeground} strokeWidth={2.2} />
          <Text
            style={[
              styles.monthChipText,
              {
                color: theme.colors.mutedForeground,
                fontFamily: theme.fontFamily.medium,
              },
            ]}
          >
            {activeMonth}
          </Text>
        </Pressable>
      }
    >
      {/* The single largest number on the dashboard. */}
      <View style={styles.heroBlock}>
        {isLoading ? (
          <Skeleton width={200} height={40} borderRadius={8} />
        ) : (
          <Amount
            value={totalBalance}
            currency={currency}
            animated
            ghostable
            style={{
              fontSize: 36,
              lineHeight: 44,
              letterSpacing: -1.2,
              fontFamily: theme.fontFamily.bold,
              color:
                totalBalance >= 0
                  ? theme.colors.foreground
                  : theme.colors.destructive,
            }}
          />
        )}

        {monthlyIncome > 0 ? (
          <Text
            style={[
              styles.status,
              {
                color:
                  netSavings >= 0
                    ? theme.colors.success
                    : theme.colors.destructive,
                fontFamily: theme.fontFamily.medium,
              },
            ]}
          >
            {netSavings >= 0
              ? `${savingsRate}% saved this month`
              : "Deficit this month"}
          </Text>
        ) : null}
      </View>

      {/* Income vs expenses — a split row, not two more cards. */}
      <View style={[styles.splitRow, { borderTopColor: surfaces.divider }]}>
        <View style={styles.splitHalf}>
          <View style={styles.splitLabel}>
            <ArrowDownLeft size={13} color={theme.colors.success} strokeWidth={2.4} />
            <MetaLabel>Income</MetaLabel>
          </View>
          <Amount
            value={monthlyIncome}
            currency={currency}
            animated
            ghostable
            style={{
              fontSize: 17,
              letterSpacing: -0.4,
              fontFamily: theme.fontFamily.semibold,
              color: theme.colors.success,
            }}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: surfaces.divider }]} />

        <View style={[styles.splitHalf, styles.splitRight]}>
          <View style={styles.splitLabel}>
            <ArrowUpRight size={13} color={theme.colors.destructive} strokeWidth={2.4} />
            <MetaLabel>Expenses</MetaLabel>
          </View>
          <Amount
            value={monthlySpent}
            currency={currency}
            animated
            ghostable
            style={{
              fontSize: 17,
              letterSpacing: -0.4,
              fontFamily: theme.fontFamily.semibold,
              color: theme.colors.destructive,
            }}
          />
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  monthChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    minHeight: 32,
  },
  monthChipText: {
    fontSize: 12,
  },
  heroBlock: {
    gap: 2,
    marginBottom: 16,
  },
  status: {
    fontSize: 12.5,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  splitHalf: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  splitRight: {
    alignItems: "flex-end",
  },
  splitLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginHorizontal: 14,
  },
});

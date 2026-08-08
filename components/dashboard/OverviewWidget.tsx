import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, Calendar, TrendingUp } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const netSavings = monthlyIncome - monthlySpent;
  const savingsRate = monthlyIncome > 0 ? Math.max(0, Math.round((netSavings / monthlyIncome) * 100)) : 0;

  return (
    <View
      style={[
        styles.heroCard,
        theme.elevation[3],
        {
          backgroundColor: theme.colors.card,
          borderColor: isDark ? "rgba(107, 99, 255, 0.25)" : "rgba(79, 70, 255, 0.15)",
        },
      ]}
    >
      {/* Top Bar: Subtitle & MD3 Month Filter Chip */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <TrendingUp size={16} color={theme.colors.primary} />
          <Text style={[styles.heroSubtitle, { color: theme.colors.mutedForeground }]}>
            TOTAL NET BALANCE
          </Text>
        </View>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onOpenMonthPicker();
          }}
          android_ripple={{
            color: theme.colors.primary + "20",
            borderless: false,
          }}
          style={({ pressed }) => [
            styles.monthChip,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.15)"
                : "rgba(79, 70, 255, 0.08)",
              borderColor: isDark
                ? "rgba(107, 99, 255, 0.3)"
                : "rgba(79, 70, 255, 0.2)",
            },
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Change month, currently ${activeMonth}`}
        >
          <Calendar size={13} color={theme.colors.primary} />
          <Text style={[styles.monthChipText, { color: theme.colors.primary }]}>
            {activeMonth}
          </Text>
        </Pressable>
      </View>

      {/* Hero Display Amount */}
      <View style={styles.amountContainer}>
        {isLoading ? (
          <Skeleton width={180} height={38} borderRadius={8} style={{ marginVertical: 4 }} />
        ) : (
          <Amount
            value={totalBalance}
            currency={currency}
            animated
            ghostable
            style={{
              fontSize: 34,
              fontWeight: "900",
              letterSpacing: -0.5,
              color: totalBalance >= 0 ? theme.colors.foreground : theme.colors.destructive,
            }}
          />
        )}

        {monthlyIncome > 0 ? (
          <View style={styles.savingsBadge}>
            <Text
              style={[
                styles.savingsBadgeText,
                { color: netSavings >= 0 ? theme.colors.success : theme.colors.destructive },
              ]}
            >
              {netSavings >= 0 ? `+${savingsRate}% saved this month` : "Deficit this month"}
            </Text>
          </View>
        ) : null}
      </View>

      {/* MD3 Tonal Stat Cards (Income vs Spent) */}
      <View style={styles.tonalGrid}>
        {/* Income Card */}
        <View
          style={[
            styles.tonalCard,
            {
              backgroundColor: isDark
                ? "rgba(34, 197, 94, 0.12)"
                : "rgba(34, 197, 94, 0.08)",
              borderColor: isDark
                ? "rgba(34, 197, 94, 0.25)"
                : "rgba(34, 197, 94, 0.2)",
            },
          ]}
        >
          <View style={styles.tonalHeader}>
            <View style={[styles.iconCircle, { backgroundColor: "rgba(34, 197, 94, 0.2)" }]}>
              <ArrowDownLeft size={14} color="#22C55E" />
            </View>
            <Text style={[styles.tonalLabel, { color: theme.colors.mutedForeground }]}>
              Income
            </Text>
          </View>
          <Amount
            value={monthlyIncome}
            currency={currency}
            animated
            ghostable
            style={{
              color: isDark ? "#4ade80" : "#16a34a",
              fontSize: 17,
              fontWeight: "800",
            }}
          />
        </View>

        {/* Spent Card */}
        <View
          style={[
            styles.tonalCard,
            {
              backgroundColor: isDark
                ? "rgba(239, 68, 68, 0.12)"
                : "rgba(239, 68, 68, 0.08)",
              borderColor: isDark
                ? "rgba(239, 68, 68, 0.25)"
                : "rgba(239, 68, 68, 0.2)",
            },
          ]}
        >
          <View style={styles.tonalHeader}>
            <View style={[styles.iconCircle, { backgroundColor: "rgba(239, 68, 68, 0.2)" }]}>
              <ArrowUpRight size={14} color="#EF4444" />
            </View>
            <Text style={[styles.tonalLabel, { color: theme.colors.mutedForeground }]}>
              Expenses
            </Text>
          </View>
          <Amount
            value={monthlySpent}
            currency={currency}
            animated
            ghostable
            style={{
              color: isDark ? "#f87171" : "#dc2626",
              fontSize: 17,
              fontWeight: "800",
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  monthChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 32,
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  amountContainer: {
    gap: 4,
  },
  savingsBadge: {
    marginTop: 2,
  },
  savingsBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  tonalGrid: {
    flexDirection: "row",
    gap: 12,
  },
  tonalCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  tonalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tonalLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
});

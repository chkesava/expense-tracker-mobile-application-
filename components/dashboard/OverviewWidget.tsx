import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, Calendar } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
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

  return (
    <View
      style={[styles.overviewCard, theme.elevation[2], { backgroundColor: theme.colors.card }]}
    >
      <View style={styles.overviewHeader}>
        <Text
          style={[
            styles.overviewSubtitle,
            { color: theme.colors.mutedForeground },
          ]}
        >
          TOTAL BALANCE
        </Text>
        <Pressable
          onPress={onOpenMonthPicker}
          style={({ pressed }) => [
            styles.monthBadge,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
              borderColor: theme.colors.border,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Calendar
            size={12}
            color={theme.colors.primary}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[styles.monthBadgeText, { color: theme.colors.primary }]}
          >
            {activeMonth}
          </Text>
        </Pressable>
      </View>

      <View style={styles.amountRow}>
        {isLoading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Amount
            value={totalBalance}
            currency={currency}
            ghostable
            style={{ fontSize: 28, fontWeight: "900" }}
          />
        )}
      </View>

      {/* In / Out Stats */}
      <View
        style={[
          styles.statsRow,
          {
            borderTopColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.statBox}>
          <View style={styles.statLabelRow}>
            <ArrowDownLeft size={14} color={theme.colors.success} />
            <Text
              style={[
                styles.statLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Income
            </Text>
          </View>
          <Amount
            value={monthlyIncome}
            currency={currency}
            ghostable
            style={{
              color: theme.colors.success,
              fontSize: theme.typography.md,
              fontWeight: "700",
            }}
          />
        </View>

        <View
          style={[
            styles.statDivider,
            { backgroundColor: theme.colors.border },
          ]}
        />

        <View style={styles.statBox}>
          <View style={styles.statLabelRow}>
            <ArrowUpRight size={14} color={theme.colors.destructive} />
            <Text
              style={[
                styles.statLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Spent
            </Text>
          </View>
          <Amount
            value={monthlySpent}
            currency={currency}
            ghostable
            style={{
              color: theme.colors.foreground,
              fontSize: theme.typography.md,
              fontWeight: "700",
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overviewCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 4,
  },
  overviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  overviewSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  monthBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  monthBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  amountRow: {
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
  },
  statBox: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 16,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
});

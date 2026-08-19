import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import {
  MetaLabel,
  ProgressTrack,
  Section,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { useTheme } from "@/theme/ThemeProvider";

export interface CategoryBudgetAlertItem {
  id: string;
  category: string;
  subcategory?: string;
  amount: number;
  spent: number;
  pct: number;
  isOver: boolean;
  isWarning: boolean;
}

export interface BudgetAlertsWidgetProps {
  monthlyBudget: number;
  monthlySpent: number;
  currency: string;
  activeCategoryBudgets: CategoryBudgetAlertItem[];
  activeMonth: string;
}

export function BudgetAlertsWidget({
  monthlyBudget,
  monthlySpent,
  currency,
  activeCategoryBudgets,
  activeMonth,
}: BudgetAlertsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  /** Uncapped so "148% used" stays truthful; the bar itself clamps. */
  const budgetProgress =
    monthlyBudget > 0 ? Math.round((monthlySpent / monthlyBudget) * 100) : 0;

  const isOverBudget = monthlyBudget > 0 && monthlySpent > monthlyBudget;
  const remaining = Math.abs(monthlyBudget - monthlySpent);

  const statusColor = isOverBudget
    ? theme.colors.destructive
    : budgetProgress >= 80
      ? theme.colors.warning
      : theme.colors.success;

  if (monthlyBudget === 0 && activeCategoryBudgets.length === 0) {
    return (
      <Section
        title="Monthly Budget"
        icon={<Wallet size={16} color={theme.colors.mutedForeground} strokeWidth={2.3} />}
      >
        <EmptyState
          illustration="budgets"
          compact
          title="No Budget Configured"
          description="Set a monthly target to receive spending alerts and pacing forecasts."
          primaryAction={{
            label: "Configure Budget",
            onPress: () => router.push("/settings/money" as never),
          }}
          tip="Budgets help prevent overspending by alerting you at 80% and 100% thresholds."
        />
      </Section>
    );
  }

  return (
    <View style={styles.stack}>
      {monthlyBudget > 0 ? (
        <Section
          title="Monthly Budget"
          subtitle={`Target ${currency} ${monthlyBudget.toLocaleString()}`}
          icon={<Wallet size={16} color={statusColor} strokeWidth={2.3} />}
          iconTint={surfaces.wash(statusColor)}
          badge={
            <Text
              style={[
                styles.usedPct,
                { color: statusColor, fontFamily: theme.fontFamily.bold },
              ]}
            >
              {budgetProgress}%
            </Text>
          }
        >
          <ProgressTrack pct={budgetProgress} color={statusColor} height={8} />

          <View style={styles.footerRow}>
            <View style={styles.footerItem}>
              <MetaLabel>Spent</MetaLabel>
              <Amount
                value={monthlySpent}
                currency={currency}
                ghostable
                style={{
                  fontSize: 14.5,
                  fontFamily: theme.fontFamily.semibold,
                  color: theme.colors.foreground,
                }}
              />
            </View>
            <View style={[styles.footerItem, styles.footerRight]}>
              <MetaLabel>{isOverBudget ? "Over budget" : "Remaining"}</MetaLabel>
              <Amount
                value={remaining}
                currency={currency}
                ghostable
                style={{
                  fontSize: 14.5,
                  fontFamily: theme.fontFamily.semibold,
                  color: isOverBudget
                    ? theme.colors.destructive
                    : theme.colors.success,
                }}
              />
            </View>
          </View>
        </Section>
      ) : null}

      {activeCategoryBudgets.length > 0 ? (
        <Section
          title="Category Budgets"
          subtitle={`${activeMonth} · ${activeCategoryBudgets.length} budgeted`}
          contentStyle={styles.categoryList}
        >
          {activeCategoryBudgets.map((b) => {
            const color = b.isOver
              ? theme.colors.destructive
              : b.isWarning
                ? theme.colors.warning
                : theme.colors.success;
            return (
              <View key={b.id} style={styles.categoryItem}>
                <View style={styles.categoryTop}>
                  <Text
                    style={[
                      styles.categoryName,
                      {
                        color: theme.colors.foreground,
                        fontFamily: theme.fontFamily.medium,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {b.category}
                    {b.subcategory ? ` › ${b.subcategory}` : ""}
                  </Text>
                  <Text
                    style={[
                      styles.categoryMeta,
                      { color, fontFamily: theme.fontFamily.medium },
                    ]}
                  >
                    {b.pct}% · {currency} {b.spent.toLocaleString()} /{" "}
                    {b.amount.toLocaleString()}
                  </Text>
                </View>
                <ProgressTrack pct={b.pct} color={color} height={5} />
              </View>
            );
          })}
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  usedPct: {
    fontSize: 18,
    letterSpacing: -0.4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  footerItem: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  footerRight: {
    alignItems: "flex-end",
  },
  categoryList: {
    gap: 12,
  },
  categoryItem: {
    gap: 6,
  },
  categoryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  categoryName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
  },
  categoryMeta: {
    fontSize: 11,
  },
});

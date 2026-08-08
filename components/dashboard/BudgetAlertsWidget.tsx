import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AlertCircle, CheckCircle2, Flame, ShieldAlert } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/Card";
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

  const budgetProgress =
    monthlyBudget > 0
      ? Math.min(100, Math.round((monthlySpent / monthlyBudget) * 100))
      : 0;

  const remaining = Math.max(0, monthlyBudget - monthlySpent);
  const isOverBudget = monthlyBudget > 0 && monthlySpent > monthlyBudget;

  if (monthlyBudget === 0 && activeCategoryBudgets.length === 0) {
    return (
      <Card title="Monthly Budget">
        <EmptyState
          illustration="budgets"
          compact
          title="No Budget Configured"
          description="Set a monthly target to receive spending alerts and pacing forecasts."
          primaryAction={{
            label: "Configure Budget",
            onPress: () => router.push("/settings"),
          }}
          tip="Budgets help prevent overspending by alerting you at 80% and 100% thresholds."
        />
      </Card>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Monthly Budget Card */}
      {monthlyBudget > 0 ? (
        <Card
          title="Monthly Budget"
          subtitle={`Target: ${currency} ${monthlyBudget.toLocaleString()}`}
        >
          <View style={styles.budgetProgressContainer}>
            <View
              style={[
                styles.progressBarBg,
                { backgroundColor: theme.colors.muted },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(100, Math.max(2, budgetProgress))}%`,
                    backgroundColor: isOverBudget
                      ? theme.colors.destructive
                      : budgetProgress >= 80
                        ? theme.colors.warning
                        : theme.colors.primary,
                  },
                ]}
              />
            </View>
            <View style={styles.budgetFooter}>
              <View style={styles.statusRow}>
                {isOverBudget ? (
                  <ShieldAlert size={14} color={theme.colors.destructive} />
                ) : (
                  <CheckCircle2 size={14} color={theme.colors.success} />
                )}
                <Text
                  style={[
                    styles.budgetText,
                    {
                      color: isOverBudget
                        ? theme.colors.destructive
                        : theme.colors.mutedForeground,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {budgetProgress}% used {isOverBudget ? "(Over limit)" : ""}
                </Text>
              </View>

              <Amount
                value={remaining}
                currency={currency}
                ghostable
                style={{
                  fontSize: theme.typography.sm,
                  fontWeight: "700",
                  color: isOverBudget
                    ? theme.colors.destructive
                    : theme.colors.foreground,
                }}
              />
            </View>
          </View>
        </Card>
      ) : null}

      {/* Category Budgets & Warnings Card */}
      {activeCategoryBudgets.length > 0 ? (
        <Card
          title="Category Budgets"
          subtitle={`${activeMonth} · ${activeCategoryBudgets.length} budgeted`}
        >
          <View style={{ gap: 12 }}>
            {activeCategoryBudgets.map((b) => (
              <View key={b.id} style={{ gap: 4 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: theme.typography.sm,
                      fontWeight: "700",
                      color: theme.colors.foreground,
                    }}
                  >
                    {b.category}
                    {b.subcategory ? ` › ${b.subcategory}` : ""}
                  </Text>
                  <Text
                    style={{
                      fontSize: theme.typography.xs,
                      fontWeight: "600",
                      color: b.isOver
                        ? theme.colors.destructive
                        : b.isWarning
                          ? theme.colors.warning
                          : theme.colors.mutedForeground,
                    }}
                  >
                    {b.pct}% · {currency} {b.spent.toLocaleString()} / {currency}{" "}
                    {b.amount.toLocaleString()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.progressBarBg,
                    { backgroundColor: theme.colors.muted },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.max(2, b.pct))}%`,
                        backgroundColor: b.isOver
                          ? theme.colors.destructive
                          : b.isWarning
                            ? theme.colors.warning
                            : theme.colors.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  budgetProgressContainer: {
    gap: 8,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  budgetFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  budgetText: {
    fontSize: 12,
  },
});

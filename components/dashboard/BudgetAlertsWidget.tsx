import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import {
  MetaLabel,
  ProgressTrack,
  Section,
  StatusStrip,
  useSurfaces,
} from "@/components/dashboard/primitives";
import {
  budgetStatusMessage,
  type SpendlyBudget,
} from "@/shared/utils/spendlyBudget";
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
  budget: SpendlyBudget;
}

function statusColorOf(
  status: SpendlyBudget["status"],
  colors: { destructive: string; warning: string; success: string }
) {
  if (status === "attention") return colors.destructive;
  if (status === "watch") return colors.warning;
  return colors.success;
}

export function BudgetAlertsWidget({
  monthlyBudget,
  monthlySpent,
  currency,
  activeCategoryBudgets,
  activeMonth,
  budget,
}: BudgetAlertsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const statusColor = statusColorOf(budget.status, theme.colors);
  const remainingLabel = budget.isOverBudget ? "Over budget" : "Remaining";
  const remainingValue = Math.abs(budget.remaining);

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
              {budget.pctUsed}%
            </Text>
          }
        >
          <ProgressTrack pct={budget.pctUsed} color={statusColor} height={8} />

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
              <MetaLabel>{remainingLabel}</MetaLabel>
              <Amount
                value={remainingValue}
                currency={currency}
                ghostable
                style={{
                  fontSize: 14.5,
                  fontFamily: theme.fontFamily.semibold,
                  color: statusColor,
                }}
              />
            </View>
          </View>

          <View style={styles.forecastRow}>
            <View style={styles.footerItem}>
              <MetaLabel>Projected</MetaLabel>
              <Amount
                value={budget.projectedMonthEnd}
                currency={currency}
                ghostable
                style={{
                  fontSize: 13.5,
                  fontFamily: theme.fontFamily.semibold,
                  color: theme.colors.foreground,
                }}
              />
            </View>
            <View style={[styles.footerItem, styles.footerRight]}>
              <MetaLabel>Daily limit left</MetaLabel>
              <Amount
                value={budget.requiredDailyLimit}
                currency={currency}
                ghostable
                style={{
                  fontSize: 13.5,
                  fontFamily: theme.fontFamily.semibold,
                  color: theme.colors.foreground,
                }}
              />
            </View>
          </View>

          {budget.committedMonthly > 0 ? (
            <View style={styles.forecastRow}>
              <View style={styles.footerItem}>
                <MetaLabel>Committed left</MetaLabel>
                <Amount
                  value={budget.committedMonthly}
                  currency={currency}
                  ghostable
                  style={{
                    fontSize: 13.5,
                    fontFamily: theme.fontFamily.medium,
                    color: theme.colors.mutedForeground,
                  }}
                />
              </View>
              <View style={[styles.footerItem, styles.footerRight]}>
                <MetaLabel>Flexible</MetaLabel>
                <Amount
                  value={budget.flexibleRemaining}
                  currency={currency}
                  ghostable
                  style={{
                    fontSize: 13.5,
                    fontFamily: theme.fontFamily.medium,
                    color: theme.colors.mutedForeground,
                  }}
                />
              </View>
            </View>
          ) : null}

          <StatusStrip
            tone={
              budget.status === "attention"
                ? "negative"
                : budget.status === "watch"
                  ? "warning"
                  : "positive"
            }
            message={budgetStatusMessage(budget)}
          />
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
  forecastRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
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

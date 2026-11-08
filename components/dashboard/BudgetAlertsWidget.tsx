import { memo, useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Target, Wallet } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import {
  ProgressIndicator,
  type ProgressStatus,
} from "@/components/dashboard/ProgressIndicator";
import {
  MetaLabel,
  Pill,
  RowGlyph,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import {
  computeActiveCategoryBudgets,
  type CategoryBudgetAlertItem,
} from "@/shared/utils/dashboardWidgets";
import {
  budgetStatusMessage,
  type SpendlyBudget,
} from "@/shared/utils/spendlyBudget";
import { useTheme } from "@/theme/ThemeProvider";

export type { CategoryBudgetAlertItem };

export interface BudgetAlertsWidgetProps {
  monthlyBudget: number;
  monthlySpent: number;
  currency: string;
  activeCategoryBudgets?: CategoryBudgetAlertItem[];
  categoryTotals?: Record<string, number>;
  activeMonth: string;
  budget: SpendlyBudget;
  /** SPENDLY-718: stretch to the desktop dashboard row's height. */
  fill?: boolean;
  /**
   * SPENDLY-718: the desktop dashboard splits the stack so its lower row
   * stays balanced. `primary` is the Monthly Budget (or Category Budgets
   * when no monthly target is set, or the empty state); `rest` is Category
   * Budgets when the monthly card took the primary slot. `all` (default)
   * is both, as on phones.
   */
  part?: "all" | "primary" | "rest";
}

function statusColorOf(
  status: SpendlyBudget["status"],
  colors: { destructive: string; warning: string; success: string }
) {
  if (status === "attention") return colors.destructive;
  if (status === "watch") return colors.warning;
  return colors.success;
}

/** The monthly status mapped onto the shared progress vocabulary (KAN-62). */
function progressStatusOf(status: SpendlyBudget["status"]): ProgressStatus {
  if (status === "attention") return "over";
  if (status === "watch") return "watch";
  return "good";
}

/** One labelled figure in the monthly summary grid. */
function Figure({
  label,
  children,
  align = "left",
}: {
  label: string;
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <View style={[styles.figure, align === "right" && styles.figureRight]}>
      <MetaLabel>{label}</MetaLabel>
      {children}
    </View>
  );
}

/**
 * Budgets (SPENDLY-533): the monthly budget as one summary card (progress,
 * spent / remaining / projected / daily limit and the shared status message),
 * then the category budgets as progress rows. Every figure and threshold comes
 * from `computeSpendlyBudget` / `computeActiveCategoryBudgets`, as before;
 * status is always spelled out, never colour alone.
 */
export const BudgetAlertsWidget = memo(function BudgetAlertsWidget({
  monthlyBudget,
  monthlySpent,
  currency,
  activeCategoryBudgets: explicitActiveCategoryBudgets,
  categoryTotals,
  activeMonth,
  budget,
  fill = false,
  part = "all",
}: BudgetAlertsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { budgets: categoryBudgets } = useCategoryBudgets({
    enabled: explicitActiveCategoryBudgets === undefined,
  });

  const activeCategoryBudgets = useMemo(() => {
    if (explicitActiveCategoryBudgets !== undefined) {
      return explicitActiveCategoryBudgets;
    }
    if (!categoryBudgets || !categoryTotals) {
      return [];
    }
    return computeActiveCategoryBudgets(categoryBudgets, categoryTotals, activeMonth);
  }, [explicitActiveCategoryBudgets, categoryBudgets, categoryTotals, activeMonth]);

  const statusColor = statusColorOf(budget.status, theme.colors);
  const remainingLabel = budget.isOverBudget ? "Over budget" : "Remaining";
  const remainingValue = Math.abs(budget.remaining);
  const statusTone =
    budget.status === "attention"
      ? ("negative" as const)
      : budget.status === "watch"
        ? ("warning" as const)
        : ("positive" as const);

  const hasCategories = activeCategoryBudgets.length > 0;
  const showMonthly = part !== "rest" && monthlyBudget > 0;
  const showCategories =
    part === "all"
      ? hasCategories
      : part === "primary"
        ? monthlyBudget === 0 && hasCategories
        : monthlyBudget > 0 && hasCategories;

  if (monthlyBudget === 0 && !hasCategories) {
    if (part === "rest") return null;
    return (
      <Section
        fill={fill}
        title="Monthly Budget"
        icon={<Wallet size={16} color={theme.colors.mutedForeground} strokeWidth={2.3} />}
        iconTint={surfaces.tile}
      >
        <EmptyState
          illustration="budgets"
          compact
          title="No budget set yet"
          description="Set a monthly target to get spending alerts and a month-end forecast."
          primaryAction={{
            label: "Set a budget",
            onPress: () => router.push("/settings/money" as never),
          }}
        />
      </Section>
    );
  }

  if (!showMonthly && !showCategories) return null;

  return (
    <View style={[styles.stack, fill && styles.fill]} testID={part === "rest" ? "dash-budget-categories" : "dash-budget"}>
      {showMonthly ? (
        <Section
          // The last card in the stack takes the row's spare height.
          fill={fill && !showCategories}
          title="Monthly Budget"
          subtitle="Spending against this month's target"
          icon={<Wallet size={16} color={statusColor} strokeWidth={2.3} />}
          iconTint={surfaces.wash(statusColor)}
          badge={<Pill label={`${budget.pctUsed}% used`} tone={statusTone} />}
        >
          <ProgressIndicator
            pct={budget.pctUsed}
            status={progressStatusOf(budget.status)}
            height={8}
            label="Target"
            value={<FinancialAmount value={monthlyBudget} currency={currency} size="sm" tone="muted" />}
            statusLabel={budgetStatusMessage(budget)}
            accessibilityLabel={`Monthly budget, ${budget.pctUsed}% used`}
          />

          <View style={[styles.grid, { borderTopColor: surfaces.divider }]}>
            <View style={styles.gridRow}>
              <Figure label="Spent">
                <FinancialAmount value={monthlySpent} currency={currency} size="md" />
              </Figure>
              <Figure label={remainingLabel} align="right">
                <FinancialAmount
                  value={remainingValue}
                  currency={currency}
                  size="md"
                  sign={budget.isOverBudget ? "minus" : "none"}
                  tone={budget.isOverBudget ? "negative" : "positive"}
                />
              </Figure>
            </View>
            <View style={styles.gridRow}>
              <Figure label="Projected">
                <FinancialAmount value={budget.projectedMonthEnd} currency={currency} size="sm" />
              </Figure>
              <Figure label="Daily limit left" align="right">
                <FinancialAmount value={budget.requiredDailyLimit} currency={currency} size="sm" />
              </Figure>
            </View>
            {budget.committedMonthly > 0 ? (
              <View style={styles.gridRow}>
                <Figure label="Committed left">
                  <FinancialAmount
                    value={budget.committedMonthly}
                    currency={currency}
                    size="sm"
                    tone="muted"
                    weight="medium"
                  />
                </Figure>
                <Figure label="Flexible" align="right">
                  <FinancialAmount
                    value={budget.flexibleRemaining}
                    currency={currency}
                    size="sm"
                    tone="muted"
                    weight="medium"
                  />
                </Figure>
              </View>
            ) : null}
          </View>
        </Section>
      ) : null}

      {showCategories ? (
        <Section
          fill={fill}
          title="Category Budgets"
          subtitle={`${activeMonth} · ${activeCategoryBudgets.length} budgeted`}
          icon={<Target size={16} color={theme.colors.primary} strokeWidth={2.3} />}
          iconTint={surfaces.wash(theme.colors.primary)}
          action={
            monthlyBudget === 0 ? (
              <SectionAction
                label="Manage"
                onPress={() => router.push("/settings/money" as never)}
                accessibilityLabel="Manage budgets"
              />
            ) : null
          }
          contentStyle={styles.categoryList}
        >
          {activeCategoryBudgets.map((b) => {
            const status: ProgressStatus = b.isOver ? "over" : b.isWarning ? "watch" : "good";
            const statusLabel = b.isOver ? "Over limit" : b.isWarning ? "Close to limit" : "On track";
            const name = `${b.category}${b.subcategory ? ` › ${b.subcategory}` : ""}`;
            return (
              <ProgressIndicator
                key={b.id}
                pct={b.pct}
                status={status}
                height={5}
                leading={
                  <RowGlyph size={30} tint={surfaces.tile}>
                    <Text style={styles.glyph} accessible={false}>
                      {getCategoryIcon(b.category)}
                    </Text>
                  </RowGlyph>
                }
                label={name}
                value={
                  <View style={styles.spentOf}>
                    <FinancialAmount value={b.spent} currency={currency} size="xs" />
                    <Text
                      style={[styles.of, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
                    >
                      {" / "}
                    </Text>
                    <FinancialAmount
                      value={b.amount}
                      currency={currency}
                      size="xs"
                      tone="muted"
                      weight="medium"
                    />
                  </View>
                }
                statusLabel={statusLabel}
                trailing={`${b.pct}%`}
                accessibilityLabel={`${name}, ${b.pct}% of budget, ${statusLabel}`}
              />
            );
          })}
        </Section>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  fill: {
    flex: 1,
  },
  grid: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
  },
  figure: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  figureRight: {
    alignItems: "flex-end",
  },
  categoryList: {
    gap: 16,
  },
  glyph: {
    fontSize: 15,
  },
  spentOf: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 1,
  },
  of: {
    fontSize: 12,
  },
});

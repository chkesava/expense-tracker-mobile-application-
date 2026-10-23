import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Gauge, Lightbulb, TrendingDown, TrendingUp } from "lucide-react-native";

import { BudgetRow, BudgetUsageCard, OverBudgetAlert } from "@/components/budgets/BudgetParts";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { RowGlyph, useSurfaces } from "@/components/dashboard/primitives";
import { PageShell } from "@/components/layout/PageShell";
import { spendingSliceColor } from "@/components/spending/palette";
import {
  BreakdownCard,
  CategoryIcon,
  DataNote,
  DrilldownTabs,
  DrilldownTopBar,
  SpendingHero,
  SurfaceCard,
} from "@/components/spending/SpendingParts";
import { SpendingTransactionList } from "@/components/spending/SpendingTransactionList";
import { SpendingTrendPanel, TransactionComparisonCards } from "@/components/spending/SpendingTrendPanel";
import { Button } from "@/components/ui/Button";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useMonthExpenseRows, useSpendingSummaries } from "@/hooks/useSpendingDrilldown";
import { useGlobalMonth } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  BUDGET_DETAIL_TABS,
  budgetDayOfMonth,
  budgetDetailHref,
  budgetDetailInsights,
  budgetLabel,
  budgetStatusOf,
  budgetsHref,
  findBudget,
  type BudgetDetailTab,
} from "@/shared/utils/budgetDrilldown";
import { computeActiveCategoryBudgets } from "@/shared/utils/dashboardWidgets";
import { currentMonthKey, todayDateKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import { computeSpendlyBudget } from "@/shared/utils/spendlyBudget";
import {
  categorySpendSummary,
  decodeCategoryParam,
  resolveSpendingMonth,
  resolveSpendingTab,
  spendComparison,
} from "@/shared/utils/spendingDrilldown";
import { useTheme } from "@/theme/ThemeProvider";

const MANAGE_BUDGETS = "/settings/money" as Href;

/**
 * SPENDLY-575 — one budget's month: a category budget, or a subcategory budget
 * with `?sub=`. Spent is the summary's category (or "Parent::Sub") total, the
 * figure `computeActiveCategoryBudgets` compares against the limit; pace and
 * daily allowance come from `computeSpendlyBudget` run on this budget. Lists
 * use the same inclusion rule as the summary.
 */
export default function BudgetDetailScreen() {
  const params = useLocalSearchParams<{ category?: string; sub?: string; month?: string; tab?: string; filter?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { settings } = useSettings();
  const { globalMonth } = useGlobalMonth();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { isFromCache } = useExpenses();

  const category = decodeCategoryParam(params.category);
  const subcategory = decodeCategoryParam(params.sub) ?? undefined;
  const thisMonth = currentMonthKey(settings.timezone);
  const month = resolveSpendingMonth(params.month, globalMonth || thisMonth);
  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: "Overview" },
        { id: "transactions" as const, label: "Transactions" },
        // A subcategory budget has no subcategories of its own.
        ...(subcategory ? [] : [{ id: "subcategories" as const, label: "Subcategories" }]),
        { id: "insights" as const, label: "Insights" },
      ] satisfies Array<{ id: BudgetDetailTab; label: string }>,
    [subcategory]
  );
  const requestedTab = resolveSpendingTab(params.tab, BUDGET_DETAIL_TABS, "overview");
  const tab = tabs.some((t) => t.id === requestedTab) ? requestedTab : "overview";

  const { summaries, current, previous, loading: summaryLoading, error: summaryError } = useSpendingSummaries(month, 6);
  const { budgets, loading: budgetsLoading, error: budgetsError, retry } = useCategoryBudgets();
  const items = useMemo(
    () => computeActiveCategoryBudgets(budgets ?? [], current?.categoryTotals ?? {}, month),
    [budgets, current, month]
  );
  const budget = category ? findBudget(items, category, subcategory) : null;
  const totalsKey = category ? (subcategory ? `${category}::${subcategory}` : category) : "";
  const spent = Math.max(0, current?.categoryTotals?.[totalsKey] ?? 0);
  const previousSpent = previous ? Math.max(0, previous.categoryTotals?.[totalsKey] ?? 0) : null;
  const change = spendComparison(spent, previousSpent);
  const isCurrentMonth = month === thisMonth;
  const pace = useMemo(
    () =>
      computeSpendlyBudget({
        monthlyBudget: budget?.amount ?? 0,
        spent,
        monthKey: month,
        todayDay: budgetDayOfMonth(month, todayDateKey(settings.timezone)),
        remainingCommitted: 0,
      }),
    [budget?.amount, spent, month, settings.timezone]
  );

  const label = category ? budgetLabel({ category, subcategory }) : "Budget";
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(budgetsHref(month) as Href));
  const setMonth = (next: string) => router.setParams({ month: next });
  const setTab = (next: BudgetDetailTab) => router.setParams({ tab: next });
  const header = <DrilldownTopBar onBack={goBack} month={month} maxMonth={thisMonth} onChangeMonth={setMonth} />;

  if (!category) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <EmptyState
          illustration="budgets"
          title="Budget not found"
          description="This link doesn't name a category."
          primaryAction={{ label: "See all budgets", onPress: () => router.replace(budgetsHref(month) as Href) }}
        />
      </PageShell>
    );
  }

  const failure = summaryError && !current ? summaryError : budgetsError;
  if (failure && !budget) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <ErrorState title="Couldn't load this budget" description={failure.message} onRetry={budgetsError ? retry : undefined} />
      </PageShell>
    );
  }

  const loading = (summaryLoading && !current) || (budgetsLoading && items.length === 0);
  const status = budget ? budgetStatusOf(budget) : null;

  return (
    <PageShell contentContainerStyle={styles.content}>
      {header}
      {loading ? (
        <>
          <DashboardSkeleton variant="hero" />
          <DashboardSkeleton variant="section" rows={4} />
        </>
      ) : (
        <>
          <SpendingHero
            testID="budget-detail-hero"
            icon={<CategoryIcon category={category} color={theme.colors.primary} size={52} />}
            title={label}
            caption={budget ? `Budget · ${monthLabel(month)}` : `No budget · ${monthLabel(month)}`}
            amount={spent}
            currency={currency}
            change={change}
            previousLabel={change ? `${money(change.previous)} last month` : undefined}
          />

          {budget && status ? (
            <>
              <BudgetUsageCard spent={budget.spent} amount={budget.amount} status={status} currency={currency} />
              {status === "over" ? (
                <OverBudgetAlert overBy={budget.spent - budget.amount} currency={currency} onPress={() => setTab("transactions")} />
              ) : null}
            </>
          ) : (
            <SurfaceCard title="No budget for this month">
              <Text style={[styles.body, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                {`${label} has no budget for ${monthLabel(month, "long")}, so there is no limit to compare against. Its spending is shown below.`}
              </Text>
              <Button variant="outline" onPress={() => router.push(MANAGE_BUDGETS)}>
                Set a budget
              </Button>
            </SurfaceCard>
          )}

          {isFromCache ? <DataNote offline>You're offline — showing the figures saved on this device.</DataNote> : null}

          <DrilldownTabs tabs={tabs} value={tab} onChange={setTab} />

          {tab === "overview" ? (
            <>
              {budget && isCurrentMonth && pace.daysLeft > 0 && spent <= budget.amount ? (
                <PaceCard
                  daily={pace.requiredDailyLimit}
                  daysLeft={pace.daysLeft}
                  projected={pace.projectedMonthEnd}
                  limit={budget.amount}
                  currency={currency}
                />
              ) : null}
              <SpendingTrendPanel summaries={summaries} month={month} category={category} subcategory={subcategory} currency={currency} />
              <TransactionComparisonCards month={month} category={category} subcategory={subcategory} currency={currency} />
            </>
          ) : tab === "transactions" ? (
            <TransactionsTab
              key={typeof params.filter === "string" ? params.filter : "all"}
              month={month}
              category={category}
              subcategory={subcategory}
              spent={spent}
              totals={current?.categoryTotals}
              currency={currency}
              initialFilter={typeof params.filter === "string" ? params.filter : null}
            />
          ) : tab === "subcategories" ? (
            <SubcategoriesTab month={month} category={category} totals={current?.categoryTotals} items={items} currency={currency} />
          ) : (
            <InsightsTab
              insights={
                budget
                  ? budgetDetailInsights({
                      label,
                      spent,
                      amount: budget.amount,
                      pace,
                      isCurrentMonth,
                      previousSpent,
                      formatMoney: money,
                    })
                  : []
              }
              hasBudget={Boolean(budget)}
            />
          )}
        </>
      )}
    </PageShell>
  );
}

function PaceCard({
  daily,
  daysLeft,
  projected,
  limit,
  currency,
}: {
  daily: number;
  daysLeft: number;
  projected: number;
  limit: number;
  currency: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const overPace = projected > limit;
  const color = overPace ? theme.colors.warning : theme.colors.success;
  return (
    <SurfaceCard title="Pace">
      <View style={styles.paceRow}>
        <RowGlyph tint={surfaces.wash(color)}>
          <Gauge size={16} color={color} />
        </RowGlyph>
        <View style={styles.paceText}>
          <View style={styles.paceFigure}>
            <FinancialAmount value={daily} currency={currency} size="lg" weight="bold" />
            <Text style={[styles.body, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              {`a day for ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`}
            </Text>
          </View>
          <Text style={[styles.body, { color: overPace ? theme.colors.warning : theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {overPace
              ? `At the current rate this month ends near ${money(projected)}, above the ${money(limit)} budget.`
              : `At the current rate this month ends near ${money(projected)}, within budget.`}
          </Text>
        </View>
      </View>
    </SurfaceCard>
  );
}

function TransactionsTab({
  month,
  category,
  subcategory,
  spent,
  totals,
  currency,
  initialFilter,
}: {
  month: string;
  category: string;
  subcategory?: string;
  spent: number;
  totals: Record<string, number> | undefined;
  currency: string;
  initialFilter: string | null;
}) {
  const { theme } = useTheme();
  const { rows, loading, monthLoaded } = useMonthExpenseRows(month, category, subcategory);
  const options = subcategory
    ? []
    : categorySpendSummary(totals, category).subcategories.map((sub, i) => ({
        value: sub.key,
        label: sub.label,
        color: spendingSliceColor(i, sub.label, theme.colors, ""),
      }));
  return (
    <SpendingTransactionList
      rows={rows}
      loading={loading}
      monthLoaded={monthLoaded}
      summaryTotal={spent}
      currency={currency}
      filterLabel="Subcategory"
      filterOptions={options}
      filterKey="subcategory"
      initialFilter={initialFilter && options.some((o) => o.value === initialFilter) ? initialFilter : null}
      emptyTitle={`No spending in ${budgetLabel({ category, subcategory })} this month`}
    />
  );
}

function SubcategoriesTab({
  month,
  category,
  totals,
  items,
  currency,
}: {
  month: string;
  category: string;
  totals: Record<string, number> | undefined;
  items: ReturnType<typeof computeActiveCategoryBudgets>;
  currency: string;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const detail = categorySpendSummary(totals, category);
  const subBudgets = items.filter((b) => b.category === category && b.subcategory);
  return (
    <>
      {detail.total > 0 ? (
        <BreakdownCard
          title="Subcategory breakdown"
          items={detail.subcategories.map((sub, i) => ({
            key: sub.key,
            label: sub.label,
            amount: sub.amount,
            percentage: sub.percentage,
            color: spendingSliceColor(i, sub.label, theme.colors, ""),
          }))}
          currency={currency}
          formatMoney={money}
          shareOf={`of ${category}`}
          onPick={(index) => {
            const sub = detail.subcategories[index];
            if (sub) router.setParams({ tab: "transactions", filter: sub.key });
          }}
        />
      ) : (
        <EmptyState
          illustration="analytics"
          compact
          title={`No ${category} spending in ${monthLabel(month, "long")}`}
          description="Subcategories appear here once there is spending."
        />
      )}
      {subBudgets.length > 0 ? (
        <SurfaceCard title="Subcategory budgets" meta={`${subBudgets.length}`}>
          <View>
            {subBudgets.map((item, i) => (
              <BudgetRow
                key={item.id}
                item={item}
                currency={currency}
                divider={i < subBudgets.length - 1}
                onPress={() => router.push(budgetDetailHref(category, month, { subcategory: item.subcategory }) as Href)}
              />
            ))}
          </View>
        </SurfaceCard>
      ) : null}
    </>
  );
}

function InsightsTab({
  insights,
  hasBudget,
}: {
  insights: ReturnType<typeof budgetDetailInsights>;
  hasBudget: boolean;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  if (insights.length === 0) {
    return (
      <EmptyState
        illustration="budgets"
        compact
        title={hasBudget ? "Nothing to point out yet" : "Set a budget to see insights"}
        description={hasBudget ? "Insights appear as this month's spending builds up." : "Insights here compare spending with a limit."}
      />
    );
  }
  return (
    <SurfaceCard title="What stands out">
      {insights.map((insight, index) => {
        const Icon = insight.tone === "up" ? TrendingUp : insight.tone === "down" ? TrendingDown : Lightbulb;
        const color =
          insight.tone === "up" ? theme.colors.destructive : insight.tone === "down" ? theme.colors.success : theme.colors.info;
        return (
          <View
            key={insight.id}
            style={[
              styles.insightRow,
              index < insights.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
            ]}
          >
            <RowGlyph tint={surfaces.wash(color)}>
              <Icon size={16} color={color} />
            </RowGlyph>
            <View style={styles.insightText}>
              <Text style={[styles.insightTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
                {insight.title}
              </Text>
              <Text style={[styles.body, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                {insight.body}
              </Text>
            </View>
          </View>
        );
      })}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  body: { fontSize: 13, lineHeight: 18 },
  paceRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  paceText: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 4 },
  paceFigure: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  insightText: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 3 },
  insightTitle: { fontSize: 14.5 },
});

import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Lightbulb, Target, TrendingDown, TrendingUp } from "lucide-react-native";

import {
  BudgetRow,
  BudgetStatusCounts,
  OverallBudgetCard,
  budgetProgressStatus,
  budgetStatusColor,
} from "@/components/budgets/BudgetParts";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { RowGlyph, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { PageShell } from "@/components/layout/PageShell";
import { spendingSliceColor } from "@/components/spending/palette";
import {
  DataNote,
  DrilldownTabs,
  DrilldownTopBar,
  SpendingHero,
  SurfaceCard,
} from "@/components/spending/SpendingParts";
import { SpendingTransactionList } from "@/components/spending/SpendingTransactionList";
import { SpendingTrendPanel } from "@/components/spending/SpendingTrendPanel";
import { Button } from "@/components/ui/Button";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useMonthExpenseRows, useSpendingSummaries } from "@/hooks/useSpendingDrilldown";
import { useGlobalMonth } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import {
  BUDGET_OVERVIEW_TABS,
  budgetDayOfMonth,
  budgetDetailHref,
  budgetOverviewInsights,
  budgetStatusCounts,
  categoryBudgetRollup,
  monthlyBudgetHistory,
  rollupStatus,
  sortBudgetItems,
  unbudgetedSpending,
  type BudgetInsight,
  type BudgetOverviewTab,
} from "@/shared/utils/budgetDrilldown";
import { computeActiveCategoryBudgets, type CategoryBudgetAlertItem } from "@/shared/utils/dashboardWidgets";
import { currentMonthKey, todayDateKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import { budgetStatusMessage, computeSpendlyBudget } from "@/shared/utils/spendlyBudget";
import { monthWindow, resolveSpendingMonth, resolveSpendingTab } from "@/shared/utils/spendingDrilldown";
import { useTheme } from "@/theme/ThemeProvider";

const TABS: Array<{ id: BudgetOverviewTab; label: string }> = [
  { id: "categories", label: "Categories" },
  { id: "insights", label: "Insights" },
  { id: "trends", label: "Trends" },
  { id: "transactions", label: "Transactions" },
];

const MANAGE_BUDGETS = "/settings/money" as Href;

/**
 * SPENDLY-575 — Budget Progress, opened from the dashboard's budget row. Spent
 * figures are the month's `dashboard_{YYYY-MM}` summary (total for the monthly
 * budget, category totals for category budgets); budget figures and statuses
 * come from `computeSpendlyBudget` and `computeActiveCategoryBudgets`, the
 * functions the dashboard's budget cards already use. Month and tab live in the
 * route params.
 */
export default function BudgetProgressScreen() {
  const params = useLocalSearchParams<{ month?: string; tab?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const { globalMonth } = useGlobalMonth();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { isFromCache } = useExpenses();

  const thisMonth = currentMonthKey(settings.timezone);
  const month = resolveSpendingMonth(params.month, globalMonth || thisMonth);
  const tab = resolveSpendingTab(params.tab, BUDGET_OVERVIEW_TABS, "categories");
  const { summaries, current, loading: summaryLoading, error: summaryError } = useSpendingSummaries(month, 6);
  const { budgets, loading: budgetsLoading, error: budgetsError, retry } = useCategoryBudgets();

  const items = useMemo(
    () => sortBudgetItems(computeActiveCategoryBudgets(budgets ?? [], current?.categoryTotals ?? {}, month)),
    [budgets, current, month]
  );
  const monthlyBudget = Math.max(0, Number(settings.monthlyBudget) || 0);
  const isCurrentMonth = month === thisMonth;
  const monthly = useMemo(
    () =>
      computeSpendlyBudget({
        monthlyBudget,
        spent: current?.totalExpenses ?? 0,
        monthKey: month,
        todayDay: budgetDayOfMonth(month, todayDateKey(settings.timezone)),
        remainingCommitted: 0,
      }),
    [monthlyBudget, current, month, settings.timezone]
  );
  const rollup = useMemo(() => categoryBudgetRollup(items), [items]);
  const counts = budgetStatusCounts(items);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href));
  const setMonth = (next: string) => router.setParams({ month: next });
  const setTab = (next: BudgetOverviewTab) => router.setParams({ tab: next });
  const header = <DrilldownTopBar onBack={goBack} month={month} maxMonth={thisMonth} onChangeMonth={setMonth} />;

  const loading = (summaryLoading && !current) || (budgetsLoading && items.length === 0);
  const failure = summaryError && !current ? summaryError : budgetsError;

  if (failure && !loading && items.length === 0 && monthlyBudget === 0) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <ErrorState title="Couldn't load your budgets" description={failure.message} onRetry={budgetsError ? retry : undefined} />
      </PageShell>
    );
  }

  const hasMonthly = monthlyBudget > 0;
  const hasAny = hasMonthly || items.length > 0;
  const monthlyColor = monthly.isOverBudget
    ? theme.colors.destructive
    : monthly.status === "healthy"
      ? theme.colors.success
      : theme.colors.warning;
  const heroIcon = (
    <View style={[styles.heroIcon, { backgroundColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.18 : 0.1) }]}>
      <Target size={24} color={theme.colors.primary} strokeWidth={2} />
    </View>
  );

  return (
    <PageShell contentContainerStyle={styles.content}>
      {header}
      {loading ? (
        <>
          <DashboardSkeleton variant="hero" />
          <DashboardSkeleton variant="section" rows={4} />
        </>
      ) : !hasAny ? (
        <>
          <SpendingHero
            icon={heroIcon}
            title="Budget Progress"
            caption={monthLabel(month, "long")}
            amount={current?.totalExpenses ?? 0}
            currency={currency}
            change={null}
          />
          <EmptyState
            illustration="budgets"
            title={`No budgets for ${monthLabel(month, "long")}`}
            description="Set a monthly budget or category budgets to track your spending against a plan."
            primaryAction={{ label: "Set a budget", onPress: () => router.push(MANAGE_BUDGETS) }}
          />
        </>
      ) : (
        <>
          {hasMonthly ? (
            <OverallBudgetCard
              title="Monthly budget"
              caption={monthLabel(month)}
              spent={monthly.spent}
              budgeted={monthlyBudget}
              usedPct={monthlyBudget > 0 ? (monthly.spent / monthlyBudget) * 100 : 0}
              color={monthlyColor}
              currency={currency}
              daysLeft={isCurrentMonth ? monthly.daysLeft : null}
            />
          ) : (
            <OverallBudgetCard
              title="Across category budgets"
              caption={monthLabel(month)}
              spent={rollup.spent}
              budgeted={rollup.budgeted}
              usedPct={rollup.usedPct}
              color={budgetStatusColor(rollupStatus(rollup), theme.colors)}
              currency={currency}
              daysLeft={isCurrentMonth ? monthly.daysLeft : null}
            />
          )}
          {hasMonthly ? (
            <Text style={[styles.status, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              {budgetStatusMessage(monthly)}
            </Text>
          ) : null}

          {items.length > 0 ? <BudgetStatusCounts counts={counts} /> : null}

          {isFromCache ? <DataNote offline>You're offline — showing the figures saved on this device.</DataNote> : null}

          <DrilldownTabs tabs={TABS} value={tab} onChange={setTab} />

          {tab === "categories" ? (
            <CategoriesTab items={items} month={month} currency={currency} onManage={() => router.push(MANAGE_BUDGETS)} />
          ) : tab === "insights" ? (
            <InsightsTab
              insights={budgetOverviewInsights({
                items,
                monthly: hasMonthly ? monthly : null,
                monthlyBudget,
                isCurrentMonth,
                unbudgeted: unbudgetedSpending(current?.categoryTotals, items),
                formatMoney: money,
              })}
            />
          ) : tab === "trends" ? (
            <TrendsTab month={month} summaries={summaries} budgets={budgets ?? []} currency={currency} />
          ) : (
            <TransactionsTab month={month} items={items} current={current} currency={currency} />
          )}
        </>
      )}
    </PageShell>
  );
}

function CategoriesTab({
  items,
  month,
  currency,
  onManage,
}: {
  items: CategoryBudgetAlertItem[];
  month: string;
  currency: string;
  onManage: () => void;
}) {
  const router = useRouter();
  if (items.length === 0) {
    return (
      <EmptyState
        illustration="budgets"
        compact
        title={`No category budgets for ${monthLabel(month, "long")}`}
        description="Give a category its own limit to see it here, with its own status."
        primaryAction={{ label: "Add a category budget", onPress: onManage }}
      />
    );
  }
  return (
    <>
      <SurfaceCard title="Category budgets" meta={`${items.length} ${items.length === 1 ? "budget" : "budgets"}`}>
        <View>
          {items.map((item, i) => (
            <BudgetRow
              key={item.id}
              item={item}
              currency={currency}
              divider={i < items.length - 1}
              onPress={() => router.push(budgetDetailHref(item.category, month, { subcategory: item.subcategory }) as Href)}
            />
          ))}
        </View>
      </SurfaceCard>
      <Button variant="outline" onPress={onManage}>
        Manage budgets
      </Button>
    </>
  );
}

function InsightsTab({ insights }: { insights: BudgetInsight[] }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  if (insights.length === 0) {
    return (
      <EmptyState
        illustration="budgets"
        compact
        title="Nothing needs attention"
        description="Every budget is on track this month."
      />
    );
  }
  return (
    <SurfaceCard title="What needs attention">
      {insights.map((insight, index) => {
        const Icon = insight.tone === "up" ? TrendingUp : insight.tone === "down" ? TrendingDown : Lightbulb;
        const color =
          insight.tone === "up" ? theme.colors.destructive : insight.tone === "down" ? theme.colors.success : theme.colors.warning;
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
              <Text style={[styles.insightBody, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                {insight.body}
              </Text>
            </View>
          </View>
        );
      })}
    </SurfaceCard>
  );
}

function TrendsTab({
  month,
  summaries,
  budgets,
  currency,
}: {
  month: string;
  summaries: DashboardPeriodSummary[];
  budgets: Array<{ id: string; category: string; subcategory?: string; amount: number; month: string }>;
  currency: string;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const history = useMemo(
    () => monthlyBudgetHistory(budgets, summaries, monthWindow(month, 6), computeActiveCategoryBudgets).reverse(),
    [budgets, summaries, month]
  );
  return (
    <>
      <SpendingTrendPanel summaries={summaries} month={month} currency={currency} />
      <SurfaceCard title="Category budgets by month" meta="Last 6 months">
        {history.length === 0 ? (
          <DataNote>No category budgets in these months yet.</DataNote>
        ) : (
          history.map((point, i) => {
            const status = rollupStatus(point);
            return (
              <View
                key={point.month}
                style={[styles.historyRow, i < history.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}
                accessible
                accessibilityLabel={`${monthLabel(point.month, "long")}: ${money(point.spent)} of ${money(point.budgeted)}, ${Math.round(point.usedPct)}%`}
              >
                <View style={styles.historyTop}>
                  <Text style={[styles.historyMonth, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
                    {monthLabel(point.month)}
                  </Text>
                  <Text style={[styles.historyMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                    {`${money(point.spent)} of ${money(point.budgeted)}`}
                  </Text>
                  <Text style={[styles.historyPct, { color: budgetStatusColor(status, theme.colors), fontFamily: theme.fontFamily.semibold }]}>
                    {`${Math.round(point.usedPct)}%`}
                  </Text>
                </View>
                <ProgressIndicator
                  pct={Math.min(100, point.usedPct)}
                  status={budgetProgressStatus(status)}
                  height={5}
                />
              </View>
            );
          })
        )}
      </SurfaceCard>
    </>
  );
}

function TransactionsTab({
  month,
  items,
  current,
  currency,
}: {
  month: string;
  items: CategoryBudgetAlertItem[];
  current: DashboardPeriodSummary | null;
  currency: string;
}) {
  const { theme } = useTheme();
  const { rows, loading, monthLoaded } = useMonthExpenseRows(month);
  const budgeted = useMemo(() => [...new Set(items.map((b) => b.category))], [items]);
  const scoped = useMemo(() => rows.filter((r) => budgeted.includes(r.category)), [rows, budgeted]);
  const summaryTotal = budgeted.reduce((sum, c) => sum + (current?.categoryTotals?.[c] ?? 0), 0);
  const options = budgeted.map((c, i) => ({ value: c, label: c, color: spendingSliceColor(i, c, theme.colors, "") }));
  if (budgeted.length === 0) {
    return (
      <EmptyState
        illustration="budgets"
        compact
        title="No budgeted categories"
        description="Transactions in categories with a budget appear here."
      />
    );
  }
  return (
    <SpendingTransactionList
      rows={scoped}
      loading={loading}
      monthLoaded={monthLoaded}
      summaryTotal={summaryTotal}
      currency={currency}
      filterLabel="Category"
      filterOptions={options}
      filterKey="category"
      emptyTitle={`No spending in budgeted categories in ${monthLabel(month, "long")}`}
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  status: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4, marginTop: -4 },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  insightText: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 3 },
  insightTitle: { fontSize: 14.5 },
  insightBody: { fontSize: 13, lineHeight: 18 },
  historyRow: { paddingVertical: 10, gap: 6 },
  historyTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyMonth: { fontSize: 14, minWidth: 72 },
  historyMeta: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", fontSize: 12.5, fontVariant: ["tabular-nums"] },
  historyPct: { fontSize: 13.5, fontVariant: ["tabular-nums"] },
});

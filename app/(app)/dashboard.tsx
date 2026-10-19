import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ShieldAlert, Sparkles } from "lucide-react-native";

import { BudgetAlertsWidget } from "@/components/dashboard/BudgetAlertsWidget";
import { DashboardWelcome } from "@/components/dashboard/DashboardWelcome";
import { FinancialGoalsWidget } from "@/components/dashboard/FinancialGoalsWidget";
import { GamificationWidget } from "@/components/dashboard/GamificationWidget";
import { NetWorthWidget } from "@/components/dashboard/NetWorthWidget";
import { QuickAddWidget } from "@/components/dashboard/QuickAddWidget";
import { QuickInsightsWidget } from "@/components/dashboard/QuickInsightsWidget";
import { SafeToSpendWidget } from "@/components/dashboard/SafeToSpendWidget";
import { SmartInsightsWidget } from "@/components/dashboard/SmartInsightsWidget";
import { RecentActivityWidget } from "@/components/dashboard/RecentActivityWidget";
import { SubscriptionsWidget } from "@/components/dashboard/SubscriptionsWidget";
import { TopCategoriesWidget } from "@/components/dashboard/TopCategoriesWidget";
import { SetupChecklistWidget } from "@/components/dashboard/SetupChecklistWidget";
import {
  DASH_RADIUS,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { LazyMount } from "@/components/common/LazyMount";
import { DashboardEntrance } from "@/components/dashboard/DashboardEntrance";
import { ErrorState } from "@/components/common/ErrorState";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { PageShell } from "@/components/layout/PageShell";
import { sampleScrollFps, perfEvent, perfMark } from "@/lib/perf";
import { useSetupProgress } from "@/providers/SetupProgressProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useDashboardCashFlow } from "@/hooks/useDashboardCashFlow";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useAuth } from "@/providers/AuthProvider";
import { useGlobalMonth, useModalActions } from "@/providers/ModalProvider";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { useSettings } from "@/providers/SettingsProvider";
import {
  formatMonthLabel,
  type DateFormatOption,
} from "@/shared/utils/dateDisplay";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Expense, Income } from "@/shared/types/expense";
import {
  getOrderedDashboardWidgets,
  type DashboardWidgetId,
} from "@/shared/utils/dashboardWidgets";
import { currentMonthKey, formatDateKey } from "@/shared/utils/dates";
import { mergeRecentActivity, newestLiveExpenses } from "@/shared/utils/recentActivity";
import {
  computeSpendlyBudget,
  remainingCommittedThisMonth,
} from "@/shared/utils/spendlyBudget";
import { getNextRenewalDate } from "@/shared/utils/subscriptionProcessor";
import { useTheme } from "@/theme/ThemeProvider";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { GridItem, ResponsiveGrid } from "@/components/layout/ResponsiveGrid";

/**
 * SPENDLY-532 — first-viewport widgets, pinned ahead of the user's order when
 * enabled: the net-worth hero (with its account cards), then quick actions.
 * Income & expenses follows them; everything else keeps the user's order.
 */
const HERO_WIDGETS: DashboardWidgetId[] = ["overview", "quickAdd"];

const ABOVE_FOLD_WIDGETS: DashboardWidgetId[] = [
  "overview",
  "quickAdd",
  "focus",
];

function getPreviousMonthKey(month: string): string {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return month;
  const date = new Date(year, monthIndex - 1, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthChipLabel(
  month: string,
  dateFormat: DateFormatOption
): string {
  return formatMonthLabel(month, dateFormat) || "This Month";
}

export default function DashboardScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { isDuress } = useAuth();
  const { settings: system } = useSystemSettings();
  const displayCurrency = useDisplayCurrency();
  const { settings } = useSettings();
  const investmentsEnabled = useInvestmentsEnabled();
  const { globalMonth, setIsMonthDrawerOpen } = useGlobalMonth();
  const { setIsAddExpenseOpen, setIsAddSheetOpen, setEditingExpense, setEditingIncome } =
    useModalActions();

  const activeMonth = globalMonth || currentMonthKey(settings.timezone);
  const previousMonth = getPreviousMonthKey(activeMonth);
  const todayKey = formatDateKey(new Date(), settings.timezone);

  // One listener for the six-month window; the active and previous months are
  // read from it rather than from two more per-month doc listeners.
  const {
    summaries: cashFlowSummaries,
    loading: activeLoading,
    error: financeError,
  } = useDashboardCashFlow(activeMonth, 6);
  const activeSummary = useMemo(
    () => cashFlowSummaries.find((s) => s.period === activeMonth) ?? null,
    [cashFlowSummaries, activeMonth]
  );
  const previousSummary = useMemo(
    () => cashFlowSummaries.find((s) => s.period === previousMonth) ?? null,
    [cashFlowSummaries, previousMonth]
  );
  // SPENDLY-501: expenses and incomes are already loaded app-wide by
  // FinanceDataProvider, so the recent feed is derived from them instead of a
  // second `expenses` listener. Soft-deleted rows never show (SPENDLY-533).
  const { expenses: ledgerExpenses, loading: recentLoading } = useExpenses();
  const { incomes } = useIncomes();
  const recentExpenses = useMemo(() => newestLiveExpenses(ledgerExpenses, 5), [ledgerExpenses]);
  const recentActivity = useMemo(
    () => mergeRecentActivity(recentExpenses, incomes, 5),
    [recentExpenses, incomes]
  );

  const { accounts, loading: accountsLoading } = useAccounts();
  const { subscriptions } = useSubscriptions();
  const { markScreenVisited } = useSetupProgress();

  useEffect(() => {
    perfEvent("dashboard_mounted");
    markScreenVisited("dashboard");
  }, [markScreenVisited]);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const dataReadyEmittedRef = useRef(false);
  const hydratedEmittedRef = useRef(false);
  useEffect(() => {
    if (!activeLoading && !accountsLoading) {
      setRefreshing(false);
      if (!dataReadyEmittedRef.current) {
        dataReadyEmittedRef.current = true;
        perfMark("dashboard_data_ready");
      }
    }
  }, [activeLoading, accountsLoading]);

  const monthlySpent = activeSummary?.totalExpenses || 0;
  const monthlyIncome = activeSummary?.totalIncome || 0;
  const previousSpent = previousSummary?.totalExpenses || 0;
  const previousIncome = previousSummary?.totalIncome || 0;

  const recurringDueItems = useMemo(
    () =>
      subscriptions
        .filter((sub) => sub.isActive && !sub.isCompleted)
        .map((sub) => {
          const next = getNextRenewalDate(sub);
          return { amount: sub.amount || 0, dueDate: next.dateStr };
        }),
    [subscriptions]
  );

  const remainingCommitted = useMemo(
    () => remainingCommittedThisMonth(recurringDueItems, activeMonth, todayKey),
    [recurringDueItems, activeMonth, todayKey]
  );

  const monthBudget = useMemo(
    () =>
      computeSpendlyBudget({
        monthlyBudget: settings.monthlyBudget,
        spent: monthlySpent,
        monthKey: activeMonth,
        todayDay: Number(todayKey.slice(8, 10)) || 1,
        remainingCommitted,
      }),
    [settings.monthlyBudget, monthlySpent, activeMonth, todayKey, remainingCommitted]
  );

  const cashFlow = useMemo(() => {
    const result = [];
    let curMonth = activeMonth;
    for (let i = 0; i < 6; i++) {
       const summary = cashFlowSummaries.find(s => s.period === curMonth);
       result.unshift({
         month: curMonth,
         income: summary?.totalIncome || 0,
         spent: summary?.totalExpenses || 0,
         net: (summary?.totalIncome || 0) - (summary?.totalExpenses || 0)
       });
       curMonth = getPreviousMonthKey(curMonth);
    }
    
    return result;
  }, [cashFlowSummaries, activeMonth]);

  const orderedWidgetIds = useMemo(() => {
    return getOrderedDashboardWidgets(
      settings.dashboardOrder,
      settings.dashboardWidgets,
      investmentsEnabled
    );
  }, [settings.dashboardOrder, settings.dashboardWidgets, investmentsEnabled]);

  /** Hero widgets first (when enabled), then remaining widgets in user order. */
  const { displayWidgetIds, heroCount } = useMemo(() => {
    const hero = HERO_WIDGETS.filter((id) => orderedWidgetIds.includes(id));
    const rest = orderedWidgetIds.filter((id) => !HERO_WIDGETS.includes(id));
    return { displayWidgetIds: [...hero, ...rest], heroCount: hero.length };
  }, [orderedWidgetIds]);

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );

  const handleEditExpense = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setIsAddExpenseOpen(true);
  }, [setEditingExpense, setIsAddExpenseOpen]);

  // Same pair the ledger uses to open an income for editing.
  const handleEditIncome = useCallback((income: Income) => {
    setEditingIncome(income);
    setIsAddExpenseOpen(true);
  }, [setEditingIncome, setIsAddExpenseOpen]);

  const handleOpenAddSheet = useCallback(() => {
    setIsAddSheetOpen(true);
  }, [setIsAddSheetOpen]);

  const handleOpenMonthPicker = useCallback(() => {
    setIsMonthDrawerOpen(true);
  }, [setIsMonthDrawerOpen]);

  const handleViewLedger = useCallback(() => {
    router.push("/ledger");
  }, [router]);

  const activeMonthChipLabel = useMemo(
    () => formatMonthChipLabel(activeMonth, settings.dateFormat),
    [activeMonth, settings.dateFormat]
  );

  const renderWidget = (widgetId: DashboardWidgetId, index: number) => {
    const node = (() => {
      switch (widgetId) {
        case "overview":
          return (
            <NetWorthWidget key="overview" currency={displayCurrency} />
          );

        case "quickAdd":
          return (
            <QuickAddWidget
              key="quickAdd"
              onAddExpense={handleOpenAddSheet}
            />
          );

        case "budgetAlerts":
          return (
            <BudgetAlertsWidget
              key="budgetAlerts"
              monthlyBudget={settings.monthlyBudget}
              monthlySpent={monthlySpent}
              currency={displayCurrency}
              categoryTotals={activeSummary?.categoryTotals || {}}
              activeMonth={activeMonth}
              budget={monthBudget}
            />
          );

        case "topCategories":
          return (
            <TopCategoriesWidget
              key="topCategories"
              categoryTotals={activeSummary?.categoryTotals || null}
              currency={displayCurrency}
              activeMonth={activeMonth}
            />
          );

        case "recentActivity":
          return (
            <RecentActivityWidget
              key="recentActivity"
              items={recentActivity}
              currency={displayCurrency}
              loading={recentLoading && recentActivity.length === 0}
              accountNames={accountNames}
              onEditExpense={handleEditExpense}
              onEditIncome={handleEditIncome}
              onViewAll={handleViewLedger}
            />
          );

        case "financialGoals":
          return (
            <FinancialGoalsWidget
              key="financialGoals"
              currency={displayCurrency}
            />
          );

        case "insight":
        case "investments":
          return null;

        case "subscriptions":
          return (
            <SubscriptionsWidget
              key="subscriptions"
              currency={displayCurrency}
            />
          );

        case "focus":
          return (
            <SafeToSpendWidget
              key="focus"
              budget={monthBudget}
              currency={displayCurrency}
              loading={activeLoading && accountsLoading && accounts.length === 0}
            />
          );

        case "gamification":
          return (
            <GamificationWidget
              key="gamification"
            />
          );

        default:
          return null;
      }
    })();

    if (!node) return null;

    // SPENDLY-533: one short entrance per card, staggered by position. It runs
    // when the card mounts, so data updates never replay it.
    const card = <DashboardEntrance index={index}>{node}</DashboardEntrance>;

    if (ABOVE_FOLD_WIDGETS.includes(widgetId)) {
      return card;
    }

    const delayMs = 40 + Math.max(0, index) * 40;
    const isLastWidget = index === displayWidgetIds.length - 1;
    return (
      <LazyMount
        key={widgetId}
        delayMs={delayMs}
        minHeight={120}
        onMount={
          isLastWidget
            ? () => {
                if (!hydratedEmittedRef.current) {
                  hydratedEmittedRef.current = true;
                  perfMark("dashboard_hydrated");
                }
              }
            : undefined
        }
      >
        {card}
      </LazyMount>
    );
  };

  const insertInsightsAfter = displayWidgetIds.findIndex((id) => id === "budgetAlerts");

  const cashFlowOverview = (
    <DashboardEntrance index={heroCount}>
    <QuickInsightsWidget
      monthlySpent={monthlySpent}
      monthlyIncome={monthlyIncome}
      previousSpent={previousSpent}
      previousIncome={previousIncome}
      cashFlow={cashFlow}
      currency={displayCurrency}
      loading={activeLoading && monthlySpent === 0 && monthlyIncome === 0}
      unavailable={financeError ? "error" : !activeLoading && !activeSummary ? "missing" : null}
      monthLabel={activeMonthChipLabel}
      onOpenMonthPicker={handleOpenMonthPicker}
    />
    </DashboardEntrance>
  );

  return (
    <PageShell
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.container}
      onScrollBeginDrag={() => sampleScrollFps("dashboard")}
    >
      <DashboardWelcome
        monthLabel={activeMonthChipLabel}
        onOpenMonthPicker={handleOpenMonthPicker}
      />

      {isDuress ? (
        <View
          style={[
            styles.alertBanner,
            { backgroundColor: surfaces.wash(theme.colors.warning) },
          ]}
        >
          <ShieldAlert size={17} color={theme.colors.warning} strokeWidth={2.3} />
          <View style={styles.alertTextCol}>
            <Text
              style={[
                styles.alertTitle,
                {
                  color: theme.colors.warning,
                  fontFamily: theme.fontFamily.semibold,
                },
              ]}
            >
              Duress mode active
            </Text>
            <Text
              style={[
                styles.alertText,
                {
                  color: theme.colors.mutedForeground,
                  fontFamily: theme.fontFamily.regular,
                },
              ]}
            >
              Running isolated decoy session. Real ledger data is not loaded.
            </Text>
          </View>
        </View>
      ) : null}

      {system.announcementBanner ? (
        <View
          style={[
            styles.alertBanner,
            { backgroundColor: surfaces.wash(theme.colors.primary) },
          ]}
        >
          <Sparkles size={17} color={theme.colors.primary} strokeWidth={2.3} />
          <Text
            style={[
              styles.alertText,
              {
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.regular,
                flex: 1,
              },
            ]}
          >
            {system.announcementBanner}
          </Text>
        </View>
      ) : null}

      <WelcomeScreen />
      <SetupChecklistWidget />

      {financeError && recentExpenses.length === 0 && accounts.length === 0 ? (
        <ErrorState
          title="Couldn't load your dashboard"
          description={financeError.message}
        />
      ) : (
        // SPENDLY-559: one column on phones (same 12 gap as before), two on
        // tablet web, three on desktop web. The hero widgets and the cash-flow
        // overview keep a full row; order and slot positions are unchanged.
        <ResponsiveGrid gap={12}>
          {heroCount === 0 ? (
            <GridItem key="cashFlowOverview" span="full">{cashFlowOverview}</GridItem>
          ) : null}
          {displayWidgetIds.flatMap((widgetId, index) => {
            const items = [
              <GridItem key={widgetId} span={HERO_WIDGETS.includes(widgetId) ? "full" : 1}>
                {renderWidget(widgetId, index)}
              </GridItem>,
            ];
            if (index === heroCount - 1) {
              items.push(
                <GridItem key="cashFlowOverview" span="full">{cashFlowOverview}</GridItem>
              );
            }
            if (index === insertInsightsAfter || (insertInsightsAfter < 0 && index === 0)) {
              items.push(
                <GridItem key="smartInsights">
                  <LazyMount delayMs={120}>
                    <SmartInsightsWidget
                      expenses={recentExpenses}
                      monthlyBudget={settings.monthlyBudget}
                      currency={displayCurrency}
                      todayKey={todayKey}
                    />
                  </LazyMount>
                </GridItem>
              );
            }
            return items;
          })}
          {displayWidgetIds.length === 0 ? (
            <GridItem key="smartInsights">
              <LazyMount delayMs={120}>
                <SmartInsightsWidget
                  expenses={recentExpenses}
                  monthlyBudget={settings.monthlyBudget}
                  currency={displayCurrency}
                  todayKey={todayKey}
                />
              </LazyMount>
            </GridItem>
          ) : null}
        </ResponsiveGrid>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: DASH_RADIUS.tile,
    borderCurve: "continuous",
    marginBottom: 12,
  },
  alertTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  alertTitle: {
    fontSize: 13.5,
  },
  alertText: {
    fontSize: 12,
    lineHeight: 16,
  },
});

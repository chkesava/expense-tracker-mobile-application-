import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ShieldAlert, Sparkles, Inbox, ChevronRight } from "lucide-react-native";

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
  withAlpha,
} from "@/components/dashboard/primitives";
import { LazyMount } from "@/components/common/LazyMount";
import { ErrorState } from "@/components/common/ErrorState";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { PageShell } from "@/components/layout/PageShell";
import { sampleScrollFps, perfEvent, perfMark } from "@/lib/perf";
import { useSetupProgress } from "@/providers/SetupProgressProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSmsReviewInbox } from "@/hooks/useSmsReviewInbox";
import { useAuth } from "@/providers/AuthProvider";
import { useGlobalMonth, useModalActions } from "@/providers/ModalProvider";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { useSettings } from "@/providers/SettingsProvider";
import {
  formatMonthLabel,
  type DateFormatOption,
} from "@/shared/utils/dateDisplay";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Expense } from "@/shared/types/expense";
import {
  getOrderedDashboardWidgets,
  type DashboardWidgetId,
} from "@/shared/utils/dashboardWidgets";
import { formatDetectedCount } from "@/services/sms/smsReviewInbox";
import { currentMonthKey, formatDateKey, isInMonth } from "@/shared/utils/dates";
import {
  cashFlowByMonth,
  computeSpendlyBudget,
  oldestTrustedCashFlowMonth,
  remainingCommittedThisMonth,
  trimToTrustedCashFlow,
} from "@/shared/utils/spendlyBudget";
import { getNextRenewalDate } from "@/shared/utils/subscriptionProcessor";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

/** Critical first-viewport widgets: Safe to Spend, Quick Add, and Recent Activity. */
const HERO_WIDGETS: DashboardWidgetId[] = ["focus", "recentActivity"];

const ABOVE_FOLD_WIDGETS: DashboardWidgetId[] = [
  "focus",
  "quickAdd",
  "recentActivity",
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
  const { setIsAddExpenseOpen, setIsAddSheetOpen, setEditingExpense } =
    useModalActions();

  const {
    expenses,
    loading: expensesLoading,
    complete: expensesComplete,
    error: financeError,
    retry,
  } = useExpenses();
  const { incomes, loading: incomesLoading, complete: incomesComplete } = useIncomes();
  const { count: inboxCount } = useSmsReviewInbox();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { subscriptions } = useSubscriptions();
  const { markScreenVisited } = useSetupProgress();

  useEffect(() => {
    perfEvent("dashboard_mounted");
    markScreenVisited("dashboard");
  }, [markScreenVisited]);

  const [refreshing, setRefreshing] = useState(false);
  const activeMonth = globalMonth || currentMonthKey(settings.timezone);
  const previousMonth = getPreviousMonthKey(activeMonth);
  const todayKey = formatDateKey(new Date(), settings.timezone);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    retry();
  }, [retry]);

  const dataReadyEmittedRef = useRef(false);
  const hydratedEmittedRef = useRef(false);
  useEffect(() => {
    if (!expensesLoading && !incomesLoading && !accountsLoading) {
      setRefreshing(false);
      if (!dataReadyEmittedRef.current) {
        dataReadyEmittedRef.current = true;
        perfMark("dashboard_data_ready");
      }
    }
  }, [expensesLoading, incomesLoading, accountsLoading]);

  const monthlyExpenses = useMemo(() => {
    return expenses.filter((e) => isInMonth(e, activeMonth));
  }, [expenses, activeMonth]);

  const monthlyIncomes = useMemo(() => {
    return incomes.filter((i) => isInMonth(i, activeMonth));
  }, [incomes, activeMonth]);

  const previousExpenses = useMemo(() => {
    return expenses.filter((e) => isInMonth(e, previousMonth));
  }, [expenses, previousMonth]);

  const previousIncomes = useMemo(() => {
    return incomes.filter((i) => isInMonth(i, previousMonth));
  }, [incomes, previousMonth]);

  const monthlySpent = useMemo(() => {
    return monthlyExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [monthlyExpenses]);

  const monthlyIncome = useMemo(() => {
    return monthlyIncomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  }, [monthlyIncomes]);

  const previousSpent = useMemo(() => {
    return previousExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [previousExpenses]);

  const previousIncome = useMemo(() => {
    return previousIncomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  }, [previousIncomes]);

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

  const isOverviewEnabled = useMemo(() => {
    return (
      settings.dashboardOrder.length === 0 ||
      settings.dashboardOrder.includes("overview")
    );
  }, [settings.dashboardOrder]);

  const cashFlow = useMemo(() => {
    if (!isOverviewEnabled) return [];
    const flow = cashFlowByMonth(expenses, incomes, activeMonth, 6);
    // SPENDLY-413: the ledger is permanently staged to a recent-first page
    // (SPENDLY-409) — trim any leading months this session's data can't
    // vouch for instead of showing them as a fabricated zero.
    const cutoff = oldestTrustedCashFlowMonth(
      expenses,
      incomes,
      expensesComplete,
      incomesComplete
    );
    return trimToTrustedCashFlow(flow, cutoff);
  }, [isOverviewEnabled, expenses, incomes, expensesComplete, incomesComplete, activeMonth]);

  const orderedWidgetIds = useMemo(() => {
    return getOrderedDashboardWidgets(
      settings.dashboardOrder,
      settings.dashboardWidgets,
      investmentsEnabled
    );
  }, [settings.dashboardOrder, settings.dashboardWidgets, investmentsEnabled]);

  /** Hero widgets first (when enabled), then remaining widgets in user order. */
  const displayWidgetIds = useMemo(() => {
    const hero = HERO_WIDGETS.filter((id) => orderedWidgetIds.includes(id));
    const rest = orderedWidgetIds.filter((id) => !HERO_WIDGETS.includes(id));
    return [...hero, ...rest];
  }, [orderedWidgetIds]);

  const handleEditExpense = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setIsAddExpenseOpen(true);
  }, [setEditingExpense, setIsAddExpenseOpen]);

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
            <NetWorthWidget
              key="overview"
              currency={displayCurrency}
              cashFlow={cashFlow}
            />
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
              monthlyExpenses={monthlyExpenses}
              activeMonth={activeMonth}
              budget={monthBudget}
            />
          );

        case "topCategories":
          return (
            <TopCategoriesWidget
              key="topCategories"
              expenses={monthlyExpenses}
              currency={displayCurrency}
              activeMonth={activeMonth}
            />
          );

        case "recentActivity":
          return (
            <RecentActivityWidget
              key="recentActivity"
              expenses={expenses}
              currency={displayCurrency}
              loading={expensesLoading && expenses.length === 0}
              onEditExpense={handleEditExpense}
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
              loading={expensesLoading && accountsLoading && accounts.length === 0}
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

    if (ABOVE_FOLD_WIDGETS.includes(widgetId)) {
      return node;
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
        {node}
      </LazyMount>
    );
  };

  const insertInsightsAfter = displayWidgetIds.findIndex((id) => id === "budgetAlerts");

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

      {!isDuress && inboxCount > 0 ? (
        <Pressable
          onPress={() => {
            haptic.selection().catch(() => undefined);
            router.push("/sms-inbox" as any);
          }}
          android_ripple={{
            color: withAlpha(theme.colors.primary, 0.12),
            borderless: false,
          }}
          style={({ pressed }) => [
            styles.alertBanner,
            { backgroundColor: surfaces.wash(theme.colors.primary) },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open Transaction Inbox"
        >
          <Inbox size={17} color={theme.colors.primary} strokeWidth={2.3} />
          <View style={styles.alertTextCol}>
            <Text
              style={[
                styles.alertTitle,
                {
                  color: theme.colors.foreground,
                  fontFamily: theme.fontFamily.semibold,
                },
              ]}
            >
              Transaction inbox
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
              {formatDetectedCount(inboxCount)} — tap to Add or Ignore
            </Text>
          </View>
          <ChevronRight size={16} color={theme.colors.primary} />
        </Pressable>
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

      {financeError && expenses.length === 0 && accounts.length === 0 ? (
        <ErrorState
          title="Couldn't load your transactions"
          description={financeError.message}
          onRetry={financeError.retryable ? retry : undefined}
        />
      ) : (
        <View style={styles.widgetsGrid}>
          <QuickInsightsWidget
            monthlySpent={monthlySpent}
            monthlyIncome={monthlyIncome}
            previousSpent={previousSpent}
            previousIncome={previousIncome}
            currency={displayCurrency}
            loading={expensesLoading && monthlySpent === 0 && monthlyIncome === 0}
            monthLabel={activeMonthChipLabel}
            onOpenMonthPicker={handleOpenMonthPicker}
          />
          {displayWidgetIds.map((widgetId, index) => (
            <View key={widgetId}>
              {renderWidget(widgetId, index)}
              {index === insertInsightsAfter ||
              (insertInsightsAfter < 0 && index === 0) ? (
                <View style={styles.quickInsightsSlot}>
                  <LazyMount delayMs={120}>
                    <SmartInsightsWidget
                      expenses={expenses}
                      monthlyBudget={settings.monthlyBudget}
                      currency={displayCurrency}
                      todayKey={todayKey}
                    />
                  </LazyMount>
                </View>
              ) : null}
            </View>
          ))}
          {displayWidgetIds.length === 0 ? (
            <LazyMount delayMs={120}>
              <SmartInsightsWidget
                expenses={expenses}
                monthlyBudget={settings.monthlyBudget}
                currency={displayCurrency}
                todayKey={todayKey}
              />
            </LazyMount>
          ) : null}
        </View>
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
  widgetsGrid: {
    gap: 12,
  },
  quickInsightsSlot: {
    marginTop: 12,
    gap: 12,
  },
});

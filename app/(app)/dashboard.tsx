import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ShieldAlert, Sparkles, Inbox, ChevronRight } from "lucide-react-native";

import { BudgetAlertsWidget } from "@/components/dashboard/BudgetAlertsWidget";
import { DashboardWelcome } from "@/components/dashboard/DashboardWelcome";
import { FinancialGoalsWidget } from "@/components/dashboard/FinancialGoalsWidget";
import { FocusWidget } from "@/components/dashboard/FocusWidget";
import { GamificationWidget } from "@/components/dashboard/GamificationWidget";
import { InsightWidget } from "@/components/dashboard/InsightWidget";
import { InvestmentsWidget } from "@/components/dashboard/InvestmentsWidget";
import { OverviewWidget } from "@/components/dashboard/OverviewWidget";
import { QuickAddWidget } from "@/components/dashboard/QuickAddWidget";
import { QuickInsightsWidget } from "@/components/dashboard/QuickInsightsWidget";
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
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { PageShell } from "@/components/layout/PageShell";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";
import { sampleScrollFps } from "@/lib/perf";
import { useSetupProgress } from "@/providers/SetupProgressProvider";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useReceivables } from "@/hooks/useReceivables";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { useExpenses } from "@/hooks/useExpenses";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useIncomes } from "@/hooks/useIncomes";
import { useSmsReviewInbox } from "@/hooks/useSmsReviewInbox";
import { useAuth } from "@/providers/AuthProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Expense } from "@/shared/types/expense";
import { computeBankBalance } from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  computeExpenseStreak,
  getOrderedDashboardWidgets,
  type DashboardWidgetId,
} from "@/shared/utils/dashboardWidgets";
import { formatDetectedCount } from "@/services/sms/smsReviewInbox";
import { currentMonthKey, formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

/** Soft-pinned hero widgets shown first to match the reference layout. */
const HERO_WIDGETS: DashboardWidgetId[] = ["focus", "gamification"];

const ABOVE_FOLD_WIDGETS: DashboardWidgetId[] = [
  "focus",
  "gamification",
  "overview",
  "quickAdd",
  "budgetAlerts",
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

function formatMonthChipLabel(month: string): string {
  try {
    const [year, m] = month.split("-");
    const date = new Date(parseInt(year, 10), parseInt(m, 10) - 1, 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "This Month";
  }
}

export default function DashboardScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { isDuress } = useAuth();
  const { settings: system } = useSystemSettings();
  const { settings } = useSettings();
  const {
    globalMonth,
    setIsAddExpenseOpen,
    setIsMonthDrawerOpen,
    setEditingExpense,
  } = useModals();

  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { count: inboxCount } = useSmsReviewInbox();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { payments } = useAccountPayments();
  const { entries } = useAccountEntries();
  const { transfers } = useAccountTransfers();
  const { borrowings, repayments: borrowingRepayments } = useBorrowings();
  const { receivables, repayments: receivableRepayments } = useReceivables();
  const { budgets: categoryBudgets } = useCategoryBudgets();
  const { goals } = useFinancialGoals();
  const { markScreenVisited } = useSetupProgress();

  useEffect(() => {
    markScreenVisited("dashboard");
  }, [markScreenVisited]);

  const [refreshing, setRefreshing] = useState(false);

  const activeMonth = globalMonth || currentMonthKey(settings.timezone);
  const previousMonth = getPreviousMonthKey(activeMonth);
  const todayKey = formatDateKey(new Date());

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 600);
  };

  const monthlyExpenses = useMemo(() => {
    return expenses.filter(
      (e) =>
        e.month === activeMonth || (e.date && e.date.startsWith(activeMonth))
    );
  }, [expenses, activeMonth]);

  const monthlyIncomes = useMemo(() => {
    return incomes.filter(
      (i) =>
        i.month === activeMonth || (i.date && i.date.startsWith(activeMonth))
    );
  }, [incomes, activeMonth]);

  const previousExpenses = useMemo(() => {
    return expenses.filter(
      (e) =>
        e.month === previousMonth ||
        (e.date && e.date.startsWith(previousMonth))
    );
  }, [expenses, previousMonth]);

  const previousIncomes = useMemo(() => {
    return incomes.filter(
      (i) =>
        i.month === previousMonth ||
        (i.date && i.date.startsWith(previousMonth))
    );
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

  const todaySpent = useMemo(() => {
    return expenses
      .filter((e) => e.date === todayKey)
      .reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [expenses, todayKey]);

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  const totalBalance = useMemo(() => {
    const nonCreditAccounts = accounts.filter((acc) => {
      const typeName = typeMap.get(acc.typeId) || "";
      return getAccountKind(typeName) !== "credit";
    });

    if (nonCreditAccounts.length > 0) {
      return nonCreditAccounts.reduce((sum, acc) => {
        return (
          sum +
          computeBankBalance(
            acc,
            expenses,
            incomes,
            payments,
            entries,
            transfers,
            borrowings,
            borrowingRepayments,
            receivables,
            receivableRepayments
          )
        );
      }, 0);
    }

    const lifetimeIncome = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
    const lifetimeSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    return lifetimeIncome - lifetimeSpent;
  }, [
    accounts,
    typeMap,
    expenses,
    incomes,
    payments,
    entries,
    transfers,
    borrowings,
    borrowingRepayments,
    receivables,
    receivableRepayments,
  ]);

  const activeCategoryBudgets = useMemo(() => {
    const monthBudgets = categoryBudgets.filter((b) => b.month === activeMonth);
    if (monthBudgets.length === 0) return [];

    const spendingByCat = new Map<string, number>();
    monthlyExpenses.forEach((e) => {
      const key = e.subcategory
        ? `${e.category}::${e.subcategory}`
        : e.category;
      spendingByCat.set(key, (spendingByCat.get(key) || 0) + (e.amount || 0));
      if (e.subcategory) {
        spendingByCat.set(
          e.category,
          (spendingByCat.get(e.category) || 0) + (e.amount || 0)
        );
      }
    });

    return monthBudgets.map((b) => {
      const key = b.subcategory
        ? `${b.category}::${b.subcategory}`
        : b.category;
      const spent = spendingByCat.get(key) || 0;
      const pct =
        b.amount > 0 ? Math.min(100, Math.round((spent / b.amount) * 100)) : 0;
      return {
        ...b,
        spent,
        pct,
        isOver: spent > b.amount,
        isWarning: pct >= 80 && spent <= b.amount,
      };
    });
  }, [categoryBudgets, activeMonth, monthlyExpenses]);

  const loggingStreak = useMemo(() => {
    return computeExpenseStreak(expenses, todayKey);
  }, [expenses, todayKey]);

  const budgetHealthScore = useMemo(() => {
    if (!settings.monthlyBudget || settings.monthlyBudget <= 0) return 85;
    const ratio = monthlySpent / settings.monthlyBudget;
    if (ratio <= 0.8) return 95;
    if (ratio <= 1.0) return 80;
    if (ratio <= 1.2) return 55;
    return 35;
  }, [monthlySpent, settings.monthlyBudget]);

  const dailyBudgetTarget = useMemo(() => {
    if (!settings.monthlyBudget || settings.monthlyBudget <= 0) return 0;
    return settings.monthlyBudget / 30;
  }, [settings.monthlyBudget]);

  const orderedWidgetIds = useMemo(() => {
    return getOrderedDashboardWidgets(
      settings.dashboardOrder,
      settings.dashboardWidgets,
      settings.enableInvestments
    );
  }, [
    settings.dashboardOrder,
    settings.dashboardWidgets,
    settings.enableInvestments,
  ]);

  /** Hero widgets first (when enabled), then remaining widgets in user order. */
  const displayWidgetIds = useMemo(() => {
    const hero = HERO_WIDGETS.filter((id) => orderedWidgetIds.includes(id));
    const rest = orderedWidgetIds.filter((id) => !HERO_WIDGETS.includes(id));
    return [...hero, ...rest];
  }, [orderedWidgetIds]);

  const isLoading = expensesLoading || incomesLoading || accountsLoading;

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsAddExpenseOpen(true);
  };

  const renderWidget = (widgetId: DashboardWidgetId, index: number) => {
    const node = (() => {
      switch (widgetId) {
        case "overview":
          return (
            <OverviewWidget
              key="overview"
              totalBalance={totalBalance}
              monthlyIncome={monthlyIncome}
              monthlySpent={monthlySpent}
              activeMonth={activeMonth}
              currency={system.defaultCurrency}
              isLoading={isLoading}
              onOpenMonthPicker={() => setIsMonthDrawerOpen(true)}
            />
          );

        case "quickAdd":
          return (
            <QuickAddWidget
              key="quickAdd"
              onAddExpense={() => setIsAddExpenseOpen(true)}
            />
          );

        case "budgetAlerts":
          return (
            <BudgetAlertsWidget
              key="budgetAlerts"
              monthlyBudget={settings.monthlyBudget}
              monthlySpent={monthlySpent}
              currency={system.defaultCurrency}
              activeCategoryBudgets={activeCategoryBudgets}
              activeMonth={activeMonth}
            />
          );

        case "topCategories":
          return (
            <TopCategoriesWidget
              key="topCategories"
              expenses={monthlyExpenses}
              currency={system.defaultCurrency}
              activeMonth={activeMonth}
            />
          );

        case "recentActivity":
          return (
            <RecentActivityWidget
              key="recentActivity"
              expenses={expenses}
              currency={system.defaultCurrency}
              onEditExpense={handleEditExpense}
              onViewAll={() => router.push("/ledger")}
            />
          );

        case "financialGoals":
          return (
            <FinancialGoalsWidget
              key="financialGoals"
              goals={goals}
              currency={system.defaultCurrency}
            />
          );

        case "insight":
          return (
            <InsightWidget
              key="insight"
              expenses={monthlyExpenses}
              activeMonth={activeMonth}
              monthlyBudget={settings.monthlyBudget}
              currency={system.defaultCurrency}
            />
          );

        case "investments":
          return (
            <InvestmentsWidget
              key="investments"
              liquidBalance={totalBalance}
              currency={system.defaultCurrency}
            />
          );

        case "subscriptions":
          return (
            <SubscriptionsWidget
              key="subscriptions"
              currency={system.defaultCurrency}
            />
          );

        case "focus":
          return (
            <FocusWidget
              key="focus"
              todaySpent={todaySpent}
              dailyTarget={dailyBudgetTarget}
              currency={system.defaultCurrency}
            />
          );

        case "gamification":
          return (
            <GamificationWidget
              key="gamification"
              streak={loggingStreak}
              budgetHealthScore={budgetHealthScore}
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
    return (
      <LazyMount key={widgetId} delayMs={delayMs} minHeight={120}>
        {node}
      </LazyMount>
    );
  };

  /** Insert Quick Insights right after soft-pinned hero widgets. */
  const heroCount = displayWidgetIds.filter((id) =>
    HERO_WIDGETS.includes(id)
  ).length;

  return (
    <PageShell
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.container}
      onScrollBeginDrag={() => sampleScrollFps("dashboard")}
    >
      <DashboardWelcome
        monthLabel={formatMonthChipLabel(activeMonth)}
        onOpenMonthPicker={() => setIsMonthDrawerOpen(true)}
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
            Haptics.selectionAsync().catch(() => undefined);
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

      {isLoading && expenses.length === 0 && accounts.length === 0 ? (
        <DashboardSkeleton />
      ) : (
        <View style={styles.widgetsGrid}>
          {displayWidgetIds.map((widgetId, index) => (
            <View key={widgetId}>
              {renderWidget(widgetId, index)}
              {index === heroCount - 1 || (heroCount === 0 && index === -1) ? (
                <View style={styles.quickInsightsSlot}>
                  <QuickInsightsWidget
                    monthlySpent={monthlySpent}
                    monthlyIncome={monthlyIncome}
                    previousSpent={previousSpent}
                    previousIncome={previousIncome}
                    currency={system.defaultCurrency}
                    monthLabel={formatMonthChipLabel(activeMonth)}
                    onOpenMonthPicker={() => setIsMonthDrawerOpen(true)}
                  />
                  <SmartInsightsWidget
                    expenses={expenses}
                    monthlyBudget={settings.monthlyBudget}
                    currency={system.defaultCurrency}
                    todayKey={todayKey}
                  />
                </View>
              ) : null}
            </View>
          ))}

          {/* If no hero widgets enabled, still show Quick Insights at top */}
          {heroCount === 0 ? (
            <>
              <QuickInsightsWidget
                monthlySpent={monthlySpent}
                monthlyIncome={monthlyIncome}
                previousSpent={previousSpent}
                previousIncome={previousIncome}
                currency={system.defaultCurrency}
                monthLabel={formatMonthChipLabel(activeMonth)}
                onOpenMonthPicker={() => setIsMonthDrawerOpen(true)}
              />
              <SmartInsightsWidget
                expenses={expenses}
                monthlyBudget={settings.monthlyBudget}
                currency={system.defaultCurrency}
                todayKey={todayKey}
              />
            </>
          ) : null}
        </View>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 90,
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

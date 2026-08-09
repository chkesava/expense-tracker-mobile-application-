import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Home as HomeIcon, Plus, ShieldAlert, Sparkles } from "lucide-react-native";

import { BudgetAlertsWidget } from "@/components/dashboard/BudgetAlertsWidget";
import { FinancialGoalsWidget } from "@/components/dashboard/FinancialGoalsWidget";
import { FocusWidget } from "@/components/dashboard/FocusWidget";
import { GamificationWidget } from "@/components/dashboard/GamificationWidget";
import { InsightWidget } from "@/components/dashboard/InsightWidget";
import { InvestmentsWidget } from "@/components/dashboard/InvestmentsWidget";
import { OverviewWidget } from "@/components/dashboard/OverviewWidget";
import { QuickAddWidget } from "@/components/dashboard/QuickAddWidget";
import { RecentActivityWidget } from "@/components/dashboard/RecentActivityWidget";
import { SubscriptionsWidget } from "@/components/dashboard/SubscriptionsWidget";
import { TopCategoriesWidget } from "@/components/dashboard/TopCategoriesWidget";
import { SetupChecklistWidget } from "@/components/dashboard/SetupChecklistWidget";
import { LazyMount } from "@/components/common/LazyMount";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";
import { sampleScrollFps } from "@/lib/perf";
import { useSetupProgress } from "@/providers/SetupProgressProvider";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { useExpenses } from "@/hooks/useExpenses";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useIncomes } from "@/hooks/useIncomes";
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
import { currentMonthKey, formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const ABOVE_FOLD_WIDGETS: DashboardWidgetId[] = [
  "overview",
  "quickAdd",
  "budgetAlerts",
  "focus",
];

export default function DashboardScreen() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
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
  const { accounts, loading: accountsLoading } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { payments } = useAccountPayments();
  const { entries } = useAccountEntries();
  const { transfers } = useAccountTransfers();
  const { budgets: categoryBudgets } = useCategoryBudgets();
  const { goals } = useFinancialGoals();
  const { markScreenVisited } = useSetupProgress();

  useEffect(() => {
    markScreenVisited("dashboard");
  }, [markScreenVisited]);

  const [refreshing, setRefreshing] = useState(false);

  const activeMonth = globalMonth || currentMonthKey(settings.timezone);
  const todayKey = formatDateKey(new Date());

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 600);
  };

  // Filtered transactions for active month
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

  // Aggregated totals
  const monthlySpent = useMemo(() => {
    return monthlyExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [monthlyExpenses]);

  const monthlyIncome = useMemo(() => {
    return monthlyIncomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  }, [monthlyIncomes]);

  // Today's spending
  const todaySpent = useMemo(() => {
    return expenses
      .filter((e) => e.date === todayKey)
      .reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [expenses, todayKey]);

  // Account type map for kinds
  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  // Total balance computation
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
            transfers
          )
        );
      }, 0);
    }

    // Fallback if no bank accounts configured yet
    const lifetimeIncome = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
    const lifetimeSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    return lifetimeIncome - lifetimeSpent;
  }, [accounts, typeMap, expenses, incomes, payments, entries, transfers]);

  // Active month category budgets with spending
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

  // Streak & Budget health score
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

  // Daily budget target calculation
  const dailyBudgetTarget = useMemo(() => {
    if (!settings.monthlyBudget || settings.monthlyBudget <= 0) return 0;
    return settings.monthlyBudget / 30;
  }, [settings.monthlyBudget]);

  // Resolved widgets in user-configured order
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

    // Below-fold: defer mount to keep first dashboard frame light
    const delayMs = 40 + Math.max(0, index) * 40;
    return (
      <LazyMount key={widgetId} delayMs={delayMs} minHeight={120}>
        {node}
      </LazyMount>
    );
  };

  return (
    <PageShell
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.container}
      onScrollBeginDrag={() => sampleScrollFps("dashboard")}
    >
      <PageHeader
        title="Dashboard"
        subtitle="Financial Overview"
        icon={<HomeIcon size={22} color={theme.colors.primary} />}
      />

      {/* Duress Session Warning */}
      {isDuress ? (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: isDark
                ? "rgba(245, 158, 11, 0.15)"
                : "rgba(245, 158, 11, 0.1)",
              borderColor: theme.colors.warning,
            },
          ]}
        >
          <ShieldAlert size={18} color={theme.colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: theme.colors.warning }]}>
              Duress Mode Active
            </Text>
            <Text
              style={[
                styles.alertText,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Running isolated decoy session. Real ledger data is not loaded.
            </Text>
          </View>
        </View>
      ) : null}

      {/* System Announcement Banner */}
      {system.announcementBanner ? (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.15)"
                : "rgba(79, 70, 255, 0.08)",
              borderColor: theme.colors.primary,
            },
          ]}
        >
          <Sparkles size={18} color={theme.colors.primary} />
          <Text
            style={[
              styles.alertText,
              { color: theme.colors.foreground, flex: 1 },
            ]}
          >
            {system.announcementBanner}
          </Text>
        </View>
      ) : null}

      {/* Welcome Screen Modal for First-time users */}
      <WelcomeScreen />

      {/* Setup Checklist Widget */}
      <SetupChecklistWidget />

      {/* Dynamic Ordered Widgets or Shimmer Skeleton */}
      {isLoading && expenses.length === 0 && accounts.length === 0 ? (
        <DashboardSkeleton />
      ) : (
        <View style={styles.widgetsGrid}>
          {orderedWidgetIds.map((widgetId, index) => renderWidget(widgetId, index))}
        </View>
      )}

      {/* Material 3 Extended Floating Action Button (FAB) */}
      <View style={styles.fabContainer} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            setIsAddExpenseOpen(true);
          }}
          android_ripple={{
            color: "rgba(255, 255, 255, 0.28)",
            borderless: false,
          }}
          style={({ pressed }) => [
            styles.extendedFab,
            theme.elevation[4],
            {
              backgroundColor: theme.colors.primary,
            },
            pressed && { opacity: 0.9, transform: [{ scale: 0.96 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add new transaction"
        >
          <View style={styles.fabIcon}>
            <Plus size={20} color={theme.colors.primaryForeground} strokeWidth={2.6} />
          </View>
          <Text
            style={[
              styles.fabLabel,
              { color: theme.colors.primaryForeground },
            ]}
          >
            Log Expense
          </Text>
        </Pressable>
      </View>
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
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  alertText: {
    fontSize: 12,
    lineHeight: 16,
  },
  widgetsGrid: {
    gap: 14,
  },
  fabContainer: {
    position: "absolute",
    bottom: 20,
    right: 16,
    zIndex: 99,
  },
  extendedFab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    minHeight: 56,
  },
  fabIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  fabLabel: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});

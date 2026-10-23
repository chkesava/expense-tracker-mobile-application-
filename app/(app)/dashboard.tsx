import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ShieldAlert, Sparkles } from "lucide-react-native";

import { BudgetAlertsWidget } from "@/components/dashboard/BudgetAlertsWidget";
import { FinancialGoalsWidget } from "@/components/dashboard/FinancialGoalsWidget";
import { GamificationWidget } from "@/components/dashboard/GamificationWidget";
import { DashboardHero } from "@/components/dashboard/hero/DashboardHero";
import { AccountSummaryWidget, NetWorthWidget } from "@/components/dashboard/NetWorthWidget";
import { QuickAddWidget, QuickShortcutsWidget } from "@/components/dashboard/QuickAddWidget";
import { QuickInsightsWidget } from "@/components/dashboard/QuickInsightsWidget";
import { SafeToSpendWidget } from "@/components/dashboard/SafeToSpendWidget";
import { SmartInsightsWidget } from "@/components/dashboard/SmartInsightsWidget";
import { RecentActivityWidget } from "@/components/dashboard/RecentActivityWidget";
import { SubscriptionsWidget } from "@/components/dashboard/SubscriptionsWidget";
import { SpendingOverviewCard } from "@/components/dashboard/SpendingOverviewCard";
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
import { useReadModelFreshness } from "@/hooks/useReadModelFreshness";
import { ReadModelFreshnessBadge } from "@/components/common/ReadModelFreshnessBadge";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useUnifiedNetWorth } from "@/hooks/useUnifiedNetWorth";
import { useAuth } from "@/providers/AuthProvider";
import { useGlobalMonth, useModalActions } from "@/providers/ModalProvider";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  getMoreDashboardWidgets,
  type DashboardWidgetId,
} from "@/shared/utils/dashboardWidgets";
import { currentMonthKey, formatDateKey } from "@/shared/utils/dates";
import { mergeRecentActivity, newestLiveExpenses, type RecentActivityItem } from "@/shared/utils/recentActivity";
import { transactionHref } from "@/shared/utils/transactionRef";
import { transactionsHref } from "@/shared/utils/transactionsFeed";
import {
  computeSpendlyBudget,
  remainingCommittedThisMonth,
} from "@/shared/utils/spendlyBudget";
import { getNextRenewalDate } from "@/shared/utils/subscriptionProcessor";
import { ThemeOverride, useTheme } from "@/theme/ThemeProvider";
import { SpendlyUIScope } from "@/components/layout/SpendlyUIScope";
import { SideDrawer } from "@/components/SideDrawer";
import { dashboardMonthLabel } from "@/shared/utils/dashboardLabels";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { GridItem, ResponsiveGrid } from "@/components/layout/ResponsiveGrid";

/**
 * SPENDLY-566 — the Visual First dashboard draws the hero, net worth, quick
 * actions, Spending Overview and Recent Transactions in fixed places (see
 * `PINNED_DASHBOARD_WIDGETS`). The "More" cards below them keep the user's
 * saved order and toggles; these extra ids slot in around them.
 */
type MoreCardId = DashboardWidgetId | "cashFlow" | "accounts" | "shortcuts";

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
  const { setIsAddSheetOpen } =
    useModalActions();

  const activeMonth = globalMonth || currentMonthKey(settings.timezone);
  const previousMonth = getPreviousMonthKey(activeMonth);
  const todayKey = formatDateKey(new Date(), settings.timezone);

  // One listener for the six-month window; the active and previous months are
  // read from it rather than from two more per-month doc listeners.
  const {
    summaries: cashFlowSummaries,
    chartMonths: cashFlowChartMonths,
    loading: activeLoading,
    error: financeError,
  } = useDashboardCashFlow(activeMonth, 6);
  // SPENDLY-513: says so when the chart's older months are stale or fell back
  // (read-model `supabase` mode only; renders nothing otherwise).
  const cashFlowFreshness = useReadModelFreshness("cashFlow", ["expenses", "incomes"], null);
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
       const summary = cashFlowChartMonths.find(s => s.period === curMonth);
       result.unshift({
         month: curMonth,
         income: summary?.totalIncome || 0,
         spent: summary?.totalExpenses || 0,
         net: (summary?.totalIncome || 0) - (summary?.totalExpenses || 0)
       });
       curMonth = getPreviousMonthKey(curMonth);
    }
    
    return result;
  }, [cashFlowChartMonths, activeMonth]);

  // SPENDLY-566: one net-worth summary for the card and the account cards.
  // It reads providers the app already holds; no listener of its own.
  const netWorth = useUnifiedNetWorth({ progressive: true });

  /** "More" cards: user order and toggles, then the cards this layout moved down. */
  const moreCardIds = useMemo<MoreCardId[]>(() => {
    const more = getMoreDashboardWidgets(
      settings.dashboardOrder,
      settings.dashboardWidgets,
      investmentsEnabled
    );
    return ["cashFlow", ...more, "accounts", "shortcuts"];
  }, [settings.dashboardOrder, settings.dashboardWidgets, investmentsEnabled]);

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );

  // SPENDLY-576: a recent row opens its detail, where Edit and Delete live.
  const handleOpenActivity = useCallback(
    (item: RecentActivityItem) => {
      router.push(transactionHref({ kind: item.kind, id: item.row.id ?? "" }, item.row.accountId) as Href);
    },
    [router]
  );

  const handleOpenAddSheet = useCallback(() => {
    setIsAddSheetOpen(true);
  }, [setIsAddSheetOpen]);

  const handleOpenMonthPicker = useCallback(() => {
    setIsMonthDrawerOpen(true);
  }, [setIsMonthDrawerOpen]);

  // SPENDLY-576: "See all" opens the Transactions list for the month in view.
  const handleViewLedger = useCallback(() => {
    router.push(transactionsHref(activeMonth) as Href);
  }, [router, activeMonth]);

  // SPENDLY-572: "This month" / "Sep 2026", whatever the date-format pref.
  const activeMonthChipLabel = useMemo(
    () => dashboardMonthLabel(activeMonth, currentMonthKey(settings.timezone)),
    [activeMonth, settings.timezone]
  );
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const openProfile = useCallback(() => setIsProfileOpen(true), []);

  const summaryUnavailable = financeError
    ? ("error" as const)
    : !activeLoading && !activeSummary
      ? ("missing" as const)
      : null;

  const renderMoreCard = (id: MoreCardId) => {
    switch (id) {
      case "cashFlow":
        return (
          <>
          {/* SPENDLY-513: says so when the chart's older months are stale or fell back (read-model only). */}
          <ReadModelFreshnessBadge freshness={cashFlowFreshness} />
          <QuickInsightsWidget
            monthlySpent={monthlySpent}
            monthlyIncome={monthlyIncome}
            previousSpent={previousSpent}
            previousIncome={previousIncome}
            cashFlow={cashFlow}
            currency={displayCurrency}
            loading={activeLoading && monthlySpent === 0 && monthlyIncome === 0}
            unavailable={summaryUnavailable}
            monthLabel={activeMonthChipLabel}
            onOpenMonthPicker={handleOpenMonthPicker}
          />
          </>
        );

      case "budgetAlerts":
        return (
          <BudgetAlertsWidget
            monthlyBudget={settings.monthlyBudget}
            monthlySpent={monthlySpent}
            currency={displayCurrency}
            categoryTotals={activeSummary?.categoryTotals || {}}
            activeMonth={activeMonth}
            budget={monthBudget}
          />
        );

      case "financialGoals":
        return <FinancialGoalsWidget currency={displayCurrency} />;

      case "subscriptions":
        return <SubscriptionsWidget currency={displayCurrency} />;

      case "focus":
        return (
          <SafeToSpendWidget
            budget={monthBudget}
            currency={displayCurrency}
            loading={activeLoading && accountsLoading && accounts.length === 0}
          />
        );

      case "gamification":
        return <GamificationWidget />;

      case "accounts":
        return <AccountSummaryWidget netWorth={netWorth} currency={displayCurrency} />;

      case "shortcuts":
        return <QuickShortcutsWidget onOpenAddSheet={handleOpenAddSheet} />;

      default:
        return null;
    }
  };

  const smartInsights = (
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
  const insertInsightsAfter = Math.max(0, moreCardIds.indexOf("budgetAlerts"));

  // SPENDLY-572: the Visual First dashboard is always a dark scene (Midnight
  // Emerald), whatever the app theme; the profile drawer and every modal stay
  // on the user's theme because they render outside this override.
  return (
    <>
    <ThemeOverride themeName="midnight-emerald">
    <SpendlyUIScope>
    <PageShell
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.container}
      onScrollBeginDrag={() => sampleScrollFps("dashboard")}
      // SPENDLY-566: the hero carries the app bar and runs under the status bar.
      hideHeaderOffset
      // SPENDLY-572: the scene is the backdrop; no decorative aura blobs.
      withAura={false}
    >
      <DashboardHero onOpenProfile={openProfile} />

      {/* Rides up over the hero's fade (DASHBOARD_HERO_OVERLAP). */}
      <DashboardEntrance index={0}>
        <NetWorthWidget netWorth={netWorth} currency={displayCurrency} />
      </DashboardEntrance>

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
        // SPENDLY-559: one column on phones, two on tablet web, three on
        // desktop web. The Visual First sections keep a full row; the "More"
        // cards share columns.
        <ResponsiveGrid gap={14} style={styles.grid}>
          <GridItem key="quickAdd" span="full">
            <DashboardEntrance index={1}>
              <QuickAddWidget />
            </DashboardEntrance>
          </GridItem>

          <GridItem key="spendingOverview" span="full">
            <DashboardEntrance index={2}>
              <SpendingOverviewCard
                categoryTotals={activeSummary?.categoryTotals || null}
                currency={displayCurrency}
                activeMonth={activeMonth}
                monthLabel={activeMonthChipLabel}
                onOpenMonthPicker={handleOpenMonthPicker}
                loading={activeLoading && !activeSummary && !financeError}
                unavailable={summaryUnavailable}
                monthlyBudget={settings.monthlyBudget}
                budget={monthBudget}
              />
            </DashboardEntrance>
          </GridItem>

          <GridItem key="recentActivity" span="full">
            <DashboardEntrance index={3}>
              <RecentActivityWidget
                items={recentActivity}
                currency={displayCurrency}
                loading={recentLoading && recentActivity.length === 0}
                accountNames={accountNames}
                onOpen={handleOpenActivity}
                onViewAll={handleViewLedger}
              />
            </DashboardEntrance>
          </GridItem>

          {moreCardIds.flatMap((id, index) => {
            const node = renderMoreCard(id);
            if (!node) return [];
            const isLast = index === moreCardIds.length - 1;
            const items = [
              <GridItem key={id}>
                <LazyMount
                  delayMs={40 + index * 40}
                  minHeight={120}
                  onMount={
                    isLast
                      ? () => {
                          if (!hydratedEmittedRef.current) {
                            hydratedEmittedRef.current = true;
                            perfMark("dashboard_hydrated");
                          }
                        }
                      : undefined
                  }
                >
                  {/* SPENDLY-533: one short entrance per card, on mount only. */}
                  <DashboardEntrance index={4 + index}>{node}</DashboardEntrance>
                </LazyMount>
              </GridItem>,
            ];
            if (index === insertInsightsAfter) items.push(smartInsights);
            return items;
          })}
        </ResponsiveGrid>
      )}
    </PageShell>
    </SpendlyUIScope>
    </ThemeOverride>
    <SideDrawer isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  grid: {
    marginTop: 18,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: DASH_RADIUS.tile,
    borderCurve: "continuous",
    marginTop: 12,
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

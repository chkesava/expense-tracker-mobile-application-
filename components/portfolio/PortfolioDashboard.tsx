import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  BarChart3,
  Bell,
  Eye,
  LineChart,
  TrendingUp,
} from "lucide-react-native";

import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import type { PortfolioSubTabId } from "@/shared/config/navigation";
import { Chip } from "@/components/ui/Chip";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { OnboardingFlow } from "@/components/portfolio/OnboardingFlow";
import { PortfolioCharts } from "@/components/portfolio/PortfolioCharts";
import { PortfolioSummaryCard } from "@/components/portfolio/PortfolioSummaryCard";
import { TradingChargesCard } from "@/components/portfolio/TradingChargesCard";
import { ManageStockCashModal } from "@/components/portfolio/ManageStockCashModal";
import { HoldingsList } from "@/components/portfolio/HoldingsList";
import { WatchlistTab } from "@/components/portfolio/WatchlistTab";
import { AlertsTab } from "@/components/portfolio/AlertsTab";
import { OrdersTab } from "@/components/portfolio/OrdersTab";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { PortfolioDataProvider, usePortfolio } from "@/hooks/usePortfolio";
import {
  buildHoldingsWithMetrics,
  buildPortfolioSummary,
  quoteKeyFor,
} from "@/shared/features/portfolio/utils/portfolioMetrics";
import type {
  AllocationSlice,
  HoldingWithMetrics,
  PortfolioSummary,
} from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

type PortfolioSubTab = PortfolioSubTabId;

function PortfolioDashboardSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <DashboardSkeleton variant="hero" />
      <DashboardSkeleton variant="section" rows={3} />
    </View>
  );
}

export function PortfolioDashboard({
  listHeader,
  initialSubTab,
}: {
  listHeader?: ReactNode;
  /** SPENDLY-645: open on this sub-tab (deep link or a Markets shortcut). */
  initialSubTab?: PortfolioSubTab;
}) {
  return (
    <PortfolioDataProvider>
      <PortfolioDashboardInner listHeader={listHeader} initialSubTab={initialSubTab} />
    </PortfolioDataProvider>
  );
}

function PortfolioDashboardInner({
  listHeader,
  initialSubTab,
}: {
  listHeader?: ReactNode;
  initialSubTab?: PortfolioSubTab;
}) {
  const { theme } = useTheme();
  const portfolioColors = usePortfolioColors();
  const listBottomPadding = usePageListBottomPadding();
  const displayCurrency = useDisplayCurrency();

  const {
    holdings,
    watchlist,
    alerts,
    orders,
    snapshots,
    transactions,
    settings: portfolioSettings,
    cashBalance: investmentCashBalance,
    loading,
    saveSettings,
    saveDailySnapshot,
    addToWatchlist,
    removeFromWatchlist,
    addAlert,
    toggleAlert,
    deleteAlert,
    cancelOrder,
  } = usePortfolio();

  const [subTab, setSubTab] = useState<PortfolioSubTab>(initialSubTab ?? "holdings");
  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);

  const symbolRequests = useMemo(
    () =>
      [
        ...holdings.map((h) => ({
          symbol: quoteKeyFor(h),
          instrumentType: h.instrumentType,
        })),
        ...watchlist.map((w) => ({
          symbol: w.yahooSymbol,
          instrumentType: w.instrumentType,
        })),
      ],
    [holdings, watchlist]
  );

  const {
    quotes,
    isError: quotesFailed,
    errorMessage: quotesErrorMessage,
    refetch: refetchQuotes,
  } = useMarketQuotes(symbolRequests);

  // SPENDLY-388: one shared derivation, so the summary and every card reconcile.
  const holdingsWithMetrics: HoldingWithMetrics[] = useMemo(
    () => buildHoldingsWithMetrics(holdings, quotes),
    [holdings, quotes]
  );

  const summary: PortfolioSummary = useMemo(
    () => buildPortfolioSummary(holdingsWithMetrics, investmentCashBalance),
    [holdingsWithMetrics, investmentCashBalance]
  );

  const allocations: AllocationSlice[] = useMemo(() => {
    const byType = new Map<string, number>();
    holdingsWithMetrics.forEach((h) => {
      const existing = byType.get(h.instrumentType) ?? 0;
      byType.set(h.instrumentType, existing + h.currentValue);
    });
    const labels: Record<string, string> = {
      stock: "Stocks",
      etf: "ETFs",
      mutual_fund: "Mutual Funds",
      crypto: "Crypto",
      gold: "Gold",
    };
    return Array.from(byType.entries())
      .map(([type, value]) => ({
        label: labels[type] || type,
        value,
        color: portfolioColors.instrument(type),
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdingsWithMetrics, portfolioColors]);

  useEffect(() => {
    if (loading || !portfolioSettings?.onboardingComplete) return;
    void saveDailySnapshot({
      portfolioValue: summary.portfolioValue,
      investedValue: summary.totalInvested,
      profit: summary.overallGainLoss,
      profitPercent: summary.overallGainLossPercent,
      netWorth: summary.portfolioValue + summary.cashBalance,
    });
  }, [
    loading,
    portfolioSettings?.onboardingComplete,
    saveDailySnapshot,
    summary.cashBalance,
    summary.overallGainLoss,
    summary.overallGainLossPercent,
    summary.portfolioValue,
    summary.totalInvested,
  ]);

  const sparklineData = useMemo(() => {
    const historical = snapshots.slice(-6).map((snapshot) => snapshot.portfolioValue);
    return [...historical, summary.portfolioValue];
  }, [snapshots, summary.portfolioValue]);

  const cashModal = (
    <ManageStockCashModal
      visible={isCashModalOpen}
      onClose={() => setIsCashModalOpen(false)}
      currency={displayCurrency}
    />
  );

  if (loading) {
    return (
      <View style={styles.fill}>
        {listHeader}
        <PortfolioDashboardSkeleton />
        {cashModal}
      </View>
    );
  }

  if (!portfolioSettings?.onboardingComplete) {
    return (
      <View style={styles.fill}>
        {listHeader}
        <OnboardingFlow
          visible={true}
          currency={displayCurrency}
          onComplete={async (s) => {
            await saveSettings(s);
          }}
        />
        {cashModal}
      </View>
    );
  }

  const subTabs: Array<{
    id: PortfolioSubTab;
    label: string;
    icon: (color: string) => React.ReactNode;
  }> = [
    {
      id: "holdings",
      label: "Holdings",
      icon: (color) => <TrendingUp size={14} color={color} />,
    },
    {
      id: "watchlist",
      label: "Watchlist",
      icon: (color) => <Eye size={14} color={color} />,
    },
    {
      id: "orders",
      label: "Orders",
      icon: (color) => <LineChart size={14} color={color} />,
    },
    {
      id: "alerts",
      label: "Alerts",
      icon: (color) => <Bell size={14} color={color} />,
    },
    {
      id: "charts",
      label: "Analytics",
      icon: (color) => <BarChart3 size={14} color={color} />,
    },
  ];

  const chrome = (
    <View style={styles.chrome}>
      {quotesFailed ? (
        <Pressable
          onPress={refetchQuotes}
          accessibilityRole="button"
          style={[
            styles.quoteWarning,
            {
              backgroundColor: withAlpha(theme.colors.warning, 0.1),
              borderColor: withAlpha(theme.colors.warning, 0.33),
            },
          ]}
        >
          <Text style={{ color: theme.colors.warning, fontSize: 12, fontWeight: "700" }}>
            {quotesErrorMessage ?? "Live prices are unavailable right now."}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 11 }}>
            Showing your last known values. Tap to retry.
          </Text>
        </Pressable>
      ) : null}

      <PortfolioSummaryCard
        summary={summary}
        currency={displayCurrency}
        onManageCash={() => setIsCashModalOpen(true)}
      />

      {/* SPENDLY-526: from the already-loaded trades, no extra read. */}
      <TradingChargesCard transactions={transactions} currency={displayCurrency} />

      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabRow}
          accessibilityRole="tablist"
        >
          {subTabs.map((tab) => (
            <Chip
              key={tab.id}
              label={tab.label}
              selected={subTab === tab.id}
              appearance="outline"
              accessibilityRole="tab"
              haptic={subTab !== tab.id}
              icon={tab.icon}
              onPress={() => setSubTab(tab.id)}
            />
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>
    </View>
  );

  const otherTab =
    subTab === "watchlist" ? (
      <WatchlistTab
        watchlist={watchlist}
        quotes={quotes}
        currency={displayCurrency}
        onAdd={addToWatchlist}
        onRemove={removeFromWatchlist}
      />
    ) : subTab === "orders" ? (
      <OrdersTab
        orders={orders}
        currency={displayCurrency}
        onCancel={cancelOrder}
      />
    ) : subTab === "alerts" ? (
      <AlertsTab
        alerts={alerts}
        onAdd={addAlert}
        onToggle={toggleAlert}
        onDelete={deleteAlert}
      />
    ) : subTab === "charts" ? (
      <PortfolioCharts
        allocations={allocations}
        sparklineData={sparklineData}
        currency={displayCurrency}
      />
    ) : null;

  if (subTab === "holdings") {
    return (
      <View style={styles.fill}>
        <HoldingsList
          holdings={holdingsWithMetrics}
          listHeader={
            <View>
              {listHeader}
              {chrome}
            </View>
          }
        />
        {cashModal}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: listBottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {listHeader}
        {chrome}
        {otherTab}
      </ScrollView>
      {cashModal}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    minHeight: 0,
  },
  chrome: {
    gap: 14,
    paddingBottom: 14,
  },
  quoteWarning: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  subTabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  scrollContent: {
    gap: 12,
  },
  skeletonWrap: {
    gap: 14,
    paddingTop: 4,
  },
  pressed: {
    opacity: 0.84,
  },
});

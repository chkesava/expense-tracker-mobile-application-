import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  BarChart3,
  Bell,
  Eye,
  LineChart,
  TrendingUp,
} from "lucide-react-native";

import { CARD_ORANGE } from "@/components/accounts/accountScreenTheme";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";
import { BOTTOM_NAV_FAB_GAP, BOTTOM_NAV_FAB_SIZE } from "@/components/layout/chrome";
import { OnboardingFlow } from "@/components/portfolio/OnboardingFlow";
import { PortfolioCharts } from "@/components/portfolio/PortfolioCharts";
import { PortfolioSummaryCard } from "@/components/portfolio/PortfolioSummaryCard";
import { ManageStockCashModal } from "@/components/portfolio/ManageStockCashModal";
import { HoldingsList } from "@/components/portfolio/HoldingsList";
import { WatchlistTab } from "@/components/portfolio/WatchlistTab";
import { AlertsTab } from "@/components/portfolio/AlertsTab";
import { OrdersTab } from "@/components/portfolio/OrdersTab";
import { haptic } from "@/lib/haptics";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { computePositionMetrics } from "@/shared/types/market";
import type {
  AllocationSlice,
  HoldingWithMetrics,
  PortfolioSummary,
} from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

type PortfolioSubTab = "holdings" | "watchlist" | "orders" | "alerts" | "charts";

const INSTRUMENT_COLORS: Record<string, string> = {
  stock: "#3B82F6",
  etf: "#14B8A6",
  mutual_fund: "#8B5CF6",
  crypto: "#F59E0B",
  gold: "#EAB308",
};

const ACTIVE_ACTION_FG = "#111827";

function PortfolioDashboardSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <View style={styles.skeletonWrap}>
      <View
        style={[
          styles.skeletonHero,
          {
            backgroundColor: isDark ? "#0B100E" : "#F4FBF6",
            borderColor: isDark ? "rgba(74, 222, 128, 0.28)" : "rgba(22, 163, 74, 0.2)",
          },
        ]}
      >
        <Skeleton width={160} height={12} borderRadius={4} />
        <Skeleton width={200} height={34} borderRadius={8} />
        <Skeleton width={180} height={16} borderRadius={6} />
        <View style={styles.skeletonMetrics}>
          <Skeleton width="30%" height={48} borderRadius={10} />
          <Skeleton width="30%" height={48} borderRadius={10} />
          <Skeleton width="30%" height={48} borderRadius={10} />
        </View>
      </View>
      <View style={styles.skeletonActions}>
        <Skeleton width={96} height={36} borderRadius={18} />
        <Skeleton width={96} height={36} borderRadius={18} />
        <Skeleton width={96} height={36} borderRadius={18} />
      </View>
      <Skeleton width="100%" height={48} borderRadius={16} />
      <SkeletonList count={3} />
    </View>
  );
}

export function PortfolioDashboard({ listHeader }: { listHeader?: ReactNode }) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const {
    holdings,
    watchlist,
    alerts,
    orders,
    snapshots,
    settings: portfolioSettings,
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

  const [subTab, setSubTab] = useState<PortfolioSubTab>("holdings");
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);

  const symbolRequests = useMemo(
    () =>
      [
        ...holdings.map((h) => ({
          symbol: h.yahooSymbol,
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

  const holdingsWithMetrics: HoldingWithMetrics[] = useMemo(() => {
    return holdings.map((h) => {
      const quote = quotes.get(h.yahooSymbol);
      const currentPrice = quote?.currentPrice ?? h.averageBuyPrice;
      const hasLiveQuote = !!quote;
      const metrics = computePositionMetrics(
        currentPrice,
        h.quantity,
        h.averageBuyPrice
      );
      return {
        ...h,
        currentPrice,
        investedValue: metrics.investedValue,
        currentValue: metrics.currentValue,
        profit: metrics.profitLoss,
        profitPercent: metrics.returnPercent,
        dayChange: quote?.dayChange ?? 0,
        dayChangePercent: quote?.dayChangePercent ?? 0,
        hasLiveQuote,
      };
    });
  }, [holdings, quotes]);

  const summary: PortfolioSummary = useMemo(() => {
    let portfolioValue = 0;
    let totalInvested = 0;
    let todayGainLoss = 0;
    let topGainer: HoldingWithMetrics | null = null;
    let topLoser: HoldingWithMetrics | null = null;

    holdingsWithMetrics.forEach((h) => {
      portfolioValue += h.currentValue;
      totalInvested += h.investedValue;
      todayGainLoss += h.dayChange * h.quantity;

      if (!topGainer || h.profitPercent > topGainer.profitPercent) topGainer = h;
      if (!topLoser || h.profitPercent < topLoser.profitPercent) topLoser = h;
    });

    const overallGainLoss = portfolioValue - totalInvested;
    const overallGainLossPercent =
      totalInvested > 0 ? (overallGainLoss / totalInvested) * 100 : 0;
    const todayGainLossPercent =
      portfolioValue > 0
        ? (todayGainLoss / (portfolioValue - todayGainLoss)) * 100
        : 0;

    return {
      portfolioValue,
      todayGainLoss,
      todayGainLossPercent,
      overallGainLoss,
      overallGainLossPercent,
      totalInvested,
      totalHoldings: holdingsWithMetrics.length,
      cashBalance: portfolioSettings?.cashBalance ?? 0,
      topGainer,
      topLoser,
    };
  }, [holdingsWithMetrics, portfolioSettings]);

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
        color: INSTRUMENT_COLORS[type] || "#6B7280",
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdingsWithMetrics]);

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
      currency={system.defaultCurrency}
    />
  );

  if (loading) {
    return (
      <View style={styles.fill}>
        {listHeader}
        <PortfolioDashboardSkeleton isDark={isDark} />
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
          currency={system.defaultCurrency}
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
              backgroundColor: theme.colors.warning + "1A",
              borderColor: theme.colors.warning + "55",
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
        currency={system.defaultCurrency}
        onManageCash={() => setIsCashModalOpen(true)}
      />

      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabRow}
        >
          {subTabs.map((tab) => {
            const active = subTab === tab.id;
            const iconColor = active
              ? ACTIVE_ACTION_FG
              : isDark
                ? "#F8FAFC"
                : theme.colors.foreground;
            return (
              <Pressable
                key={tab.id}
                onPress={() => {
                  void haptic.selection();
                  setSubTab(tab.id);
                }}
                style={({ pressed }) => [
                  styles.subTabPill,
                  {
                    backgroundColor: active
                      ? CARD_ORANGE
                      : isDark
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(0,0,0,0.04)",
                    borderColor: active
                      ? CARD_ORANGE
                      : isDark
                        ? "rgba(148,163,184,0.16)"
                        : theme.colors.border,
                  },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
              >
                {tab.icon(iconColor)}
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? "800" : "600",
                    color: active ? ACTIVE_ACTION_FG : theme.colors.foreground,
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </HorizontalSwipeBoundary>
    </View>
  );

  const otherTab =
    subTab === "watchlist" ? (
      <WatchlistTab
        watchlist={watchlist}
        quotes={quotes}
        currency={system.defaultCurrency}
        onAdd={addToWatchlist}
        onRemove={removeFromWatchlist}
      />
    ) : subTab === "orders" ? (
      <OrdersTab
        orders={orders}
        currency={system.defaultCurrency}
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
        currency={system.defaultCurrency}
      />
    ) : null;

  if (subTab === "holdings") {
    return (
      <View style={styles.fill}>
        <HoldingsList
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
        contentContainerStyle={styles.scrollContent}
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
  subTabPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 6,
    flexShrink: 0,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: BOTTOM_NAV_FAB_SIZE + BOTTOM_NAV_FAB_GAP + 8,
  },
  skeletonWrap: {
    gap: 14,
    paddingTop: 4,
  },
  skeletonHero: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 18,
    gap: 12,
    alignItems: "center",
  },
  skeletonMetrics: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  skeletonActions: {
    flexDirection: "row",
    gap: 8,
  },
  pressed: {
    opacity: 0.84,
  },
});

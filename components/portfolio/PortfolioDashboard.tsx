import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import {
  BarChart3,
  Eye,
  LineChart,
  TrendingUp,
} from "lucide-react-native";

import { SkeletonHero, SkeletonChart, SkeletonList } from "@/components/common/Skeleton";

import { OnboardingFlow } from "@/components/portfolio/OnboardingFlow";
import { PortfolioCharts } from "@/components/portfolio/PortfolioCharts";
import { PortfolioSummaryCard } from "@/components/portfolio/PortfolioSummaryCard";
import { ManageStockCashModal } from "@/components/portfolio/ManageStockCashModal";
import { HoldingsList } from "@/components/portfolio/HoldingsList";
import { WatchlistTab } from "@/components/portfolio/WatchlistTab";
import { AlertsTab } from "@/components/portfolio/AlertsTab";
import { OrdersTab } from "@/components/portfolio/OrdersTab";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { computePositionMetrics } from "@/shared/types/market";
import type {
  AllocationSlice,
  HoldingWithMetrics,
  PortfolioSummary,
  MarketQuote,
} from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

type PortfolioSubTab = "holdings" | "watchlist" | "orders" | "alerts" | "charts";

const INSTRUMENT_COLORS: Record<string, string> = {
  stock: "#3B82F6",
  etf: "#14B8A6",
  mutual_fund: "#8B5CF6",
  crypto: "#F59E0B",
  gold: "#EAB308",
};

export function PortfolioDashboard() {
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

  // Gather symbols for live quotes
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

  // Compute HoldingWithMetrics
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

  // Compute PortfolioSummary
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

      if (!topGainer || h.profitPercent > topGainer.profitPercent)
        topGainer = h;
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

  // Allocations for donut
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

  // Use persisted daily snapshots. The current value keeps the graph useful
  // before tomorrow's snapshot exists, without fabricating market data.
  const sparklineData = useMemo(() => {
    const historical = snapshots.slice(-6).map((snapshot) => snapshot.portfolioValue);
    return [...historical, summary.portfolioValue];
  }, [snapshots, summary.portfolioValue]);

  if (loading) {
    return (
      <View style={{ gap: 16, paddingVertical: 8 }}>
        <SkeletonHero />
        <SkeletonChart height={160} />
        <SkeletonList count={3} />
      </View>
    );
  }

  // Onboarding gate
  if (!portfolioSettings?.onboardingComplete) {
    return (
      <OnboardingFlow
        visible={true}
        currency={system.defaultCurrency}
        onComplete={async (s) => {
          await saveSettings(s);
        }}
      />
    );
  }

  const subTabs: Array<{ id: PortfolioSubTab; label: string; icon: React.ReactNode }> = [
    { id: "holdings", label: "Holdings", icon: <TrendingUp size={14} color={subTab === "holdings" ? "#FFF" : theme.colors.foreground} /> },
    { id: "watchlist", label: "Watchlist", icon: <Eye size={14} color={subTab === "watchlist" ? "#FFF" : theme.colors.foreground} /> },
    { id: "orders", label: "Orders", icon: <LineChart size={14} color={subTab === "orders" ? "#FFF" : theme.colors.foreground} /> },
    { id: "alerts", label: "Alerts", icon: <Eye size={14} color={subTab === "alerts" ? "#FFF" : theme.colors.foreground} /> },
    { id: "charts", label: "Analytics", icon: <BarChart3 size={14} color={subTab === "charts" ? "#FFF" : theme.colors.foreground} /> },
  ];

  return (
    <View style={styles.container}>
      {/* Live prices unavailable: the figures below fall back to average buy
          price, so say so instead of presenting them as current. */}
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

      {/* Portfolio Summary */}
      <PortfolioSummaryCard
        summary={summary}
        currency={system.defaultCurrency}
        onManageCash={() => setIsCashModalOpen(true)}
      />

      {/* Sub-tab pills */}
      <View style={styles.subTabRow}>
        {subTabs.map((tab) => {
          const active = subTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setSubTab(tab.id);
              }}
              style={[
                styles.subTabPill,
                {
                  backgroundColor: active
                    ? theme.colors.primary
                    : isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                  borderColor: active
                    ? theme.colors.primary
                    : theme.colors.border,
                },
              ]}
            >
              {tab.icon}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  marginLeft: 6,
                  color: active
                    ? "#FFF"
                    : theme.colors.foreground,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Active Tab View */}
      {subTab === "holdings" && <HoldingsList />}

      {subTab === "watchlist" && (
        <WatchlistTab
          watchlist={watchlist}
          quotes={quotes}
          currency={system.defaultCurrency}
          onAdd={addToWatchlist}
          onRemove={removeFromWatchlist}
        />
      )}

      {subTab === "orders" && (
        <OrdersTab
          orders={orders}
          currency={system.defaultCurrency}
          onCancel={cancelOrder}
        />
      )}

      {subTab === "alerts" && (
        <AlertsTab
          alerts={alerts}
          onAdd={addAlert}
          onToggle={toggleAlert}
          onDelete={deleteAlert}
        />
      )}

      {subTab === "charts" && (
        <PortfolioCharts
          allocations={allocations}
          sparklineData={sparklineData}
          currency={system.defaultCurrency}
        />
      )}

      <ManageStockCashModal
        visible={isCashModalOpen}
        onClose={() => setIsCashModalOpen(false)}
        currency={system.defaultCurrency}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  quoteWarning: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  container: {
    gap: 12,
  },
  subTabRow: {
    flexDirection: "row",
    gap: 8,
  },
  subTabPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
});

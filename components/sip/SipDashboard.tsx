import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import {
  Bell,
  Calendar,
  Clock,
  History,
  TrendingUp,
} from "lucide-react-native";

import { SkeletonHero, SkeletonList } from "@/components/common/Skeleton";

import { useSips } from "@/hooks/useSips";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  SipSummaryCard,
  SipPlanFormModal,
  SipHistoryList,
  SipVirtualPositions,
  SipNotificationsModal,
} from "@/components/sip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { SipPlan, VirtualPositionWithMetrics } from "@/shared/features/sip/types";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

type SipSubTab = "plans" | "positions" | "history";

export function SipDashboard() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const {
    plans,
    transactions,
    virtualPositions,
    notifications,
    loading,
    createSipPlan,
    toggleSipPlan,
    deleteSipPlan,
    skipNextExecution,
    markNotificationAsRead,
    clearAllNotifications,
    triggerManualExecute,
  } = useSips();

  const [subTab, setSubTab] = useState<SipSubTab>("plans");
  const [formOpen, setFormOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [executing, setExecuting] = useState(false);

  // Batch load quotes for virtual positions
  const quoteRequests = useMemo(
    () =>
      virtualPositions.map((pos) => ({
        symbol: pos.symbol,
        instrumentType: pos.assetType as any,
      })),
    [virtualPositions]
  );

  const { quotes } = useMarketQuotes(quoteRequests);

  // Merge quotes with positions
  const positionsWithMetrics: VirtualPositionWithMetrics[] = useMemo(() => {
    return virtualPositions.map((pos) => {
      const quote = quotes.get(pos.symbol);
      const currentPrice = quote?.currentPrice ?? pos.averageBuyPrice;
      const currentValue = currentPrice * pos.totalUnits;
      const profit = currentValue - pos.totalInvested;
      const profitPercent = pos.totalInvested > 0 ? (profit / pos.totalInvested) * 100 : 0;
      return {
        ...pos,
        currentPrice,
        currentValue,
        profit,
        profitPercent,
        hasLiveQuote: !!quote,
      };
    });
  }, [virtualPositions, quotes]);

  // Compute overall summary
  const summary = useMemo(() => {
    let totalInvested = 0;
    let currentValue = 0;
    positionsWithMetrics.forEach((pos) => {
      totalInvested += pos.totalInvested;
      currentValue += pos.currentValue;
    });

    const profit = currentValue - totalInvested;
    const profitPercent = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    const activeCount = plans.filter((p) => p.status === "active").length;
    const pausedCount = plans.filter((p) => p.status === "paused").length;
    const completedCount = plans.filter((p) => p.status === "completed").length;

    return {
      activeCount,
      pausedCount,
      completedCount,
      totalInvested,
      currentValue,
      profit,
      profitPercent,
    };
  }, [plans, positionsWithMetrics]);

  // Calculate monthly projected commitment
  const monthlyCommitment = useMemo(() => {
    return plans
      .filter((p) => p.status === "active")
      .reduce((sum, plan) => {
        let multiplier = 1;
        if (plan.frequency === "daily") multiplier = 30;
        else if (plan.frequency === "weekly") multiplier = 4.33;
        else if (plan.frequency === "quarterly") multiplier = 0.33;
        else if (plan.frequency === "yearly") multiplier = 0.083;
        return sum + plan.investmentAmount * multiplier;
      }, 0);
  }, [plans]);

  const handleManualExecute = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setExecuting(true);
    try {
      await triggerManualExecute();
    } finally {
      setExecuting(false);
    }
  };

  const handleCreateSip = async (formData: any) => {
    try {
      await createSipPlan(formData);
      return true;
    } catch {
      return false;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { gap: 16 }]}>
        <SkeletonHero />
        <SkeletonList count={3} />
      </View>
    );
  }

  const activeNotifsCount = notifications.filter((n) => !n.read).length;

  return (
    <View style={styles.container}>
      {/* Summary Area */}
      <SipSummaryCard
        summary={summary}
        monthlyCommitment={monthlyCommitment}
        currency={system.defaultCurrency}
      />

      {/* Manual Trigger & Notifications Controls */}
      <View style={styles.controlsRow}>
        <Button
          variant="outline"
          onPress={handleManualExecute}
          loading={executing}
          style={{ flex: 1, minHeight: 44 }}
        >
          <Clock size={16} color={theme.colors.primary} />
          <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "700", color: theme.colors.primary }}>
            Trigger Execute Check
          </Text>
        </Button>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setNotifsOpen(true);
          }}
          style={({ pressed }) => [
            styles.notifBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Bell size={18} color={theme.colors.foreground} />
          {activeNotifsCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.destructive }]}>
              <Text style={styles.badgeText}>{activeNotifsCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Sub-tab Selection */}
      <View style={styles.tabRow}>
        {[
          { id: "plans", label: "Plans", icon: <Calendar size={14} color={subTab === "plans" ? "#FFF" : theme.colors.foreground} /> },
          { id: "positions", label: "Compounded", icon: <TrendingUp size={14} color={subTab === "positions" ? "#FFF" : theme.colors.foreground} /> },
          { id: "history", label: "Logs", icon: <History size={14} color={subTab === "history" ? "#FFF" : theme.colors.foreground} /> },
        ].map((tab) => {
          const active = subTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setSubTab(tab.id as SipSubTab);
              }}
              style={[
                styles.tabPill,
                {
                  backgroundColor: active ? theme.colors.primary : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              {tab.icon}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: active ? "800" : "600",
                  color: active ? "#FFFFFF" : theme.colors.foreground,
                  marginLeft: 4,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Active Tab Screen Content */}
      {subTab === "plans" && (
        <View style={{ gap: 10 }}>
          {plans.length === 0 ? (
            <Card>
              <View style={styles.empty}>
                <Calendar size={36} color={theme.colors.mutedForeground} />
                <Text style={{ color: theme.colors.foreground, fontWeight: "700", marginTop: 8 }}>
                  No Active SIP Plans
                </Text>
                <Text style={{ color: theme.colors.mutedForeground, fontSize: 11, textAlign: "center", marginTop: 4 }}>
                  Schedule automated recurring mock stock/crypto investments.
                </Text>
              </View>
            </Card>
          ) : (
            plans.map((plan) => (
              <Card
                key={plan.id}
                title={plan.assetName}
                subtitle={`${plan.frequency.toUpperCase()} • ₹${plan.investmentAmount} • Next run: ${plan.nextExecutionDate}`}
                headerRight={
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Pressable
                      onPress={() => toggleSipPlan(plan.id, plan.status)}
                      style={[
                        styles.actionPill,
                        {
                          backgroundColor: plan.status === "active" ? "rgba(34, 197, 94, 0.15)" : "rgba(100, 116, 139, 0.15)",
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "800", color: plan.status === "active" ? "#22C55E" : "#64748B" }}>
                        {plan.status.toUpperCase()}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => deleteSipPlan(plan.id)}>
                      <Text style={{ fontSize: 11, color: theme.colors.destructive, fontWeight: "700" }}>Delete</Text>
                    </Pressable>
                  </View>
                }
              />
            ))
          )}

          <Button onPress={() => setFormOpen(true)} style={{ marginTop: 8 }}>
            <Text style={{ color: "#FFF", fontWeight: "800" }}>+ Create SIP Plan</Text>
          </Button>
        </View>
      )}

      {subTab === "positions" && (
        <SipVirtualPositions
          positions={positionsWithMetrics}
          currency={system.defaultCurrency}
        />
      )}

      {subTab === "history" && (
        <SipHistoryList
          transactions={transactions}
          currency={system.defaultCurrency}
        />
      )}

      {/* Plan Form Modal */}
      <SipPlanFormModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreateSip}
      />

      {/* Notifications modal */}
      <SipNotificationsModal
        visible={notifsOpen}
        notifications={notifications}
        onClose={() => setNotifsOpen(false)}
        onMarkAsRead={markNotificationAsRead}
        onClearAll={clearAllNotifications}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  loading: {
    padding: 40,
    alignItems: "center",
  },
  controlsRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#FFF",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 20,
  },
  actionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
});

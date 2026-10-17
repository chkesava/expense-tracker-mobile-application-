import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Bell,
  Calendar,
  Clock,
  History,
  Trash2,
  TrendingUp,
} from "lucide-react-native";

import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";

import { useSips } from "@/hooks/useSips";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import {
  SipSummaryCard,
  SipPlanFormModal,
  SipHistoryList,
  SipVirtualPositions,
  SipNotificationsModal,
} from "@/components/sip";
import { Button } from "@/components/ui/Button";
import type { SipPlan, VirtualPositionWithMetrics } from "@/shared/features/sip/types";
import { DataRow, Pill, Section } from "@/components/dashboard/primitives";
import { Chip } from "@/components/ui/Chip";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { appDialog } from "@/lib/appDialog";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

type SipSubTab = "plans" | "positions" | "history";

export function SipDashboard() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const displayCurrency = useDisplayCurrency();
  const money = useGhostMoney(displayCurrency);

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
    haptic.success().catch(() => undefined);
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
        <DashboardSkeleton variant="hero" />
        <DashboardSkeleton variant="section" rows={3} />
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
        currency={displayCurrency}
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
            haptic.selection().catch(() => undefined);
            setNotifsOpen(true);
          }}
          style={({ pressed }) => [
            styles.notifBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: surfaces.control,
            },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            activeNotifsCount > 0
              ? `SIP notifications, ${activeNotifsCount} unread`
              : "SIP notifications"
          }
        >
          <Bell size={18} color={theme.colors.foreground} />
          {activeNotifsCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.destructive }]}>
              <Text style={[styles.badgeText, { color: theme.colors.destructiveForeground }]}>
                {activeNotifsCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Sub-tab Selection */}
      <View style={styles.tabRow} accessibilityRole="tablist">
        {[
          { id: "plans", label: "Plans", Icon: Calendar },
          { id: "positions", label: "Compounded", Icon: TrendingUp },
          { id: "history", label: "Logs", Icon: History },
        ].map((tab) => (
          <Chip
            key={tab.id}
            label={tab.label}
            selected={subTab === tab.id}
            appearance="outline"
            accessibilityRole="tab"
            haptic={subTab !== tab.id}
            icon={(color) => <tab.Icon size={14} color={color} />}
            onPress={() => setSubTab(tab.id as SipSubTab)}
          />
        ))}
      </View>

      {/* Active Tab Screen Content */}
      {subTab === "plans" && (
        <View style={{ gap: 10 }}>
          {plans.length === 0 ? (
            <Section>
              <View style={styles.empty}>
                <Calendar size={32} color={theme.colors.mutedForeground} />
                <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, marginTop: 8 }}>
                  No SIP plans yet
                </Text>
                <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, textAlign: "center", marginTop: 4 }}>
                  Schedule recurring virtual stock or crypto investments to see how they compound.
                </Text>
              </View>
            </Section>
          ) : (
            <Section title="SIP plans" subtitle={`${plans.length} plan${plans.length === 1 ? "" : "s"}`}>
              {plans.map((plan, index) => {
                const toggleable = plan.status === "active" || plan.status === "paused";
                // SPENDLY-542: the amount used a hardcoded "₹" and ignored
                // ghost mode; the next run was a raw ISO date.
                const meta = `${money(plan.investmentAmount)} ${plan.frequency} · Next ${formatDisplayDate(plan.nextExecutionDate, settings?.dateFormat)}`;
                return (
                  <DataRow
                    key={plan.id}
                    title={plan.assetName}
                    meta={meta}
                    divider={index < plans.length - 1}
                    value={
                      <View style={styles.planActions}>
                        {toggleable ? (
                          <Pressable
                            onPress={() => {
                              haptic.selection().catch(() => undefined);
                              void toggleSipPlan(plan.id, plan.status);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${plan.status === "active" ? "Pause" : "Resume"} ${plan.assetName}`}
                            hitSlop={6}
                          >
                            <Pill
                              label={plan.status === "active" ? "Active" : "Paused"}
                              tone={plan.status === "active" ? "positive" : "muted"}
                            />
                          </Pressable>
                        ) : (
                          <Pill label={plan.status === "completed" ? "Completed" : "Cancelled"} tone="muted" />
                        )}
                        <Pressable
                          onPress={() =>
                            appDialog.alert(
                              "Delete SIP plan",
                              `Delete the ${plan.assetName} plan? Its past logs stay in history.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Delete",
                                  style: "destructive",
                                  onPress: () => void deleteSipPlan(plan.id),
                                },
                              ]
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${plan.assetName} plan`}
                          hitSlop={8}
                          style={styles.deleteBtn}
                        >
                          <Trash2 size={16} color={theme.colors.destructive} />
                        </Pressable>
                      </View>
                    }
                  />
                );
              })}
            </Section>
          )}

          <Button onPress={() => setFormOpen(true)} style={{ marginTop: 8 }}>
            <Text style={{ color: theme.colors.primaryForeground, fontWeight: "800" }}>+ Create SIP Plan</Text>
          </Button>
        </View>
      )}

      {subTab === "positions" && (
        <SipVirtualPositions
          positions={positionsWithMetrics}
          currency={displayCurrency}
        />
      )}

      {subTab === "history" && (
        <SipHistoryList
          transactions={transactions}
          currency={displayCurrency}
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
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  planActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deleteBtn: {
    padding: 4,
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

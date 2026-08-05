import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  ArrowRightLeft,
  Calendar,
  CreditCard,
  Pause,
  Play,
  Plus,
  Repeat,
  Sparkles,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { EditSubscriptionModal } from "@/components/subscriptions/EditSubscriptionModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccounts } from "@/hooks/useAccounts";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Subscription } from "@/shared/types/subscription";
import {
  computeMonthlyCommitments,
  getNextRenewalDate,
} from "@/shared/utils/subscriptionProcessor";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function SubscriptionsList() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { accounts } = useAccounts();
  const { subscriptions, loading, toggleActive } = useSubscriptions();

  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((acc) => map.set(acc.id, acc.name));
    return map;
  }, [accounts]);

  const commitments = useMemo(() => {
    return computeMonthlyCommitments(subscriptions);
  }, [subscriptions]);

  const filteredSubscriptions = useMemo(() => {
    if (activeTab === "completed") {
      return subscriptions.filter((s) => s.isCompleted);
    }
    return subscriptions.filter((s) => !s.isCompleted);
  }, [subscriptions, activeTab]);

  const handleOpenAdd = () => {
    setSelectedSub(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sub: Subscription) => {
    setSelectedSub(sub);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Commitment Hero Banner */}
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.35 : 0.08,
            shadowRadius: 16,
            elevation: 6,
          },
        ]}
      >
        <View style={styles.heroHeader}>
          <Text
            style={[styles.heroSubtitle, { color: theme.colors.mutedForeground }]}
          >
            MONTHLY RECURRING OUTFLOW
          </Text>
          <Pressable
            onPress={handleOpenAdd}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: theme.colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Plus size={14} color={theme.colors.primaryForeground} strokeWidth={2.5} />
            <Text
              style={[
                styles.addBtnText,
                { color: theme.colors.primaryForeground },
              ]}
            >
              Add New
            </Text>
          </Pressable>
        </View>

        <Amount
          value={commitments.totalMonthly}
          currency={system.defaultCurrency}
          ghostable
          style={{ fontSize: 28, fontWeight: "900", marginBottom: 16 }}
        />

        {/* Commitment Breakdown */}
        <View
          style={[
            styles.breakdownRow,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <View style={styles.breakdownItem}>
            <Text
              style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}
            >
              Subscriptions
            </Text>
            <Amount
              value={commitments.subscriptionsTotal}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: theme.colors.foreground,
              }}
            />
          </View>

          <View
            style={[
              styles.breakdownDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />

          <View style={styles.breakdownItem}>
            <Text
              style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}
            >
              EMIs & Loans
            </Text>
            <Amount
              value={commitments.emisTotal}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: theme.colors.foreground,
              }}
            />
          </View>

          <View
            style={[
              styles.breakdownDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />

          <View style={styles.breakdownItem}>
            <Text
              style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}
            >
              Auto-Transfers
            </Text>
            <Amount
              value={commitments.transfersTotal}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: theme.colors.foreground,
              }}
            />
          </View>
        </View>
      </View>

      {/* Tabs / Filter Pills */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setActiveTab("active");
          }}
          style={[
            styles.filterPill,
            activeTab === "active"
              ? { backgroundColor: theme.colors.primary }
              : {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              {
                color:
                  activeTab === "active"
                    ? theme.colors.primaryForeground
                    : theme.colors.mutedForeground,
                fontWeight: activeTab === "active" ? "700" : "500",
              },
            ]}
          >
            Active ({commitments.activeCount})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setActiveTab("completed");
          }}
          style={[
            styles.filterPill,
            activeTab === "completed"
              ? { backgroundColor: theme.colors.primary }
              : {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              {
                color:
                  activeTab === "completed"
                    ? theme.colors.primaryForeground
                    : theme.colors.mutedForeground,
                fontWeight: activeTab === "completed" ? "700" : "500",
              },
            ]}
          >
            Completed ({commitments.completedCount})
          </Text>
        </Pressable>
      </View>

      {/* Subscriptions List */}
      {filteredSubscriptions.length === 0 ? (
        <EmptyState
          icon={<Repeat size={36} color={theme.colors.mutedForeground} />}
          title={
            activeTab === "active"
              ? "No Active Recurring Items"
              : "No Completed Items"
          }
          description={
            activeTab === "active"
              ? "Add your subscriptions, EMIs, or recurring transfers to auto-track them."
              : "Completed loans and finished commitments will appear here."
          }
        />
      ) : (
        <View style={styles.listContainer}>
          {filteredSubscriptions.map((sub) => {
            const renewal = getNextRenewalDate(sub);
            const sourceAccName = sub.accountId
              ? accountMap.get(sub.accountId) || "Linked Account"
              : null;
            const destAccName = sub.toAccountId
              ? accountMap.get(sub.toAccountId) || "Destination"
              : null;

            return (
              <Pressable
                key={sub.id}
                onPress={() => handleOpenEdit(sub)}
                style={({ pressed }) => [
                  styles.subCard,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={styles.subTopRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.typeBadgeRow}>
                      <View
                        style={[
                          styles.typeBadge,
                          {
                            backgroundColor:
                              sub.type === "emi"
                                ? "rgba(236, 72, 153, 0.15)"
                                : sub.type === "transfer"
                                  ? "rgba(59, 130, 246, 0.15)"
                                  : "rgba(107, 99, 255, 0.15)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeBadgeText,
                            {
                              color:
                                sub.type === "emi"
                                  ? "#EC4899"
                                  : sub.type === "transfer"
                                    ? "#3B82F6"
                                    : theme.colors.primary,
                            },
                          ]}
                        >
                          {sub.type === "emi"
                            ? "EMI / LOAN"
                            : sub.type === "transfer"
                              ? "AUTO-TRANSFER"
                              : "SUBSCRIPTION"}
                        </Text>
                      </View>

                      {!sub.isActive && !sub.isCompleted ? (
                        <View
                          style={[
                            styles.pausedBadge,
                            { backgroundColor: theme.colors.muted },
                          ]}
                        >
                          <Text
                            style={[
                              styles.pausedBadgeText,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            PAUSED
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text
                      style={[
                        styles.subName,
                        { color: theme.colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {sub.name}
                    </Text>

                    <Text
                      style={[
                        styles.subMeta,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      {sub.category}
                      {sourceAccName ? ` • ${sourceAccName}` : ""}
                      {destAccName ? ` → ${destAccName}` : ""}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Amount
                      value={sub.amount}
                      currency={system.defaultCurrency}
                      ghostable
                      style={{
                        fontSize: theme.typography.md,
                        fontWeight: "800",
                        color: theme.colors.foreground,
                      }}
                    />

                    {sub.id && !sub.isCompleted ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          Haptics.selectionAsync().catch(() => undefined);
                          toggleActive(sub.id!, sub.isActive);
                        }}
                        style={({ pressed }) => [
                          styles.pauseBtn,
                          {
                            backgroundColor: isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)",
                            borderColor: theme.colors.border,
                          },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        {sub.isActive ? (
                          <Pause
                            size={12}
                            color={theme.colors.mutedForeground}
                          />
                        ) : (
                          <Play size={12} color={theme.colors.primary} />
                        )}
                        <Text
                          style={[
                            styles.pauseBtnText,
                            {
                              color: sub.isActive
                                ? theme.colors.mutedForeground
                                : theme.colors.primary,
                            },
                          ]}
                        >
                          {sub.isActive ? "Pause" : "Resume"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {/* Sub Bottom Timeline / Renewal Row */}
                <View
                  style={[
                    styles.subBottomRow,
                    { borderTopColor: theme.colors.border },
                  ]}
                >
                  <View style={styles.renewalRow}>
                    <Calendar
                      size={12}
                      color={theme.colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.renewalText,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      {sub.isCompleted
                        ? "Term Completed"
                        : `Billed on day ${sub.dayOfMonth} · Renews ${renewal.dateStr}`}
                    </Text>
                  </View>

                  {sub.type === "emi" && sub.endMonth && sub.endYear ? (
                    <Text
                      style={[
                        styles.emiEndText,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      Ends {sub.endMonth}/{sub.endYear}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Edit Modal */}
      <EditSubscriptionModal
        visible={isModalOpen}
        subscription={selectedSub}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSub(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
  },
  breakdownItem: {
    flex: 1,
    gap: 2,
  },
  breakdownLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  breakdownDivider: {
    width: 1,
    height: 28,
    marginHorizontal: 12,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  filterPillText: {
    fontSize: 12,
  },
  listContainer: {
    gap: 12,
  },
  subCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  subTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  typeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  pausedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pausedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  subName: {
    fontSize: 15,
    fontWeight: "700",
  },
  subMeta: {
    fontSize: 12,
  },
  pauseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  pauseBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },
  subBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  renewalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  renewalText: {
    fontSize: 11,
  },
  emiEndText: {
    fontSize: 11,
    fontWeight: "600",
  },
});

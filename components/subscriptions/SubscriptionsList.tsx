import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
import { SkeletonHero, SkeletonList } from "@/components/common/Skeleton";
import { EditSubscriptionModal } from "@/components/subscriptions/EditSubscriptionModal";
import { RecurringReviewItem } from "@/components/subscriptions/RecurringReviewItem";
import { Button } from "@/components/ui/Button";
import { useAccounts } from "@/hooks/useAccounts";
import { useRecurringSuggestions } from "@/hooks/useRecurringSuggestions";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "@/lib/toast";
import { patternToSubscription } from "@/services/sms/smsRecurringDetector";
import type { Subscription } from "@/shared/types/subscription";
import {
  computeMonthlyCommitments,
  formatSubscriptionSchedule,
  getNextRenewalDate,
  isSubscriptionOverdue,
  partitionRecurringByTab,
  subscriptionNeedsAccount,
  subscriptionsToUpcomingDues,
  type RecurringTabId,
} from "@/shared/utils/subscriptionProcessor";
import {
  amountDueWithinDays,
  duesWithinDays,
} from "@/shared/utils/spendlyBudget";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

const RECURRING_TABS: { id: RecurringTabId; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "overdue", label: "Overdue" },
  { id: "paused", label: "Paused" },
  { id: "completed", label: "Completed" },
];

export function SubscriptionsList() {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();
  const displayCurrency = useDisplayCurrency();
  const { accounts } = useAccounts();
  const { subscriptions, loading, toggleActive } = useSubscriptions();
  const {
    items: reviewItems,
    actingKey,
    decline: declineSuggestion,
  } = useRecurringSuggestions();

  const [activeTab, setActiveTab] = useState<RecurringTabId>("active");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [suggestionKey, setSuggestionKey] = useState<string | null>(null);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((acc) => map.set(acc.id, acc.name));
    return map;
  }, [accounts]);

  const commitments = useMemo(() => {
    return computeMonthlyCommitments(subscriptions);
  }, [subscriptions]);

  // What actually leaves the account soon, as opposed to the monthly average.
  const upcoming = useMemo(
    () => subscriptionsToUpcomingDues(subscriptions),
    [subscriptions]
  );
  const dueInSeven = useMemo(() => amountDueWithinDays(upcoming, 7), [upcoming]);
  const nextDue = useMemo(() => duesWithinDays(upcoming, 400)[0] ?? null, [upcoming]);

  // One partition feeds both the tabs and their counts. They used to disagree:
  // the count came from `commitments.activeCount`, which excludes paused items,
  // while the list showed everything that was not completed. SPENDLY-158 moved
  // the split itself into `partitionRecurringByTab` so Overdue is derived from
  // the same rule the auto-poster refuses on.
  const byTab = useMemo(
    () => partitionRecurringByTab(subscriptions),
    [subscriptions]
  );

  const filteredSubscriptions = byTab[activeTab];

  const handleOpenAdd = () => {
    setSelectedSub(null);
    setSuggestionKey(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sub: Subscription) => {
    setSelectedSub(sub);
    setSuggestionKey(null);
    setIsModalOpen(true);
  };

  const handleReview = useCallback((key: string) => {
    const pattern = reviewItems.find((item) => item.key === key);
    if (!pattern) return;
    haptic.selection().catch(() => undefined);
    setSelectedSub(patternToSubscription(pattern));
    setSuggestionKey(pattern.key);
    setIsModalOpen(true);
  }, [reviewItems]);

  const handleDecline = useCallback(
    (key: string) => {
      const pattern = reviewItems.find((item) => item.key === key);
      if (!pattern) return;
      void declineSuggestion(user?.uid, pattern)
        .then(() => toast.info("Won't suggest this again"))
        .catch(() => toast.error("Could not decline"));
    },
    [declineSuggestion, reviewItems, user?.uid]
  );

  if (loading) {
    return (
      <View style={[styles.container, { gap: 16 }]}>
        <SkeletonHero />
        <SkeletonList count={4} />
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
          <Button
            variant="primary"
            size="sm"
            onPress={handleOpenAdd}
            style={styles.addBtn}
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
          </Button>
        </View>

        <Amount
          value={commitments.totalMonthly}
          currency={displayCurrency}
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
              currency={displayCurrency}
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
              currency={displayCurrency}
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
              currency={displayCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: theme.colors.foreground,
              }}
            />
          </View>
        </View>

        {dueInSeven > 0 || nextDue ? (
          <View
            style={[styles.dueStrip, { borderTopColor: theme.colors.border }]}
          >
            <View style={styles.dueBlock}>
              <Text
                style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}
              >
                Due in next 7 days
              </Text>
              <Amount
                value={dueInSeven}
                currency={displayCurrency}
                ghostable
                style={{
                  fontSize: theme.typography.md,
                  fontWeight: "800",
                  color: theme.colors.foreground,
                }}
              />
            </View>
            {nextDue ? (
              <Text
                style={[styles.nextDue, { color: theme.colors.mutedForeground }]}
                numberOfLines={1}
              >
                Next: {nextDue.name} · {nextDue.dueDate}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {reviewItems.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text
            style={[
              styles.heroSubtitle,
              { color: theme.colors.mutedForeground },
            ]}
          >
            NEEDS REVIEW ({reviewItems.length})
          </Text>
          {reviewItems.map((pattern) => (
            <RecurringReviewItem
              key={pattern.key}
              pattern={pattern}
              currency={displayCurrency}
              busy={actingKey === pattern.key}
              onReview={handleReview}
              onDecline={handleDecline}
            />
          ))}
        </View>
      ) : null}

      {/* Tabs / Filter Pills */}
      <View style={styles.filterRow}>
        {RECURRING_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                haptic.selection().catch(() => undefined);
                setActiveTab(tab.id);
              }}
              style={[
                styles.filterPill,
                selected
                  ? { backgroundColor: theme.colors.primary }
                  : {
                      backgroundColor: surfaces.control,
                    },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.filterPillText,
                  {
                    color: selected
                      ? theme.colors.primaryForeground
                      : theme.colors.mutedForeground,
                    fontWeight: selected ? "700" : "500",
                  },
                ]}
              >
                {tab.label} ({byTab[tab.id].length})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Subscriptions List */}
      {filteredSubscriptions.length === 0 && reviewItems.length === 0 ? (
        activeTab === "overdue" ? (
          // An empty Overdue tab is good news, and needs to read as such
          // rather than as "you have no subscriptions".
          <EmptyState
            illustration="subscriptions"
            title="Nothing overdue"
            description="Every active recurring payment has an account to debit, so each one can post itself when it falls due."
            tip="An item lands here when its charge is due but it has no account set — auto-post skips it rather than guessing."
          />
        ) : (
          <EmptyState
            illustration="subscriptions"
            title="No Subscriptions Yet"
            description="Track recurring subscriptions, software licenses, utilities, and memberships with automated renewal alerts."
            primaryAction={{
              label: "Add Subscription",
              icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
              onPress: handleOpenAdd,
            }}
            tip="Receive advance renewal reminders so you never get surprised by automatic debits."
          />
        )
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

                      {isSubscriptionOverdue(sub) ? (
                        <View
                          style={[
                            styles.pausedBadge,
                            { backgroundColor: "rgba(239, 68, 68, 0.15)" },
                          ]}
                        >
                          <Text
                            style={[styles.pausedBadgeText, { color: "#EF4444" }]}
                          >
                            OVERDUE
                          </Text>
                        </View>
                      ) : null}

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

                      {sub.source === "sms" ? (
                        <View
                          style={[
                            styles.pausedBadge,
                            { backgroundColor: "rgba(16, 185, 129, 0.15)" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.pausedBadgeText,
                              { color: "#059669" },
                            ]}
                          >
                            DETECTED
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

                    {/*
                      The row is already tappable into the edit form, which is
                      where the account is set — so the reason doubles as the
                      instruction rather than needing its own button.
                    */}
                    {subscriptionNeedsAccount(sub) && !sub.isCompleted ? (
                      <Text style={[styles.subMeta, { color: "#EF4444" }]}>
                        {sub.type === "transfer"
                          ? "Needs both accounts before it can post"
                          : "Needs an account before it can post"}
                      </Text>
                    ) : null}
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Amount
                      value={sub.amount}
                      currency={displayCurrency}
                      ghostable
                      style={{
                        fontSize: theme.typography.md,
                        fontWeight: "800",
                        color: theme.colors.foreground,
                      }}
                    />

                    {sub.id && !sub.isCompleted ? (
                      <Button
                        variant="outline"
                        size="sm"
                        haptic={false}
                        onPress={(e) => {
                          e.stopPropagation();
                          haptic.selection().catch(() => undefined);
                          toggleActive(sub.id!, sub.isActive);
                        }}
                        style={styles.pauseBtn}
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
                      </Button>
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
                        : formatSubscriptionSchedule(sub, renewal.dateStr)}
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
        suggestionKey={suggestionKey}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSub(null);
          setSuggestionKey(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dueStrip: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  dueBlock: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  nextDue: {
    fontSize: 12,
    fontWeight: "600",
  },
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

import { useCallback, useMemo, useState } from "react";
import { useRouter, type Href } from "expo-router";
import { recurringHref } from "@/shared/utils/recurringDetail";
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
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { HeroSection, MetaLabel, StatTile } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonHero, SkeletonList } from "@/components/common/Skeleton";
import { EditSubscriptionModal } from "@/components/subscriptions/EditSubscriptionModal";
import { RecurringReviewItem } from "@/components/subscriptions/RecurringReviewItem";
import { Button } from "@/components/ui/Button";
import { useAccounts } from "@/hooks/useAccounts";
import { useRecurringSuggestions } from "@/hooks/useRecurringSuggestions";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { toast } from "@/lib/toast";
import { patternToSubscription } from "@/services/recurring/recurringDetector";
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
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

const RECURRING_TABS: { id: RecurringTabId; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "overdue", label: "Overdue" },
  { id: "paused", label: "Paused" },
  { id: "completed", label: "Completed" },
];

export function SubscriptionsList() {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { user } = useAuth();
  const { settings } = useSettings();
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

  // SPENDLY-582: an item opens its detail (schedule, history, edit, pause,
  // delete) rather than going straight into the edit form.
  const openDetail = (sub: Subscription) => {
    if (sub.id) router.push(recurringHref(sub.id) as Href);
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
      {/* Commitment hero (SPENDLY-536): the dashboard's deep hero, same figures. */}
      <HeroSection
        variant="deep"
        title="Monthly recurring outflow"
        subtitle="Subscriptions, EMIs and auto-transfers"
        icon={<Repeat size={16} color={theme.colors.primary} strokeWidth={2.3} />}
        action={
          <Button variant="primary" size="sm" onPress={handleOpenAdd} style={styles.addBtn} accessibilityLabel="Add recurring">
            <Plus size={14} color={theme.colors.primaryForeground} strokeWidth={2.5} />
            <Text style={[styles.addBtnText, { color: theme.colors.primaryForeground }]}>Add</Text>
          </Button>
        }
      >
        <FinancialAmount value={commitments.totalMonthly} currency={displayCurrency} size="hero" weight="bold" />

        <View style={styles.heroTiles}>
          <StatTile label="Subscriptions" style={styles.heroTile}>
            <FinancialAmount value={commitments.subscriptionsTotal} currency={displayCurrency} size="sm" weight="bold" />
          </StatTile>
          <StatTile label="EMIs & loans" style={styles.heroTile}>
            <FinancialAmount value={commitments.emisTotal} currency={displayCurrency} size="sm" weight="bold" />
          </StatTile>
          <StatTile label="Auto-transfers" style={styles.heroTile}>
            <FinancialAmount value={commitments.transfersTotal} currency={displayCurrency} size="sm" weight="bold" />
          </StatTile>
        </View>

        {dueInSeven > 0 || nextDue ? (
          <View style={[styles.dueStrip, { borderTopColor: surfaces.divider }]}>
            <View style={styles.dueBlock}>
              <MetaLabel>Due in next 7 days</MetaLabel>
              <FinancialAmount value={dueInSeven} currency={displayCurrency} size="md" weight="bold" />
            </View>
            {nextDue ? (
              <Text
                style={[styles.nextDue, { color: theme.colors.mutedForeground }]}
                numberOfLines={1}
              >
                Next: {nextDue.name} · {formatDisplayDate(nextDue.dueDate, settings.dateFormat)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </HeroSection>

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
              icon: <Plus size={16} color={theme.colors.primaryForeground} strokeWidth={2.4} />,
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
              // SPENDLY-536: a plain card. The info and schedule areas open the
              // edit form; Pause/Resume sits beside them instead of inside a
              // pressable (a button inside a button on web).
              <View
                key={sub.id}
                style={[
                  styles.subCard,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
              >
                <View style={styles.subTopRow}>
                  <Pressable
                    onPress={() => openDetail(sub)}
                    style={({ pressed }) => [{ flex: 1, gap: 4 }, pressed && { opacity: 0.8 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${sub.name}`}
                  >
                    <View style={styles.typeBadgeRow}>
                      <View
                        style={[
                          styles.typeBadge,
                          {
                            backgroundColor: surfaces.wash(
                              sub.type === "emi"
                                ? theme.colors.warning
                                : sub.type === "transfer"
                                  ? theme.colors.info
                                  : theme.colors.primary
                            ),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeBadgeText,
                            {
                              color:
                                sub.type === "emi"
                                  ? theme.colors.warning
                                  : sub.type === "transfer"
                                    ? theme.colors.info
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
                            { backgroundColor: surfaces.wash(theme.colors.destructive) },
                          ]}
                        >
                          <Text
                            style={[styles.pausedBadgeText, { color: theme.colors.destructive }]}
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
                            { backgroundColor: surfaces.wash(theme.colors.success) },
                          ]}
                        >
                          <Text
                            style={[
                              styles.pausedBadgeText,
                              { color: theme.colors.success },
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
                      <Text style={[styles.subMeta, { color: theme.colors.destructive }]}>
                        {sub.type === "transfer"
                          ? "Needs both accounts before it can post"
                          : "Needs an account before it can post"}
                      </Text>
                    ) : null}
                  </Pressable>

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
                        onPress={() => {
                          haptic.selection().catch(() => undefined);
                          toggleActive(sub.id!, sub.isActive);
                        }}
                        style={styles.pauseBtn}
                        accessibilityLabel={`${sub.isActive ? "Pause" : "Resume"} ${sub.name}`}
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
                <Pressable
                  onPress={() => openDetail(sub)}
                  style={({ pressed }) => [
                    styles.subBottomRow,
                    { borderTopColor: theme.colors.outlineVariant },
                    pressed && { opacity: 0.8 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${sub.name} schedule`}
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
                        : formatSubscriptionSchedule(
                            sub,
                            formatDisplayDate(renewal.dateStr, settings.dateFormat)
                          )}
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
                </Pressable>
              </View>
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
  heroTiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  heroTile: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 90,
  },
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

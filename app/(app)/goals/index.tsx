import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Redirect, useRouter, type Href } from "expo-router";
import { ArrowUpDown, BarChart3, Calculator, Check, Plus, Target, WifiOff } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Modal } from "@/components/common/Modal";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalFormSheet, type GoalFormSubmit } from "@/components/goals/GoalFormSheet";
import { GoalIcon } from "@/components/goals/GoalIcon";
import { GoalSyncIssuesBanner } from "@/components/goals/GoalSyncIssuesBanner";
import { useUnlockedGoalIds } from "@/lib/goalLockSession";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useSaveGoalsEnabled } from "@/hooks/useSaveGoalsEnabled";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type { FinancialGoal } from "@/shared/types/expense";
import type { GoalStatus } from "@/shared/types/goal";
import { GOAL_SORT_OPTIONS, GOAL_TAB_STATUSES, GOAL_TABS, goalsForTab, moveGoal, tabCounts } from "@/shared/utils/goalList";
import { GOAL_STATUS_LABELS } from "@/shared/utils/goalMessages";
import type { GoalSort, GoalTab } from "@/shared/utils/goalModel";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Goals (SPENDLY-608): Active / Completed / Archived tabs, status chips so
 * paused and cancelled goals stay discoverable, sorting, pinning and manual
 * order. Summaries only — one shared listener, no history reads.
 */
export default function GoalsScreen() {
  const enabled = useSaveGoalsEnabled();
  const { theme } = useTheme();
  const router = useRouter();
  const currency = useDisplayCurrency();
  const { isOnline } = useNetwork();
  const bottomPadding = usePageListBottomPadding();
  const { goals, loading, error, retry, createGoal, updateSettings, pendingGoalIds } = useFinancialGoals();
  const unlockedIds = useUnlockedGoalIds();
  const { celebrateMilestone } = useCelebration();
  const [tab, setTab] = useState<GoalTab>("active");
  const [status, setStatus] = useState<GoalStatus | "all">("all");
  const [sort, setSort] = useState<GoalSort>("manual");
  const [sortOpen, setSortOpen] = useState(false);
  const [reorder, setReorder] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  const counts = useMemo(() => tabCounts(goals), [goals]);
  const list = useMemo(() => goalsForTab(goals, tab, status, sort), [goals, tab, status, sort]);

  const open = useCallback((g: FinancialGoal) => router.push(`/goals/${g.id}` as Href), [router]);

  const move = useCallback(
    async (g: FinancialGoal, direction: -1 | 1) => {
      if (moving) return;
      const updates = moveGoal(list, list.indexOf(g), direction);
      if (updates.length === 0) return;
      setMoving(true);
      try {
        for (const u of updates) {
          const ok = await updateSettings(u.goal, { sortOrder: u.sortOrder }, "Order saved");
          if (!ok) break;
        }
      } finally {
        setMoving(false);
      }
    },
    [list, moving, updateSettings]
  );

  const submit = async (value: GoalFormSubmit) => {
    const ok = await createGoal(value);
    if (ok) {
      celebrateMilestone("milestone_first_goal", {
        title: "First Goal Created!",
        subtitle: "Every dream begins with a target. Keep going!",
        badgeEmoji: "✨",
        pointsEarned: 50,
      });
    }
    return ok;
  };

  if (!enabled) return <Redirect href={"/settings/money" as Href} />;

  const header = (
    <PageHeader
      title="Goals"
      subtitle={loading ? "Loading…" : `${counts.active} active · ${counts.completed} completed`}
      icon={<Target size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href))}
      rightElement={
        <View style={[styles.row, { gap: theme.space.xs }]}>
          <Button variant="ghost" size="icon" onPress={() => router.push("/goals/analytics" as Href)} accessibilityLabel="Goal analytics and exports">
            <BarChart3 size={20} color={theme.colors.primary} />
          </Button>
          <Button variant="ghost" size="icon" onPress={() => router.push("/goals/optimizer" as Href)} accessibilityLabel="Plan how to fund your goals">
            <Calculator size={20} color={theme.colors.primary} />
          </Button>
          <Button variant="tonal" size="icon" onPress={() => setFormOpen(true)} accessibilityLabel="Create a goal">
            <Plus size={20} color={theme.colors.primary} />
          </Button>
        </View>
      }
    />
  );

  const statusChips = GOAL_TAB_STATUSES[tab];
  const controls = (
    <View style={{ paddingHorizontal: theme.space.lg, gap: theme.space.sm, paddingBottom: theme.space.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }} accessibilityRole="tablist">
        {GOAL_TABS.map((t) => (
          <Chip
            key={t.id}
            label={`${t.label} · ${counts[t.id]}`}
            appearance="outline"
            selected={tab === t.id}
            onPress={() => {
              setTab(t.id);
              setStatus("all");
              setReorder(false);
            }}
            accessibilityRole="tab"
          />
        ))}
      </ScrollView>
      <View style={[styles.row, { gap: theme.space.sm }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }} style={styles.flex}>
          {statusChips.length > 1 ? (
            <>
              <Chip label="All" size="sm" selected={status === "all"} onPress={() => setStatus("all")} accessibilityRole="radio" />
              {statusChips.map((s) => (
                <Chip key={s} label={GOAL_STATUS_LABELS[s]} size="sm" selected={status === s} onPress={() => setStatus(s)} accessibilityRole="radio" />
              ))}
            </>
          ) : null}
        </ScrollView>
        {sort === "manual" && list.length > 1 ? (
          <Chip
            label={reorder ? "Done" : "Reorder"}
            size="sm"
            appearance="outline"
            selected={reorder}
            icon={reorder ? (c) => <Check size={14} color={c} /> : undefined}
            onPress={() => setReorder((r) => !r)}
            accessibilityLabel={reorder ? "Finish reordering" : "Reorder goals"}
          />
        ) : null}
        <Chip
          label={GOAL_SORT_OPTIONS.find((o) => o.id === sort)?.label ?? "Sort"}
          size="sm"
          appearance="outline"
          icon={(c) => <ArrowUpDown size={14} color={c} />}
          onPress={() => setSortOpen(true)}
          accessibilityLabel="Sort goals"
        />
      </View>
    </View>
  );

  let body;
  if (error) {
    body = (
      <PageListStateScroll>
        <ErrorState title="Couldn't load your goals" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageListStateScroll>
    );
  } else if (loading && goals.length === 0) {
    body = (
      <View style={{ padding: theme.space.lg }}>
        <DashboardSkeleton variant="progress" rows={3} />
      </View>
    );
  } else if (goals.length === 0) {
    body = (
      <PageListStateScroll>
        <EmptyState
          icon={<GoalIcon iconKey="piggy-bank" size={64} />}
          title="Start your first savings goal"
          description={"Pick something you're saving for — an emergency fund, a trip, a new phone — set a target, and record what you put aside. For example: \"Emergency fund\", target 6 months of expenses.\n\nGoals track your savings only; your accounts and transactions are never changed."}
          primaryAction={{ label: "Create goal", onPress: () => setFormOpen(true) }}
        />
      </PageListStateScroll>
    );
  } else {
    body = (
      <>
        {controls}
        <View style={{ paddingHorizontal: theme.space.lg }}>
          <GoalSyncIssuesBanner />
        </View>
        {!isOnline ? (
          <View style={[styles.row, { gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm }]} accessibilityLiveRegion="polite">
            <WifiOff size={16} color={theme.colors.mutedForeground} />
            <Text style={{ flex: 1, color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
              You're offline. Changes save on this device and sync later.
            </Text>
          </View>
        ) : null}
        {list.length === 0 ? (
          <PageListStateScroll>
            <EmptyState
              compact
              title={tab === "completed" ? "No completed goals yet" : tab === "archived" ? "Nothing archived" : "No goals here"}
              description={tab === "completed" ? "When a goal reaches its target, mark it completed and it shows up here." : "Try another filter."}
              primaryAction={tab === "active" ? { label: "Create goal", onPress: () => setFormOpen(true) } : undefined}
            />
          </PageListStateScroll>
        ) : (
          <View style={styles.flex}>
            <FlashList
              data={list}
              keyExtractor={(g) => g.id}
              extraData={[reorder, pendingGoalIds, unlockedIds]}
              renderItem={({ item, index }) => (
                <View style={{ paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm }}>
                  <GoalCard
                    goal={item}
                    pending={pendingGoalIds.has(item.id)}
                    hidden={Boolean(item.locked) && !unlockedIds.has(item.id)}
                    currency={currency}
                    onPress={open}
                    reorder={
                      reorder
                        ? {
                            canUp: !moving && index > 0 && Boolean(list[index - 1].pinned) === Boolean(item.pinned),
                            canDown: !moving && index < list.length - 1 && Boolean(list[index + 1].pinned) === Boolean(item.pinned),
                            onMove: (g, d) => void move(g, d),
                          }
                        : undefined
                    }
                  />
                </View>
              )}
              contentContainerStyle={{ paddingBottom: bottomPadding }}
            />
          </View>
        )}
      </>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      {body}
      <Modal isOpen={sortOpen} onClose={() => setSortOpen(false)} title="Sort goals" density="compact">
        <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
          {GOAL_SORT_OPTIONS.map((o) => (
            <Chip
              key={o.id}
              label={o.label}
              selected={sort === o.id}
              onPress={() => {
                setSort(o.id);
                if (o.id !== "manual") setReorder(false);
                setSortOpen(false);
              }}
              accessibilityRole="radio"
            />
          ))}
        </View>
        <Text style={{ marginTop: theme.space.md, color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
          Pinned goals always stay on top.
        </Text>
      </Modal>
      <GoalFormSheet isOpen={formOpen} goal={null} goals={goals} onClose={() => setFormOpen(false)} onSubmit={submit} />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});

import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, ClipboardCheck, Clock, Sparkles, UserPlus, Users } from "lucide-react-native";

import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import {
  CollectionIcon,
  ContributionIcon,
  ExpenseIcon,
  SevaIcon,
} from "@/components/ganesh/art/icons";
import { GaneshQuickActions } from "@/components/ganesh/GaneshQuickActions";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshClosedBanner } from "@/components/ganesh/GaneshClosedBanner";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { CommandHero, PandalOverview, TodaySevaPanel } from "@/components/ganesh/home";
import {
  DataRow,
  GaneshEmptyState,
  ListStateView,
  MetaLabel,
  Money,
  RowGlyph,
  Section,
  SectionAction,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { SkeletonList } from "@/components/common/Skeleton";
import { Button } from "@/components/ui/Button";
import { useContributions } from "@/hooks/useContributions";
import { useGaneshActivity } from "@/hooks/useGaneshActivity";
import { useFestivals } from "@/hooks/useFestivals";
import { useFestivalSeva } from "@/hooks/useFestivalSeva";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { usePandals } from "@/hooks/usePandals";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { haptic } from "@/lib/haptics";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { availableGodFund, festivalCashSpent, totalCashIn } from "@/shared/utils/ganeshMath";
import { formatGaneshWhen, memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
import { summarizeContributions } from "@/shared/utils/ganeshContributions";
import { currentTimeInput, nextSeva, todaySeva, unstaffedSeva } from "@/shared/utils/ganeshSeva";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

function activityArt(entityType: string) {
  if (entityType.includes("collection") || entityType.includes("opening")) {
    return <CollectionIcon size={28} />;
  }
  if (entityType.includes("expense")) return <ExpenseIcon size={28} />;
  if (entityType.includes("contribution") || entityType.includes("sponsor")) {
    return <ContributionIcon size={28} />;
  }
  if (entityType.includes("seva")) return <SevaIcon size={28} />;
  return <ContributionIcon size={28} />;
}

/**
 * Pandal Command Center — identity, today's seva, then operations and money.
 */
export default function GaneshHomeScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { members } = usePandalMembers(pandalId);
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    retry: retrySummary,
  } = useGaneshSummary(pandalId, festivalId);
  const { activity, loading: activityLoading } = useGaneshActivity(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { seva, loading: sevaLoading, retry: retrySeva } = useFestivalSeva(pandalId, festivalId);
  const { requests } = useJoinRequests(pandalId);
  const { can, isAdmin } = useGaneshPermissions();

  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const closed = festival?.status === "closed";

  const today = todayDateInput();
  const nowTime = currentTimeInput();

  const godFund = availableGodFund(summary);
  const moneyIn = totalCashIn(summary);
  const spent = festivalCashSpent(summary);

  const contributionTotals = useMemo(
    () => summarizeContributions(contributions, today),
    [contributions, today]
  );

  const sevaToday = useMemo(() => todaySeva(seva, today), [seva, today]);
  const upNext = useMemo(() => nextSeva(seva, today, nowTime), [seva, today, nowTime]);
  const unstaffed = useMemo(() => unstaffedSeva(seva, today), [seva, today]);
  const canPlanSeva = can("seva.write") && !closed;
  const preview = activity.slice(0, 5);

  const handleRefresh = useCallback(() => {
    retrySeva();
  }, [retrySeva]);

  const pendingActions = useMemo(() => {
    const rows: Array<{
      id: string;
      title: string;
      meta: string;
      icon: typeof UserPlus;
      tint: string;
      onPress: () => void;
    }> = [];

    if (isAdmin && requests.length > 0) {
      rows.push({
        id: "join",
        title: `${requests.length} join request${requests.length === 1 ? "" : "s"}`,
        meta: "Waiting for your review",
        icon: UserPlus,
        tint: g.saffron,
        onPress: () => push("/(ganesh)/join-requests"),
      });
    }

    if (unstaffed.length > 0) {
      rows.push({
        id: "unstaffed",
        title: `${unstaffed.length} seva without volunteers`,
        meta: `Starting with ${unstaffed[0].name}`,
        icon: Users,
        tint: theme.colors.warning,
        onPress: () => push("/(ganesh)/(tabs)/seva"),
      });
    }

    if (summary.pendingReimbursements > 0) {
      rows.push({
        id: "reimbursement",
        title: "Reimbursement pending",
        meta: "Members are owed for personal money spent",
        icon: Clock,
        tint: theme.colors.warning,
        onPress: () => push("/(ganesh)/(tabs)/expenses"),
      });
    }

    if (contributionTotals.promisedCount > 0) {
      rows.push({
        id: "promised",
        title: `${contributionTotals.promisedCount} promised contribution${
          contributionTotals.promisedCount === 1 ? "" : "s"
        }`,
        meta:
          contributionTotals.overdueCount > 0
            ? `${contributionTotals.overdueCount} past the expected date`
            : "Not counted as cash until received",
        icon: ClipboardCheck,
        tint: theme.colors.info,
        onPress: () => push("/(ganesh)/(tabs)/contributions?status=promised"),
      });
    }

    return rows;
  }, [
    contributionTotals.overdueCount,
    contributionTotals.promisedCount,
    g.saffron,
    isAdmin,
    push,
    requests.length,
    summary.pendingReimbursements,
    theme.colors.info,
    theme.colors.warning,
    unstaffed,
  ]);

  return (
    <GaneshScreen
      withTabBar
      onRefresh={handleRefresh}
      contentContainerStyle={styles.bleed}
    >
      <CommandHero
        pandalName={pandal?.name}
        festivalName={festival?.name}
        festival={festival}
        today={today}
        onNotify={isAdmin ? () => push("/(ganesh)/admin") : undefined}
        onFestivalDates={isAdmin ? () => push("/(ganesh)/admin/festivals") : undefined}
        rightAccessory={<GaneshSyncChip onDark />}
      />

      <View style={styles.body}>
        <TodaySevaPanel
          sevaToday={sevaToday}
          sevaCount={seva.length}
          loading={sevaLoading}
          upNextId={upNext?.id}
          today={today}
          nowTime={nowTime}
          canPlan={canPlanSeva}
          onSchedule={() => push("/(ganesh)/(tabs)/seva")}
          onPlan={() => push("/(ganesh)/add-seva")}
          onOpen={(id) => push(`/(ganesh)/seva/${id}`)}
        />

        {pendingActions.length > 0 ? (
          <Section title="Needs attention" subtitle="Open items for this festival">
            {pendingActions.map((row, index) => (
              <DataRow
                key={row.id}
                divider={index < pendingActions.length - 1}
                leading={
                  <RowGlyph tint={g.wash(row.tint)}>
                    <row.icon size={16} color={row.tint} strokeWidth={2.2} />
                  </RowGlyph>
                }
                title={row.title}
                meta={row.meta}
                value={
                  row.id === "reimbursement" ? (
                    <Money value={summary.pendingReimbursements} size="secondary" tone="warning" />
                  ) : undefined
                }
                onPress={row.onPress}
              />
            ))}
          </Section>
        ) : null}

        {summaryLoading ? (
          <ListStateView loading title="Loading Pandal funds" skeletonCount={3} />
        ) : summaryError ? (
          <ListStateView
            error={summaryError}
            onRetry={retrySummary}
            title="We couldn't load the Pandal's funds."
            description="Amounts are hidden rather than shown as zero."
          />
        ) : (
        <PandalOverview
          available={godFund}
          received={moneyIn}
          spent={spent}
          collectionCount={summary.collectionCount}
          expenseCount={summary.expenseCount}
          onDetails={() => push("/(ganesh)/(tabs)/funds")}
        />
        )}
        {/* GS-058: replaces a bare "Create next festival" button, which
            offered the way out without ever saying what was wrong. */}
        <GaneshClosedBanner />

        <GaneshQuickActions disabled={closed} />

        <View style={styles.activityWrap}>
          <View pointerEvents="none" style={styles.lotusWrap}>
            <GaneshArt name="lotusWatermark" width={220} height={220} />
          </View>
          <Section
            title="Recent Activity"
            action={
              activity.length > 0 ? (
                <SectionAction label="View Report" onPress={() => push("/(ganesh)/report")} />
              ) : undefined
            }
          >
          {activityLoading && activity.length === 0 ? (
            <SkeletonList count={3} />
          ) : activity.length === 0 ? (
            <GaneshEmptyState
              compact
              icon={<Sparkles size={20} color={g.saffron} strokeWidth={1.9} />}
              title="Nothing recorded yet"
              description="Add an opening fund or the first chanda collection to start this festival's ledger."
            />
          ) : (
            preview.map((item, index) => {
              return (
                <DataRow
                  key={item.id}
                  divider={index < preview.length - 1}
                  leading={activityArt(item.entityType)}
                  title={item.title}
                  meta={
                    [
                      memberDisplayName(members, item.actorId)
                        ? `By ${memberDisplayName(members, item.actorId)}`
                        : null,
                      formatGaneshWhen(item.createdAt),
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  value={
                    item.amount != null ? (
                      <Money value={item.amount} size="secondary" tone="positive" />
                    ) : item.estimatedValue != null ? (
                      <Money value={item.estimatedValue} size="secondary" tone="muted" />
                    ) : undefined
                  }
                  valueMeta={
                    item.amount == null && item.estimatedValue != null ? (
                      <MetaLabel>Estimated</MetaLabel>
                    ) : undefined
                  }
                />
              );
            })
          )}
          {activity.length > preview.length ? (
            <Pressable
              onPress={() => {
                void haptic.selection();
                push("/(ganesh)/report");
              }}
              accessibilityRole="button"
              accessibilityLabel="View more activity"
              style={styles.more}
            >
              <Text style={[styles.moreLabel, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
                More Activity
              </Text>
              <ChevronRight size={14} color={g.saffron} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </Section>
        </View>
      </View>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  bleed: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 0,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  more: {
    alignSelf: "center",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 12,
  },
  moreLabel: {
    fontSize: 13.5,
  },
  activityWrap: {
    position: "relative",
  },
  lotusWrap: {
    position: "absolute",
    width: 220,
    height: 220,
    right: -28,
    top: 36,
    opacity: 0.16,
  },
  lotus: {
    width: 220,
    height: 220,
  },
});

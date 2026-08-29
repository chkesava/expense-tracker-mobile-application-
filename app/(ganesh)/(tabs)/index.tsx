import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  CalendarPlus,
  ClipboardCheck,
  Clock,
  Flame,
  Gift,
  Receipt,
  Shield,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react-native";

import { GaneshQuickActions } from "@/components/ganesh/GaneshQuickActions";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { SevaRow } from "@/components/ganesh/SevaRow";
import {
  DataRow,
  GaneshEmptyState,
  GaneshHeader,
  MetaLabel,
  Money,
  PandalHero,
  RowGlyph,
  Section,
  SectionAction,
  StatTile,
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
import {
  currentTimeInput,
  nextSeva,
  todaySeva,
  unstaffedSeva,
} from "@/shared/utils/ganeshSeva";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

/** Icon for an activity row, chosen from the entity it describes. */
function activityGlyph(entityType: string) {
  if (entityType.includes("collection")) return Wallet;
  if (entityType.includes("expense")) return Receipt;
  if (entityType.includes("contribution") || entityType.includes("sponsor")) return Gift;
  if (entityType.includes("seva")) return Flame;
  return Sparkles;
}

/**
 * The Pandal Command Center.
 *
 * Answers "how is my Pandal doing today?", in this order:
 *
 *   1. Where the festival is — pandal, name, which day of how many
 *   2. What is happening today — the seva programme on a time rail
 *   3. What needs a person — join requests, reimbursements, promises, unstaffed seva
 *   4. How the money stands — three readings, one compact strip
 *   5. Quick actions, then recent activity
 *
 * The previous version opened with the God Fund balance and two money tiles,
 * which is what made this read as an expense tracker on launch. Money has not
 * been removed or demoted in importance — it has been moved below the things an
 * organiser standing at the pandal actually needs first.
 */
export default function GaneshHomeScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { members } = usePandalMembers(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { activity, loading: activityLoading } = useGaneshActivity(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { seva, loading: sevaLoading } = useFestivalSeva(pandalId, festivalId);
  const { requests } = useJoinRequests(pandalId);
  const { can, isAdmin } = useGaneshPermissions();

  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  /** Things a person has to *do*, most urgent first. Empty is a good state. */
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
        onPress: () => push("/(ganesh)/join-requests" as never),
      });
    }

    if (unstaffed.length > 0) {
      rows.push({
        id: "unstaffed",
        title: `${unstaffed.length} seva without volunteers`,
        meta: `Starting with ${unstaffed[0].name}`,
        icon: Users,
        tint: theme.colors.warning,
        onPress: () => push("/(ganesh)/(tabs)/seva" as never),
      });
    }

    if (summary.pendingReimbursements > 0) {
      rows.push({
        id: "reimbursement",
        title: "Reimbursement pending",
        meta: "Members are owed for personal money spent",
        icon: Clock,
        tint: theme.colors.warning,
        onPress: () => push("/(ganesh)/(tabs)/expenses" as never),
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
        onPress: () => push("/(ganesh)/(tabs)/contributions?status=promised" as never),
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
    <GaneshScreen safeTop withTabBar refreshing={refreshing} onRefresh={handleRefresh}>
      <GaneshHeader
        title="Ganesh Seva"
        subtitle={pandal?.name}
        icon={<Sparkles size={22} color={g.saffron} strokeWidth={2.2} />}
        rightElement={
          <View style={styles.headerActions}>
            {isAdmin ? (
              <Pressable
                onPress={() => {
                  void haptic.selection();
                  push("/(ganesh)/admin" as never);
                }}
                accessibilityRole="button"
                accessibilityLabel="Open admin dashboard"
                hitSlop={6}
                style={({ pressed }) => [
                  styles.adminButton,
                  { backgroundColor: g.wash(g.saffron) },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Shield size={18} color={g.saffron} strokeWidth={2.2} />
              </Pressable>
            ) : null}
            <GaneshSyncChip />
          </View>
        }
      />

      <PandalHero
        pandalName={pandal?.name}
        festivalName={festival?.name}
        festival={festival}
        today={today}
      />

      {/* 2. What is happening today. */}
      <Section
        title="Today's Seva"
        subtitle={sevaToday.length > 0 ? `${sevaToday.length} planned` : undefined}
        action={
          seva.length > 0 ? (
            <SectionAction
              label="Schedule"
              onPress={() => push("/(ganesh)/(tabs)/seva" as never)}
            />
          ) : undefined
        }
      >
        {sevaLoading && seva.length === 0 ? (
          <SkeletonList count={3} />
        ) : sevaToday.length === 0 ? (
          <GaneshEmptyState
            compact
            icon={<CalendarPlus size={20} color={g.saffron} strokeWidth={1.9} />}
            title={seva.length === 0 ? "No seva planned yet" : "Nothing planned today"}
            description={
              canPlanSeva
                ? "Plan the aarti, annadanam and programmes so the committee knows what happens when."
                : "Your committee has not planned anything for today."
            }
            action={
              canPlanSeva
                ? { label: "Plan a seva", onPress: () => push("/(ganesh)/add-seva" as never) }
                : undefined
            }
          />
        ) : (
          sevaToday.map((item, index) => (
            <SevaRow
              key={item.id}
              seva={item}
              today={today}
              nowTime={nowTime}
              isNext={item.id === upNext?.id}
              isLast={index === sevaToday.length - 1}
              onPress={() => push(`/(ganesh)/seva/${item.id}` as never)}
            />
          ))
        )}
      </Section>

      {/* 3. What needs a person. */}
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

      {/* 4. How the money stands — present, but no longer the identity. */}
      <Section
        title="Pandal funds"
        action={<SectionAction label="Funds" onPress={() => push("/(ganesh)/(tabs)/funds" as never)} />}
      >
        <View style={styles.statRow}>
          <StatTile label="Available">
            <Money value={godFund} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
          <StatTile
            label="Received"
            meta={
              <Text
                style={[styles.tileMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
              >
                {summary.collectionCount} collections
              </Text>
            }
          >
            <Money value={moneyIn} size="primary" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
          <StatTile
            label="Spent"
            meta={
              <Text
                style={[styles.tileMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
              >
                {summary.expenseCount} expenses
              </Text>
            }
          >
            <Money value={spent} size="primary" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
        </View>
      </Section>

      <GaneshQuickActions disabled={closed} />

      {closed && can("festival.create") ? (
        <Button onPress={() => push("/(ganesh)/create-festival" as never)}>
          Create next festival
        </Button>
      ) : null}

      <Section
        title="Pandal activity"
        action={
          activity.length > 0 ? (
            <SectionAction label="Report" onPress={() => push("/(ganesh)/report" as never)} />
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
          activity.slice(0, 8).map((item, index) => {
            const Glyph = activityGlyph(item.entityType);
            return (
              <DataRow
                key={item.id}
                divider={index < Math.min(activity.length, 8) - 1}
                leading={
                  <RowGlyph tint={g.tile}>
                    <Glyph size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
                  </RowGlyph>
                }
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
                    <Money value={item.amount} size="secondary" />
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
      </Section>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adminButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  tileMeta: {
    fontSize: 11.5,
    lineHeight: 15,
  },
});

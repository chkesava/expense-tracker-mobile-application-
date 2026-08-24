import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardCheck,
  Clock,
  Gift,
  Receipt,
  Shield,
  Sparkles,
  UserPlus,
  Wallet,
} from "lucide-react-native";

import { GaneshQuickActions } from "@/components/ganesh/GaneshQuickActions";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { GodFundHero } from "@/components/ganesh/GodFundHero";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import {
  DataRow,
  GaneshHeader,
  MetaLabel,
  Money,
  RowGlyph,
  Section,
  SectionAction,
  StatTile,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { Button } from "@/components/ui/Button";
import { useContributions } from "@/hooks/useContributions";
import { useGaneshActivity } from "@/hooks/useGaneshActivity";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { usePandals } from "@/hooks/usePandals";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { haptic } from "@/lib/haptics";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { availableGodFund, festivalCashSpent, totalCashIn } from "@/shared/utils/ganeshMath";
import { formatGaneshWhen, memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
import { summarizeContributions } from "@/shared/utils/ganeshContributions";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

/** Icon for an activity row, chosen from the entity it describes. */
function activityGlyph(entityType: string) {
  if (entityType.includes("collection")) return Wallet;
  if (entityType.includes("expense")) return Receipt;
  if (entityType.includes("contribution") || entityType.includes("sponsor")) return Gift;
  return Sparkles;
}

export default function GaneshHomeScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { members } = usePandalMembers(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { fund } = usePermanentFund(pandalId);
  const { activity, loading: activityLoading } = useGaneshActivity(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { requests } = useJoinRequests(pandalId);
  const { can, isAdmin } = useGaneshPermissions();

  const [refreshing, setRefreshing] = useState(false);

  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const closed = festival?.status === "closed";

  const godFund = availableGodFund(summary);
  const moneyIn = totalCashIn(summary);
  const spent = festivalCashSpent(summary);

  const contributionTotals = useMemo(
    () => summarizeContributions(contributions, todayDateInput()),
    [contributions]
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  /** Things a person has to *do*, newest concern first. Empty is a good state. */
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
  ]);

  return (
    <GaneshScreen safeTop withTabBar refreshing={refreshing} onRefresh={handleRefresh}>
      <GaneshHeader
        title={festival?.name || "Ganesh Utsav"}
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

      <GodFundHero
        amount={godFund}
        festivalName={festival?.name}
        pandalName={pandal?.name}
        onPress={() => push("/(ganesh)/report" as never)}
      />

      <View style={styles.statRow}>
        <StatTile
          label="Money in"
          meta={
            <Text
              style={[styles.tileMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            >
              {summary.collectionCount} collections
            </Text>
          }
        >
          <Money value={moneyIn} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
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

      <GaneshQuickActions
        disabled={closed}
        showAddPermanentFund={can("permanentFund.add") && fund.total === 0}
      />

      <PermanentFundCard
        fund={fund}
        onPress={() => push("/(ganesh)/permanent-fund" as never)}
        onAddPress={
          can("permanentFund.add") && fund.total === 0
            ? () => push("/(ganesh)/add-permanent-fund" as never)
            : undefined
        }
      />

      {closed && can("festival.create") ? (
        <Button onPress={() => push("/(ganesh)/create-festival" as never)}>
          Create next festival
        </Button>
      ) : null}

      <Section
        title="Recent activity"
        action={
          activity.length > 0 ? (
            <SectionAction label="Report" onPress={() => push("/(ganesh)/report" as never)} />
          ) : undefined
        }
      >
        {activityLoading && activity.length === 0 ? (
          <SkeletonList count={3} />
        ) : activity.length === 0 ? (
          <EmptyState
            compact
            illustration="expenses"
            title="Nothing recorded yet"
            description="Add an opening fund or the first chanda collection to start this festival's ledger."
          />
        ) : (
          activity.slice(0, 8).map((item, index) => {
            const Glyph = activityGlyph(item.entityType);
            const isMoneyIn = (item.amount ?? 0) > 0 && item.entityType.includes("collection");
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
                    <View style={styles.activityValue}>
                      {isMoneyIn ? (
                        <ArrowDownLeft size={12} color={g.godFund} strokeWidth={2.4} />
                      ) : (
                        <ArrowUpRight size={12} color={theme.colors.mutedForeground} strokeWidth={2.4} />
                      )}
                      <Money value={item.amount} size="secondary" />
                    </View>
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
  activityValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
});

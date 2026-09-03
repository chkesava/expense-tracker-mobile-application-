import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { ChevronRight, Plus, Users } from "lucide-react-native";

import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import {
  Avatar,
  FilterChips,
  GaneshHeader,
  ListStateView,
  MetaLabel,
  Money,
  ProgressTrack,
  StatTile,
  StatusBadge,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { SearchBar } from "@/components/common/SearchBar";
import { AddFab } from "@/components/ui/AddFab";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { haptic } from "@/lib/haptics";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { FestivalMember, PandalMember } from "@/shared/types/ganesh";
import {
  committeePayStatus,
  effectiveCommitteeTarget,
  memberRemainingContribution,
  type CommitteePayStatus,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

type Filter = "all" | "paid" | "partial" | "pending" | "waived";

const FILTER_OPTIONS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "pending", label: "Not paid" },
  { id: "partial", label: "Partial" },
  { id: "paid", label: "Paid" },
  { id: "waived", label: "Waived" },
];

const STATUS_LABEL: Record<CommitteePayStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  pending: "Not paid",
  waived: "Waived",
};

type CommitteeRow = {
  userId: string;
  name: string;
  roleLabel: string;
  paid: number;
  target: number;
  due: number;
  status: CommitteePayStatus;
  customTarget: boolean;
  personalExpenses: number;
  pendingReimbursement: number;
};

function buildRow(
  member: PandalMember,
  festivalMember: FestivalMember | undefined,
  defaultTarget: number
): CommitteeRow {
  const paid = festivalMember?.contributionPaid ?? 0;
  const target = effectiveCommitteeTarget(festivalMember, defaultTarget);
  const waived = Boolean(festivalMember?.contributionWaived);
  const customTarget = Boolean(festivalMember?.contributionTargetOverridden);
  return {
    userId: member.userId,
    name: member.displayName,
    roleLabel: ganeshRoleLabel(member.role),
    paid,
    target,
    due: waived ? 0 : memberRemainingContribution({ contributionPaid: paid, contributionTarget: target }),
    status: committeePayStatus(paid, target, customTarget, waived),
    customTarget,
    personalExpenses: festivalMember?.personalExpenses ?? 0,
    pendingReimbursement: festivalMember?.pendingReimbursement ?? 0,
  };
}

export default function CommitteeScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const listPadding = useGaneshListPadding();

  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { summary, loading: summaryLoading } = useGaneshSummary(pandalId, festivalId);
  const { members: pandalMembers, loading, error } = usePandalMembers(pandalId);
  const { members: festivalMembers } = useFestivalMembers(pandalId, festivalId);
  const { can } = useGaneshPermissions();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const defaultTarget = festival?.contributionTargetAmount ?? 0;

  const allRows = useMemo(
    () =>
      pandalMembers
        .filter((member) => member.status === "active" || member.status == null)
        .map((member) =>
          buildRow(
            member,
            festivalMembers.find((item) => item.userId === member.userId),
            defaultTarget
          )
        )
        .sort((a, b) => {
          const order = { pending: 0, partial: 1, paid: 2, waived: 3 };
          const statusDiff = order[a.status] - order[b.status];
          if (statusDiff !== 0) return statusDiff;
          return a.name.localeCompare(b.name);
        }),
    [defaultTarget, festivalMembers, pandalMembers]
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) || row.roleLabel.toLowerCase().includes(needle)
      );
    });
  }, [allRows, filter, query]);

  const paidCount = allRows.filter((row) => row.status === "paid").length;
  const pendingCount = allRows.filter((row) => row.status === "pending").length;

  const canRecord = can("contributions.create") && festival?.status === "open";
  const openAdd = useCallback(
    () => push("/(ganesh)/add-member-payment" as never),
    [push]
  );

  const onOpen = useCallback(
    (userId: string) => push(`/(ganesh)/member/${userId}` as never),
    [push]
  );
  const onPay = useCallback(
    (userId: string) => push(`/(ganesh)/add-member-payment?memberId=${userId}` as never),
    [push]
  );

  const renderItem = useCallback(
    ({ item }: { item: CommitteeRow }) => (
      <CommitteePersonRow row={item} canRecord={canRecord} onOpen={onOpen} onPay={onPay} />
    ),
    [canRecord, onOpen, onPay]
  );

  return (
    <GaneshScreen
      safeTop
      scroll={false}
      withTabBar
      overlay={
        canRecord ? (
          <View style={[styles.fab, { bottom: listPadding - 24 }]} pointerEvents="box-none">
            <AddFab onPress={openAdd} accessibilityLabel="Record committee payment" size="lg" />
          </View>
        ) : null
      }
    >
      <GaneshHeader
        title="Committee"
        subtitle={festival?.name}
        icon={<Users size={22} color={g.saffron} strokeWidth={2.2} />}
        rightElement={<GaneshSyncChip />}
      />

      <View style={styles.statRow}>
        <StatTile
          label="Committee paid"
          meta={
            <Text
              style={[
                styles.tileMeta,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              {allRows.length} {allRows.length === 1 ? "person" : "people"}
            </Text>
          }
        >
          {/* A dash, not zero, until the figure is real (GS-032). */}
          {summaryLoading ? (
            <MetaLabel>—</MetaLabel>
          ) : (
            <Money
              value={summary.committeeContributions}
              size="primary"
              tone="positive"
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          )}
        </StatTile>
        <StatTile
          label="Paid"
          meta={
            <Text
              style={[
                styles.tileMeta,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              of {allRows.length}
            </Text>
          }
        >
          <Text
            style={[
              styles.count,
              { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
            ]}
          >
            {paidCount}
          </Text>
        </StatTile>
        <StatTile
          label="Not paid"
          meta={
            <Text
              style={[
                styles.tileMeta,
                {
                  color: pendingCount > 0 ? theme.colors.warning : theme.colors.mutedForeground,
                  fontFamily: theme.fontFamily.regular,
                },
              ]}
            >
              {pendingCount > 0 ? "Needs follow-up" : "All done"}
            </Text>
          }
        >
          <Text
            style={[
              styles.count,
              {
                color: pendingCount > 0 ? theme.colors.warning : theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
              },
            ]}
          >
            {pendingCount}
          </Text>
        </StatTile>
      </View>

      <SearchBar value={query} onChangeText={setQuery} placeholder="Search name or role" />

      <FilterChips value={filter} options={FILTER_OPTIONS} onChange={setFilter} />

      <FlashList
        data={rows}
        style={styles.list}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={{ paddingBottom: listPadding }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <ListStateView
            loading={loading && allRows.length === 0}
            error={error}
            illustration="splits"
            title={
              query.trim() || filter !== "all" ? "Nobody matches" : "No committee people yet"
            }
            description={
              query.trim() || filter !== "all"
                ? "Try another filter or clear the search."
                : "Approve a join request, or record a payment to start tracking this festival."
            }
            action={
              canRecord && !query.trim() && filter === "all"
                ? { label: "Record payment", onPress: openAdd }
                : undefined
            }
          />
        }
      />
    </GaneshScreen>
  );
}

const CommitteePersonRow = memo(function CommitteePersonRow({
  row,
  canRecord,
  onOpen,
  onPay,
}: {
  row: CommitteeRow;
  canRecord: boolean;
  onOpen: (userId: string) => void;
  onPay: (userId: string) => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  const pct = row.target > 0 ? Math.min(100, Math.round((row.paid / row.target) * 100)) : 0;
  const trackColor =
    row.status === "paid"
      ? g.godFund
      : row.status === "partial"
        ? theme.colors.warning
        : theme.colors.mutedForeground;

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onOpen(row.userId);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${row.roleLabel}, ${STATUS_LABEL[row.status]}`}
      android_ripple={{
        color: g.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
        borderless: false,
      }}
      style={({ pressed }) => [
        styles.person,
        { backgroundColor: theme.colors.card, borderColor: g.divider },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={styles.personTop}>
        <Avatar name={row.name} seed={row.userId} />

        <View style={styles.personCopy}>
          <Text
            numberOfLines={1}
            style={[
              styles.personName,
              { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
            ]}
          >
            {row.name}
          </Text>
          <View style={styles.personMetaLine}>
            <Text
              numberOfLines={1}
              style={[
                styles.personMeta,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              {row.roleLabel}
              {row.customTarget ? " · Custom target" : ""}
            </Text>
            <StatusBadge
              kind={row.status === "waived" ? "neutral" : row.status === "pending" ? "pending" : row.status}
              label={STATUS_LABEL[row.status]}
              size="sm"
            />
          </View>
        </View>

        <View style={styles.personValue}>
          <Money value={row.paid} size="primary" />
          {row.target > 0 ? <MetaLabel>of {formatInr(row.target)}</MetaLabel> : null}
        </View>

        <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2} />
      </View>

      {row.target > 0 ? <ProgressTrack pct={pct} color={trackColor} /> : null}

      {row.due > 0 || row.personalExpenses > 0 || row.pendingReimbursement > 0 ? (
        <Text
          numberOfLines={2}
          style={[
            styles.personFooter,
            { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
          ]}
        >
          {[
            row.due > 0 ? `Due ${formatInr(row.due)}` : null,
            row.personalExpenses > 0 ? `Personal spent ${formatInr(row.personalExpenses)}` : null,
            row.pendingReimbursement > 0
              ? `Reimburse ${formatInr(row.pendingReimbursement)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ) : null}

      {canRecord && row.status !== "paid" ? (
        <Pressable
          onPress={() => {
            void haptic.selection();
            onPay(row.userId);
          }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Record payment for ${row.name}`}
          style={({ pressed }) => [
            styles.recordButton,
            { backgroundColor: g.wash(g.saffron) },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Plus size={14} color={g.saffron} strokeWidth={2.6} />
          <Text
            style={[
              styles.recordLabel,
              { color: g.saffron, fontFamily: theme.fontFamily.semibold },
            ]}
          >
            Record payment
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  separator: {
    height: 10,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  tileMeta: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  count: {
    fontSize: 17,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  fab: {
    position: "absolute",
    right: 16,
  },
  person: {
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10,
    overflow: "hidden",
  },
  personTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  personName: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  personMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    minWidth: 0,
  },
  personMeta: {
    fontSize: 11.5,
    flexShrink: 1,
  },
  personValue: {
    alignItems: "flex-end",
    gap: 1,
  },
  personFooter: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  recordLabel: {
    fontSize: 12.5,
  },
});

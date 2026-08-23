import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";

import { EmptyState } from "@/components/common/EmptyState";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { AddFab } from "@/components/ui/AddFab";
import { Input } from "@/components/ui/Input";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalMembers } from "@/hooks/usePandalMembers";
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

const FILTERS = ["all", "paid", "partial", "pending"] as const;
const STATUS_LABEL: Record<CommitteePayStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  pending: "Not paid",
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
  const customTarget = Boolean(festivalMember?.contributionTargetOverridden);
  return {
    userId: member.userId,
    name: member.displayName,
    roleLabel: ganeshRoleLabel(member.role),
    paid,
    target,
    due: memberRemainingContribution({ contributionPaid: paid, contributionTarget: target }),
    status: committeePayStatus(paid, target, customTarget),
    customTarget,
    personalExpenses: festivalMember?.personalExpenses ?? 0,
    pendingReimbursement: festivalMember?.pendingReimbursement ?? 0,
  };
}

export default function CommitteeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { members: pandalMembers } = usePandalMembers(pandalId);
  const { members: festivalMembers } = useFestivalMembers(pandalId, festivalId);
  const { can } = useGaneshPermissions();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
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
          const order = { pending: 0, partial: 1, paid: 2 };
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
      return row.name.toLowerCase().includes(needle) || row.roleLabel.toLowerCase().includes(needle);
    });
  }, [allRows, filter, query]);

  const paidCount = allRows.filter((row) => row.status === "paid").length;
  const pendingCount = allRows.filter((row) => row.status === "pending").length;

  const onOpen = useCallback(
    (userId: string) => {
      push(`/(ganesh)/member/${userId}` as never);
    },
    [push]
  );
  const onPay = useCallback(
    (userId: string) => {
      push(`/(ganesh)/add-member-payment?memberId=${userId}` as never);
    },
    [push]
  );

  const renderItem = useCallback(
    ({ item }: { item: CommitteeRow }) => (
      <CommitteePersonRow
        userId={item.userId}
        name={item.name}
        roleLabel={item.roleLabel}
        paid={item.paid}
        target={item.target}
        due={item.due}
        status={item.status}
        customTarget={item.customTarget}
        personalExpenses={item.personalExpenses}
        pendingReimbursement={item.pendingReimbursement}
        canRecord={can("contributions.create") && festival?.status === "open"}
        onOpen={onOpen}
        onPay={onPay}
      />
    ),
    [can, festival?.status, onOpen, onPay]
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: 16,
        paddingTop: insets.top + 16,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Committee
        </Text>
        <GaneshSyncChip />
      </View>
      <Text style={{ color: theme.colors.mutedForeground }}>
        {festival?.name ?? "Festival"} · track who paid their committee share. A Pandal Admin can
        set a lower target for a child or anyone who should pay less.
      </Text>
      <MetricGrid
        items={[
          { label: "Committee paid", value: summary.committeeContributions },
          { label: "People", value: `${allRows.length}` },
          { label: "Paid", value: `${paidCount}` },
          { label: "Not paid", value: `${pendingCount}` },
        ]}
      />
      <Input value={query} onChangeText={setQuery} placeholder="Search committee" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FILTERS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: filter === item ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: filter === item ? theme.colors.primaryForeground : theme.colors.foreground,
                fontWeight: "700",
                textTransform: "capitalize",
              }}
            >
              {item === "pending" ? "Not paid" : item}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlashList
        data={rows}
        style={{ flex: 1 }}
        keyExtractor={(item) => item.userId}
        renderItem={renderItem}
        ListEmptyComponent={
          <EmptyState
            title="No committee people yet"
            description="Approve join requests or add a payment to start tracking this festival."
          />
        }
      />
      {festival?.status === "open" && can("contributions.create") ? (
        <AddFab
          onPress={() => push("/(ganesh)/add-member-payment" as never)}
          accessibilityLabel="Record committee payment"
        />
      ) : null}
    </View>
  );
}

const CommitteePersonRow = memo(function CommitteePersonRow({
  userId,
  name,
  roleLabel,
  paid,
  target,
  due,
  status,
  customTarget,
  personalExpenses,
  pendingReimbursement,
  canRecord,
  onOpen,
  onPay,
}: {
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
  canRecord: boolean;
  onOpen: (userId: string) => void;
  onPay: (userId: string) => void;
}) {
  const { theme } = useTheme();
  const statusColor =
    status === "paid"
      ? theme.colors.primary
      : status === "partial"
        ? theme.colors.foreground
        : theme.colors.mutedForeground;

  return (
    <Pressable
      onPress={() => onOpen(userId)}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700", flex: 1 }}>{name}</Text>
        <Text style={{ color: statusColor, fontWeight: "800" }}>{STATUS_LABEL[status]}</Text>
      </View>
      <Text style={{ color: theme.colors.mutedForeground }}>
        {roleLabel}
        {customTarget ? " · Custom target" : ""}
      </Text>
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
        {formatInr(paid)}
        {target > 0 ? ` / ${formatInr(target)}` : ""} this festival
      </Text>
      {due > 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>Due {formatInr(due)}</Text>
      ) : null}
      {personalExpenses > 0 || pendingReimbursement > 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Personal spent {formatInr(personalExpenses)}
          {pendingReimbursement > 0 ? ` · Reimburse ${formatInr(pendingReimbursement)}` : ""}
        </Text>
      ) : null}
      {canRecord && status !== "paid" ? (
        <Pressable onPress={() => onPay(userId)}>
          <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Record payment</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
});

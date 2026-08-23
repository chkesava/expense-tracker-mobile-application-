import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { GaneshSyncChip, PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { AddFab } from "@/components/ui/AddFab";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/Input";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { ContributionKind, GaneshContribution } from "@/shared/types/ganesh";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import {
  contributionStatusLabel,
  contributionValue,
  isCancelled,
  isOverdue,
  isPromised,
  isReceived,
  summarizeContributions,
} from "@/shared/utils/ganeshContributions";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS_FILTERS = ["all", "promised", "received", "cancelled", "overdue"] as const;
const KIND_FILTERS = ["all", "money", "item", "service", "sponsorship"] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];
type KindFilter = (typeof KIND_FILTERS)[number];

const STATUS_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "promised", label: "Promised" },
  { id: "received", label: "Received" },
  { id: "cancelled", label: "Cancelled" },
  { id: "overdue", label: "Overdue" },
];
const KIND_OPTIONS: Array<{ id: KindFilter; label: string }> = [
  { id: "all", label: "All kinds" },
  { id: "money", label: "Money" },
  { id: "item", label: "Items" },
  { id: "service", label: "Service" },
  { id: "sponsorship", label: "Sponsorship" },
];

function asStatusFilter(value?: string): StatusFilter | undefined {
  return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : undefined;
}

function asKindFilter(value?: string): KindFilter | undefined {
  return KIND_FILTERS.includes(value as KindFilter) ? (value as KindFilter) : undefined;
}

const ContributionCard = memo(function ContributionCard({
  id,
  title,
  amountLabel,
  metaLabel,
  badge,
  contributedBy,
  enteredBy,
  at,
  date,
  photoPath,
  pandalId,
  festivalId,
  pending,
  onOpen,
}: {
  id: string;
  title: string;
  amountLabel: string;
  metaLabel: string;
  badge: "promised" | "received" | "cancelled" | "overdue";
  contributedBy: string;
  enteredBy: string;
  at?: GaneshContribution["createdAt"];
  date?: string;
  photoPath?: string;
  pandalId?: string | null;
  festivalId?: string | null;
  pending?: boolean;
  onOpen: (id: string) => void;
}) {
  const { theme } = useTheme();
  const badgeStyle =
    badge === "overdue"
      ? { backgroundColor: theme.colors.destructive, color: theme.colors.destructiveForeground }
      : badge === "received"
        ? { backgroundColor: theme.colors.success, color: theme.colors.successForeground }
        : badge === "cancelled"
          ? { backgroundColor: theme.colors.muted, color: theme.colors.mutedForeground }
          : { backgroundColor: theme.colors.warning, color: theme.colors.warningForeground };

  return (
    <Pressable
      onPress={() => onOpen(id)}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        gap: 4,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700", flex: 1 }}>{title}</Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: badgeStyle.backgroundColor,
          }}
        >
          <Text style={{ color: badgeStyle.color, fontWeight: "700", fontSize: 12, textTransform: "capitalize" }}>
            {badge}
          </Text>
        </View>
      </View>
      <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>{amountLabel}</Text>
      <Text style={{ color: theme.colors.mutedForeground }}>{metaLabel}</Text>
      <AccountabilityLine contributedBy={contributedBy} enteredBy={enteredBy} at={at} date={date} />
      {pandalId && festivalId && photoPath ? (
        <GaneshSignedPreview path={photoPath} pandalId={pandalId} festivalId={festivalId} />
      ) : null}
      <PendingHint pending={pending} />
    </Pressable>
  );
});

export default function ContributionsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { push } = useRouter();
  const params = useLocalSearchParams<{ status?: string; kind?: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => asStatusFilter(params.status) ?? "all"
  );
  const [kindFilter, setKindFilter] = useState<KindFilter>(
    () => asKindFilter(params.kind) ?? "all"
  );
  const [search, setSearch] = useState("");
  const { can } = useGaneshPermissions();
  const today = todayDateInput();
  const totals = useMemo(() => summarizeContributions(contributions, today), [contributions, today]);

  useEffect(() => {
    const nextStatus = asStatusFilter(params.status);
    if (nextStatus) setStatusFilter(nextStatus);
  }, [params.status]);

  useEffect(() => {
    const nextKind = asKindFilter(params.kind);
    if (nextKind) setKindFilter(nextKind);
  }, [params.kind]);

  const onOpen = useCallback(
    (id: string) => {
      push(`/(ganesh)/contribution/${id}` as never);
    },
    [push]
  );

  const rows = useMemo(
    () =>
      contributions.filter((row) => {
        if (row.voided) return false;
        if (kindFilter !== "all" && row.kind !== kindFilter) return false;
        if (statusFilter === "promised" && !isPromised(row)) return false;
        if (statusFilter === "received" && !isReceived(row)) return false;
        if (statusFilter === "cancelled" && !isCancelled(row)) return false;
        if (statusFilter === "overdue" && !isOverdue(row, today)) return false;
        if (search.trim() && !row.contributorName.toLowerCase().includes(search.trim().toLowerCase())) {
          return false;
        }
        return true;
      }),
    [contributions, kindFilter, search, statusFilter, today]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16, paddingTop: insets.top + 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Contributions
        </Text>
        <GaneshSyncChip />
      </View>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Promised amounts are not cash and are not part of God Fund.
      </Text>
      <MetricGrid
        items={[
          { label: "Cash received", value: totals.cashReceived },
          { label: "Promised cash", value: totals.promisedCash },
          { label: "In-kind received", value: totals.inKindReceived },
          { label: "Promised in-kind", value: totals.promisedInKind },
        ]}
      />
      <ChoiceChips label="Status" value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
      <ChoiceChips label="Kind" value={kindFilter} options={KIND_OPTIONS} onChange={setKindFilter} />
      <Input
        label="Search contributor"
        value={search}
        onChangeText={setSearch}
        placeholder="Name"
      />
      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: GaneshContribution }) => {
          const photoPath = ganeshStoredPath(item.photo, item.photoPath);
          return (
            <ContributionCard
              id={item.id}
              title={item.itemName || item.contributorName}
              amountLabel={formatInr(contributionValue(item))}
              metaLabel={`${item.kind}${item.quantity ? ` · ${item.quantity}` : ""}`}
              badge={contributionStatusLabel(item, today)}
              contributedBy={item.contributorName}
              enteredBy={memberDisplayName(members, item.createdBy)}
              at={item.createdAt}
              date={item.date}
              photoPath={photoPath}
              pandalId={pandalId}
              festivalId={festivalId}
              pending={item.pendingWrite}
              onOpen={onOpen}
            />
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No contributions yet"
            description="Record money, idols, laddus, services, or sponsorships. Promised gifts never increase cash."
          />
        }
      />
      {festival?.status === "open" && can("contributions.create") ? (
        <AddFab
          onPress={() => push("/(ganesh)/add-contribution" as never)}
          accessibilityLabel="Add contribution"
        />
      ) : null}
    </View>
  );
}

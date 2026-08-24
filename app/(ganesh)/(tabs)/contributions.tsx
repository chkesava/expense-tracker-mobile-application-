import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { Building2, Gift, HandHeart, IndianRupee, Package } from "lucide-react-native";

import { accountabilityText } from "@/components/ganesh/AccountabilityLine";
import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import {
  FilterChips,
  GaneshHeader,
  LedgerRow,
  ListStateView,
  MetaLabel,
  Money,
  StatTile,
  StatusStrip,
  useGaneshTokens,
  type StatusKind,
} from "@/components/ganesh/ui";
import { SearchBar } from "@/components/common/SearchBar";
import { AddFab } from "@/components/ui/AddFab";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatGaneshWhen, memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
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
  { id: "overdue", label: "Overdue" },
  { id: "cancelled", label: "Cancelled" },
];

const KIND_OPTIONS: Array<{ id: KindFilter; label: string }> = [
  { id: "all", label: "All kinds" },
  { id: "money", label: "Money" },
  { id: "item", label: "Items" },
  { id: "service", label: "Service" },
  { id: "sponsorship", label: "Sponsors" },
];

const KIND_LABEL: Record<ContributionKind, string> = {
  money: "Money",
  item: "Item",
  service: "Service",
  sponsorship: "Sponsorship",
};

function kindIcon(kind: ContributionKind) {
  switch (kind) {
    case "money":
      return IndianRupee;
    case "item":
      return Package;
    case "service":
      return HandHeart;
    default:
      return Building2;
  }
}

function asStatusFilter(value?: string): StatusFilter | undefined {
  return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : undefined;
}

function asKindFilter(value?: string): KindFilter | undefined {
  return KIND_FILTERS.includes(value as KindFilter) ? (value as KindFilter) : undefined;
}

export default function ContributionsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const listPadding = useGaneshListPadding();
  const params = useLocalSearchParams<{ status?: string; kind?: string }>();

  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { contributions, loading, error } = useContributions(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const { can } = useGaneshPermissions();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => asStatusFilter(params.status) ?? "all"
  );
  const [kindFilter, setKindFilter] = useState<KindFilter>(() => asKindFilter(params.kind) ?? "all");
  const [search, setSearch] = useState("");

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

  const canAdd = festival?.status === "open" && can("contributions.create");
  const openAdd = useCallback(() => push("/(ganesh)/add-contribution" as never), [push]);
  const onOpen = useCallback(
    (id: string) => push(`/(ganesh)/contribution/${id}` as never),
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
        if (
          search.trim()
          && !row.contributorName.toLowerCase().includes(search.trim().toLowerCase())
          && !(row.itemName ?? "").toLowerCase().includes(search.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [contributions, kindFilter, search, statusFilter, today]
  );

  const renderItem = useCallback(
    ({ item }: { item: GaneshContribution }) => {
      const photoPath = ganeshStoredPath(item.photo, item.photoPath);
      const status = contributionStatusLabel(item, today) as StatusKind;
      const Icon = kindIcon(item.kind);
      const isCash = item.kind === "money";
      const promised = isPromised(item);

      return (
        <LedgerRow
          id={item.id}
          icon={<Icon size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
          title={item.itemName || item.contributorName}
          meta={
            [KIND_LABEL[item.kind], item.quantity || null].filter(Boolean).join(" · ")
          }
          badges={[{ kind: status }]}
          amount={contributionValue(item)}
          amountMeta={!isCash ? <MetaLabel>Estimated</MetaLabel> : undefined}
          attribution={accountabilityText({
            contributedBy: item.contributorName,
            enteredBy: memberDisplayName(members, item.createdBy),
          })}
          when={
            promised && item.expectedDate
              ? `Expected ${item.expectedDate}`
              : formatGaneshWhen(item.createdAt, item.date)
          }
          media={
            pandalId && festivalId && photoPath ? (
              <GaneshSignedPreview path={photoPath} pandalId={pandalId} festivalId={festivalId} />
            ) : null
          }
          pending={item.pendingWrite}
          onPress={onOpen}
        />
      );
    },
    [festivalId, members, onOpen, pandalId, theme.colors.mutedForeground, today]
  );

  return (
    <GaneshScreen
      safeTop
      scroll={false}
      overlay={
        canAdd ? (
          <View style={[styles.fab, { bottom: listPadding - 24 }]} pointerEvents="box-none">
            <AddFab onPress={openAdd} accessibilityLabel="Add contribution" size="lg" />
          </View>
        ) : null
      }
    >
      <GaneshHeader
        title="Contributions"
        subtitle={festival?.name}
        icon={<Gift size={22} color={g.saffron} strokeWidth={2.2} />}
        rightElement={<GaneshSyncChip />}
      />

      <View style={styles.statRow}>
        <StatTile
          label="Received"
          meta={
            <Text
              style={[styles.tileMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            >
              Cash · in the God Fund
            </Text>
          }
        >
          <Money value={totals.cashReceived} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
        </StatTile>
        <StatTile
          label="In-kind received"
          meta={
            <Text
              style={[styles.tileMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            >
              Estimated value
            </Text>
          }
        >
          <Money value={totals.inKindReceived} size="primary" numberOfLines={1} adjustsFontSizeToFit />
        </StatTile>
      </View>

      {totals.promisedCount > 0 ? (
        <StatusStrip
          tone="warning"
          icon={<Gift size={14} color={theme.colors.warning} strokeWidth={2.3} />}
          message={`${totals.promisedCount} promised — not counted as cash until received${
            totals.overdueCount > 0 ? ` · ${totals.overdueCount} overdue` : ""
          }`}
        />
      ) : null}

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search contributor or item" />

      <FilterChips value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
      <FilterChips value={kindFilter} options={KIND_OPTIONS} onChange={setKindFilter} />

      <FlashList
        data={rows}
        style={styles.list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: listPadding }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <ListStateView
            loading={loading}
            error={error}
            illustration="splits"
            title={
              search.trim() || statusFilter !== "all" || kindFilter !== "all"
                ? "Nothing matches these filters"
                : "No contributions yet"
            }
            description={
              search.trim() || statusFilter !== "all" || kindFilter !== "all"
                ? "Clear a filter to see the rest of this festival's support."
                : "Record money, idols, laddus, services, or sponsorships. Promised gifts never increase cash."
            }
            action={
              canAdd && !search.trim() && statusFilter === "all" && kindFilter === "all"
                ? { label: "Add contribution", onPress: openAdd }
                : undefined
            }
          />
        }
      />
    </GaneshScreen>
  );
}

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
  fab: {
    position: "absolute",
    right: 16,
  },
});

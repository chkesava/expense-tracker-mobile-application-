import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
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
  useGaneshTokens,
  type StatusKind,
} from "@/components/ganesh/ui";
import { SearchBar } from "@/components/common/SearchBar";
import { AddFab } from "@/components/ui/AddFab";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import type { ContributionKind, GaneshContribution } from "@/shared/types/ganesh";
import {
  MONEY_RECEIVE_OFFLINE_ERROR,
  contributionStatusLabel,
  contributionValue,
  isCancelled,
  isOverdue,
  isPromised,
  isReceived,
  summarizeContributions,
} from "@/shared/utils/ganeshContributions";
import { formatGaneshWhen, memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS_FILTERS = ["all", "promised", "received", "cancelled", "overdue"] as const;
const KIND_FILTERS = ["all", "money", "item", "service", "sponsorship"] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];
type KindFilter = (typeof KIND_FILTERS)[number];

const STATUS_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "received", label: "Received" },
  { id: "promised", label: "Promised" },
  { id: "overdue", label: "Pending" },
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

export type ContributionsListProps = {
  /**
   * Hosted inside Pandal Nidhi — skip the screen chrome. Filter/search
   * state stays here so the Funds wrapper and the deep-link route share one
   * implementation.
   */
  embedded?: boolean;
  /** Funds already shows Festival Report — skip the duplicate tiles. */
  hideSummary?: boolean;
  /** Festival chrome (cash position, ledger tabs) that scrolls with the list. */
  prefix?: ReactNode;
};

export function ContributionsList({
  embedded = false,
  hideSummary = false,
  prefix,
}: ContributionsListProps) {
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
  const writes = useGaneshWrites();
  const { isOnline } = useNetwork();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => asStatusFilter(params.status) ?? "all"
  );
  const [kindFilter, setKindFilter] = useState<KindFilter>(() => asKindFilter(params.kind) ?? "all");
  const [search, setSearch] = useState("");
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const today = todayDateInput();
  const totals = useMemo(() => summarizeContributions(contributions, today), [contributions, today]);
  const promisedTotal = totals.promisedCash + totals.promisedInKind;
  // GS-090: the header accounted for less than the list beneath it. "Received"
  // showed cash only, while "Promised" combined cash and in-kind — so
  // receiving a promised item made Promised fall with nothing rising to meet
  // it, and a received item, service or sponsorship-kind row appeared in the
  // list but in no metric at all.
  //
  // Kept out of the headline figure rather than added to it: that number is
  // cash in the God Fund, and folding donated goods into it would overstate
  // what the Pandal can actually spend. It goes on the tile's meta line, so
  // every row below is represented without conflating the two.
  const nonCashReceived = totals.inKindReceived + totals.sponsoredReceived;

  useEffect(() => {
    if (embedded) return;
    const nextStatus = asStatusFilter(params.status);
    if (nextStatus) setStatusFilter(nextStatus);
  }, [embedded, params.status]);

  useEffect(() => {
    if (embedded) return;
    const nextKind = asKindFilter(params.kind);
    if (nextKind) setKindFilter(nextKind);
  }, [embedded, params.kind]);

  const canAdd = festival?.status === "open" && can("contributions.create");
  const canReceive = festival?.status === "open" && can("contributions.receive");
  const openAdd = useCallback(() => push("/(ganesh)/add-contribution" as never), [push]);
  const onOpen = useCallback(
    (id: string) => push(`/(ganesh)/contribution/${id}` as never),
    [push]
  );

  const confirmReceive = useCallback(
    (item: GaneshContribution) => {
      if (item.kind === "money" && !isOnline) {
        toast.error(MONEY_RECEIVE_OFFLINE_ERROR);
        return;
      }
      const value = contributionValue(item);
      const message =
        item.kind === "money"
          ? `This adds ${formatInr(value)} to festival cash as cash. Open the contribution to choose UPI or bank.`
          : "This marks the gift as received. It does not change festival cash.";
      Alert.alert("Mark received?", message, [
        { text: "Not now", style: "cancel" },
        {
          text: "Mark received",
          onPress: () => {
            setReceivingId(item.id);
            writes
              .receiveContribution(item.id, {
                kind: item.kind,
                paymentMethod: item.kind === "money" ? "cash" : undefined,
              })
              .catch((caught) => {
                logError("ganesh.contributions.receive", caught);
                toast.error(friendlyErrorMessage(caught, "Could not mark received."));
              })
              .finally(() => setReceivingId(null));
          },
        },
      ]);
    },
    [isOnline, writes]
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
      const title = promised ? item.contributorName : item.itemName || item.contributorName;
      const kindLine = [KIND_LABEL[item.kind], item.quantity || null].filter(Boolean).join(" · ");
      const meta = promised && item.itemName ? `${kindLine} · ${item.itemName}` : kindLine;

      return (
        <LedgerRow
          id={item.id}
          icon={<Icon size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
          title={title}
          meta={meta}
          badges={[{ kind: status, label: status === "overdue" ? "Pending" : undefined }]}
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
          action={
            promised && canReceive
              ? {
                  label: receivingId === item.id ? "Saving…" : "Mark received",
                  onPress: () => confirmReceive(item),
                  disabled: receivingId === item.id,
                }
              : undefined
          }
        />
      );
    },
    [
      canReceive,
      confirmReceive,
      festivalId,
      members,
      onOpen,
      pandalId,
      receivingId,
      theme.colors.mutedForeground,
      today,
    ]
  );

  const chrome = (
    <>
      {embedded ? null : (
        <GaneshHeader
          title="Contributions"
          subtitle={festival?.name}
          icon={<Gift size={22} color={g.saffron} strokeWidth={2.2} />}
          rightElement={<GaneshSyncChip />}
        />
      )}

      {hideSummary ? null : (
        <View style={styles.statRow}>
          <StatTile
            label="Received"
            meta={
              <Text
                style={[styles.tileMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
              >
                {nonCashReceived > 0
                  ? `Cash · in the God Fund · plus ${formatInr(nonCashReceived)} in kind`
                  : "Cash · in the God Fund"}
              </Text>
            }
          >
            <Money value={totals.cashReceived} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
          <StatTile
            label="Promised"
            meta={
              <Text
                style={[styles.tileMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
              >
                Not cash until received
              </Text>
            }
          >
            <Money value={promisedTotal} size="primary" tone="warning" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
          <StatTile
            label="Pending"
            meta={
              totals.overdueCount > 0 ? (
                <Text style={[styles.tileMeta, { color: theme.colors.warning, fontFamily: theme.fontFamily.medium }]}>
                  Past the expected day
                </Text>
              ) : (
                <Text
                  style={[
                    styles.tileMeta,
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                  ]}
                >
                  None overdue
                </Text>
              )
            }
          >
            <Text
              style={[
                styles.count,
                {
                  color: totals.overdueCount > 0 ? theme.colors.warning : theme.colors.foreground,
                  fontFamily: theme.fontFamily.semibold,
                },
              ]}
            >
              {totals.overdueCount}
            </Text>
          </StatTile>
        </View>
      )}

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search contributor or item" />

      <FilterChips value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
      <FilterChips value={kindFilter} options={KIND_OPTIONS} onChange={setKindFilter} />
    </>
  );

  const list = (
    <FlashList
      data={rows}
      style={styles.list}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: listPadding }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={renderItem}
      ListHeaderComponent={
        embedded ? (
          <View style={styles.embeddedHeader}>
            {prefix}
            {chrome}
          </View>
        ) : undefined
      }
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
  );

  const fab = canAdd ? (
    <View style={[styles.fab, { bottom: listPadding - 24 }]} pointerEvents="box-none">
      <AddFab onPress={openAdd} accessibilityLabel="Add contribution" size="lg" />
    </View>
  ) : null;

  if (embedded) {
    return (
      <View style={styles.fill}>
        {list}
        {fab}
      </View>
    );
  }

  return (
    <GaneshScreen safeTop scroll={false} overlay={fab}>
      {chrome}
      {list}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  embeddedHeader: {
    gap: 10,
    paddingBottom: 10,
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
});

import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { Home as HomeIcon, IndianRupee, Smartphone, Wallet } from "lucide-react-native";

import { accountabilityText } from "@/components/ganesh/AccountabilityLine";
import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import {
  FilterChips,
  FundHero,
  GaneshHeader,
  LedgerRow,
  ListStateView,
  useGaneshTokens,
  type LedgerRowBadge,
} from "@/components/ganesh/ui";
import { SearchBar } from "@/components/common/SearchBar";
import { AddFab } from "@/components/ui/AddFab";
import { useCollections } from "@/hooks/useCollections";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshCollection, Household, HouseholdStatus } from "@/shared/types/ganesh";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

type Filter = "all" | "paid" | "partial" | "pending" | "cash" | "upi";

const FILTER_OPTIONS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All houses" },
  { id: "paid", label: "Paid" },
  { id: "partial", label: "Partial" },
  { id: "pending", label: "Pending" },
  { id: "cash", label: "Cash entries" },
  { id: "upi", label: "UPI entries" },
];

function householdBadge(status: HouseholdStatus): LedgerRowBadge {
  switch (status) {
    case "paid":
      return { kind: "paid" };
    case "partial":
      return { kind: "partial" };
    case "not_interested":
      return { kind: "cancelled", label: "Not interested" };
    case "not_available":
      return { kind: "neutral", label: "Not available" };
    default:
      return { kind: "pending" };
  }
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank",
  other: "Other",
};

export type CollectionsListProps = {
  embedded?: boolean;
};

export function CollectionsList({ embedded = false }: CollectionsListProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const listPadding = useGaneshListPadding();

  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { households, loading: householdsLoading, error: householdsError } = useHouseholds(
    pandalId,
    festivalId
  );
  const { collections, loading: collectionsLoading, error: collectionsError } = useCollections(
    pandalId,
    festivalId
  );
  const { members } = usePandalMembers(pandalId);
  const { can } = useGaneshPermissions();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const isEntryView = filter === "cash" || filter === "upi";

  const visibleHouseholds = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return households.filter((household) => {
      if (filter === "paid" || filter === "partial" || filter === "pending") {
        if (household.status !== filter) return false;
      }
      if (!needle) return true;
      return (
        household.name.toLowerCase().includes(needle)
        || (household.houseNumber ?? "").toLowerCase().includes(needle)
        || (household.mobile ?? "").includes(needle)
      );
    });
  }, [households, query, filter]);

  const visibleCollections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return collections.filter((row) => {
      if (row.voided) return false;
      if (isEntryView && row.paymentMethod !== filter) return false;
      if (!needle) return true;
      return (
        row.donorName.toLowerCase().includes(needle)
        || (row.houseNumber ?? "").toLowerCase().includes(needle)
        || (row.mobile ?? "").includes(needle)
      );
    });
  }, [collections, filter, isEntryView, query]);

  const paidHouses = households.filter((household) => household.status === "paid").length;
  const pendingHouses = households.filter((household) => household.status === "pending").length;

  const canAdd = festival?.status === "open" && can("collections.create");
  const openAdd = useCallback(() => push("/(ganesh)/add-collection" as never), [push]);

  const renderHousehold = useCallback(
    (item: Household) => (
      <LedgerRow
        id={item.id}
        icon={<HomeIcon size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
        title={item.name}
        meta={
          [
            item.houseNumber ? `House ${item.houseNumber}` : null,
            item.expectedAmount > 0 ? `Target ${formatInr(item.expectedAmount)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        badges={[householdBadge(item.status)]}
        amount={item.collectedAmount}
        pending={item.pendingWrite}
        onPress={(id) => push(`/(ganesh)/household/${id}` as never)}
      />
    ),
    [push, theme.colors.mutedForeground]
  );

  const renderCollection = useCallback(
    (item: GaneshCollection) => (
      <LedgerRow
        id={item.id}
        icon={
          item.paymentMethod === "upi" ? (
            <Smartphone size={18} color={g.godFund} strokeWidth={2.2} />
          ) : (
            <IndianRupee size={18} color={g.godFund} strokeWidth={2.2} />
          )
        }
        iconTint={g.wash(g.godFund)}
        title={item.donorName}
        meta={
          [
            METHOD_LABEL[item.paymentMethod] ?? item.paymentMethod,
            item.houseNumber ? `House ${item.houseNumber}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
        amount={item.amount}
        attribution={accountabilityText({
          collectedBy: memberDisplayName(members, item.collectorId),
          enteredBy: memberDisplayName(members, item.createdBy),
        })}
        when={formatGaneshWhen(item.createdAt, item.date)}
        pending={item.pendingWrite}
      />
    ),
    [g, members]
  );

  const loading = isEntryView ? collectionsLoading : householdsLoading;
  const error = isEntryView ? collectionsError : householdsError;
  const data = (isEntryView ? visibleCollections : visibleHouseholds) as Array<
    Household | GaneshCollection
  >;

  const chrome = (
    <>
      {embedded ? null : (
        <GaneshHeader
          title="Collections"
          subtitle={festival?.name}
          icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />}
          rightElement={<GaneshSyncChip />}
        />
      )}

      <FundHero
        eyebrow="Collected this festival"
        amount={summary.chanda}
        kind="god"
        footer={
          <Text
            style={[styles.counts, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          >
            {summary.collectionCount} {summary.collectionCount === 1 ? "donor" : "donors"} ·{" "}
            {paidHouses} paid {paidHouses === 1 ? "house" : "houses"} · {pendingHouses} pending
          </Text>
        }
      />

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search name, house, or mobile"
      />

      <FilterChips value={filter} options={FILTER_OPTIONS} onChange={setFilter} />
    </>
  );

  const list = (
    <FlashList
      data={data}
      style={styles.list}
      keyExtractor={(item) => item.id}
      getItemType={(item) => ("donorName" in item ? "collection" : "household")}
      contentContainerStyle={{ paddingBottom: listPadding }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) =>
        "donorName" in item ? renderCollection(item) : renderHousehold(item)
      }
      ListHeaderComponent={
        embedded ? <View style={styles.embeddedHeader}>{chrome}</View> : undefined
      }
      ListEmptyComponent={
        <ListStateView
          loading={loading}
          error={error}
          illustration="collect"
          title={query.trim() ? "No matches" : "No collections yet"}
          description={
            query.trim()
              ? "Try a different name, house number, or mobile."
              : "Start recording your Chanda collection. Entries stay on the device if the network drops."
          }
          action={
            canAdd && !query.trim()
              ? { label: "Add collection", onPress: openAdd }
              : undefined
          }
        />
      }
    />
  );

  const fab = canAdd ? (
    <View style={[styles.fab, { bottom: listPadding - 24 }]} pointerEvents="box-none">
      <AddFab onPress={openAdd} accessibilityLabel="Add collection" size="lg" />
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
  counts: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  fab: {
    position: "absolute",
    right: 16,
  },
});

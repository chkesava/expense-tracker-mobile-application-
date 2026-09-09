import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { Home as HomeIcon, IndianRupee, Smartphone, Wallet } from "lucide-react-native";

import { accountabilityText } from "@/components/ganesh/AccountabilityLine";
import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshClosedBanner } from "@/components/ganesh/GaneshClosedBanner";
import { GaneshSessionBar } from "@/components/ganesh/GaneshSessionBar";
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
import { HOUSEHOLD_LIMIT, useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshCollection, Household, HouseholdStatus } from "@/shared/types/ganesh";
import { formatGaneshWhen, memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
import { buildFinancialOverview } from "@/shared/utils/ganeshFinancialOverview";
import { householdStatusLabel } from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

type Filter =
  | "all"
  | "open"
  | "pending"
  | "visited"
  | "promised"
  | "partial"
  | "paid"
  | "not_available"
  | "cash"
  | "upi"
  | "bank"
  | "other";

const FILTER_OPTIONS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All houses" },
  { id: "open", label: "Still to collect" },
  { id: "pending", label: "Not visited" },
  { id: "visited", label: "Visited" },
  { id: "promised", label: "Promised" },
  { id: "partial", label: "Partial" },
  { id: "paid", label: "Paid" },
  { id: "not_available", label: "Follow-up" },
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

const OPEN_STATUSES: ReadonlySet<HouseholdStatus> = new Set([
  "pending",
  "visited",
  "promised",
  "partial",
]);

function householdBadge(status: HouseholdStatus): LedgerRowBadge {
  switch (status) {
    case "paid":
      return { kind: "paid" };
    case "partial":
      return { kind: "partial" };
    case "promised":
      return { kind: "promised" };
    case "visited":
      return { kind: "pending", label: householdStatusLabel(status) };
    case "not_interested":
      return { kind: "cancelled", label: householdStatusLabel(status) };
    case "not_available":
      return { kind: "overdue", label: householdStatusLabel(status) };
    default:
      return { kind: "pending", label: householdStatusLabel(status) };
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
  /** Festival chrome (cash position, ledger tabs) that scrolls with the list. */
  prefix?: ReactNode;
};

export function CollectionsList({ embedded = false, prefix }: CollectionsListProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const listPadding = useGaneshListPadding();

  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    retry: retrySummary,
  } = useGaneshSummary(pandalId, festivalId);
  const {
    households,
    loading: householdsLoading,
    error: householdsError,
    truncated: householdsTruncated,
  } = useHouseholds(pandalId, festivalId);
  const { collections, loading: collectionsLoading, error: collectionsError } = useCollections(
    pandalId,
    festivalId
  );
  const { members } = usePandalMembers(pandalId);
  const { can } = useGaneshPermissions();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [collectorFilter, setCollectorFilter] = useState("all");

  const overview = useMemo(
    () =>
      buildFinancialOverview({
        summary,
        households,
        collections,
        festival,
        today: todayDateInput(),
      }),
    [summary, households, collections, festival]
  );

  const coverage = overview.collections;
  const isEntryView =
    filter === "cash" || filter === "upi" || filter === "bank" || filter === "other";

  const areaOptions = useMemo(() => {
    const areas = [...new Set(households.map((house) => (house.area ?? "").trim()).filter(Boolean))];
    areas.sort((a, b) => a.localeCompare(b));
    return areas;
  }, [households]);

  const collectorOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const house of households) {
      if (house.assignedCollectorId) ids.add(house.assignedCollectorId);
    }
    for (const row of collections) {
      if (!row.voided && row.collectorId) ids.add(row.collectorId);
    }
    return members.filter((member) => ids.has(member.userId));
  }, [collections, households, members]);

  const visibleHouseholds = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return households.filter((household) => {
      if (filter === "open") {
        if (!OPEN_STATUSES.has(household.status)) return false;
      } else if (
        filter === "paid"
        || filter === "partial"
        || filter === "pending"
        || filter === "visited"
        || filter === "promised"
        || filter === "not_available"
      ) {
        if (household.status !== filter) return false;
      }
      if (areaFilter !== "all" && (household.area ?? "").trim() !== areaFilter) return false;
      if (collectorFilter !== "all") {
        const assigned = household.assignedCollectorId === collectorFilter;
        const collected = collections.some(
          (row) => !row.voided && row.householdId === household.id && row.collectorId === collectorFilter
        );
        if (!assigned && !collected) return false;
      }
      if (!needle) return true;
      return (
        household.name.toLowerCase().includes(needle)
        || (household.houseNumber ?? "").toLowerCase().includes(needle)
        || (household.mobile ?? "").includes(needle)
        || (household.area ?? "").toLowerCase().includes(needle)
        || (household.assignedCollectorId
          ? memberDisplayName(members, household.assignedCollectorId)
              .toLowerCase()
              .includes(needle)
          : false)
      );
    });
  }, [areaFilter, collectorFilter, collections, filter, households, members, query]);

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
        || (row.receiptNumber ?? "").toLowerCase().includes(needle)
        || memberDisplayName(members, row.collectorId).toLowerCase().includes(needle)
      );
    });
  }, [collections, filter, isEntryView, members, query]);

  const canAdd = festival?.status === "open" && can("collections.create");
  const canAddHousehold = festival?.status === "open" && can("collections.update");
  const openAdd = useCallback(() => push("/(ganesh)/add-collection"), [push]);
  const openAddHousehold = useCallback(() => push("/(ganesh)/add-household" as Href), [push]);
  const viewPendingHouses = useCallback(() => setFilter("open"), []);

  const renderHousehold = useCallback(
    (item: Household) => (
      <LedgerRow
        id={item.id}
        icon={<HomeIcon size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
        title={item.name}
        meta={
          [
            item.houseNumber ? `House ${item.houseNumber}` : null,
            item.area ? item.area : null,
            item.expectedAmount > 0 ? `Target ${formatInr(item.expectedAmount)}` : null,
            // Assignment is only worth making if a collector can see it
            // without opening each house (GS-093).
            item.assignedCollectorId
              ? `For ${memberDisplayName(members, item.assignedCollectorId)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        badges={[householdBadge(item.status)]}
        amount={item.collectedAmount}
        pending={item.pendingWrite}
        onPress={(id) => push(`/(ganesh)/household/${id}`)}
      />
    ),
    [members, push, theme.colors.mutedForeground]
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
            item.houseNumber ? `House ${item.houseNumber}` : null,
            METHOD_LABEL[item.paymentMethod] ?? item.paymentMethod,
            memberDisplayName(members, item.collectorId),
            item.receiptNumber ?? "Receipt pending",
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

  // The household listener is capped (GS-065). A collector works through this
  // list door to door, so if the cap is actually reached they have to be told —
  // a silently short list reads as "these are all the houses", and the coverage
  // percentages above it would be computed over a partial set.
  const truncationNotice = householdsTruncated ? (
    <View
      style={[
        styles.coverageCard,
        { backgroundColor: theme.colors.card, borderColor: g.saffron },
      ]}
    >
      <Text
        style={[
          styles.coverageTitle,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
        ]}
      >
        Showing the first {HOUSEHOLD_LIMIT} houses
      </Text>
      <Text
        style={[
          styles.coverageMeta,
          { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
        ]}
      >
        This festival has more houses than the list can load at once, so the counts above cover
        only these. Search by name, house number or area to find a house that is not listed.
      </Text>
    </View>
  ) : null;

  const coverageStrip =
    coverage.countableHouses > 0 || coverage.today.count > 0 || coverage.byArea.length > 0 || coverage.promisedAmount > 0 || coverage.pendingHouses > 0 ? (
      <View
        style={[
          styles.coverageCard,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {coverage.countableHouses > 0 ? (
          <Text
            style={[
              styles.coverageTitle,
              { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
            ]}
          >
            {coverage.paidHouses} / {coverage.countableHouses} houses paid
            {coverage.coveragePct !== null ? ` · ${Math.round(coverage.coveragePct)}% received` : ""}
          </Text>
        ) : null}
        <Text
          style={[
            styles.coverageMeta,
            { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
          ]}
        >
          {[
            coverage.visitCoveragePct !== null
              ? `${Math.round(coverage.visitCoveragePct)}% visited`
              : null,
            coverage.promisedAmount > 0
              ? `Promised ${formatInr(coverage.promisedAmount)}`
              : coverage.promisedHouses > 0
                ? `${coverage.promisedHouses} promised`
                : null,
            coverage.collected > 0 ? `Received ${formatInr(coverage.collected)}` : null,
            coverage.pendingHouses > 0
              ? `${coverage.pendingHouses} still to collect`
              : coverage.countableHouses > 0
                ? "All countable houses are paid"
                : null,
            coverage.followUpHouses > 0 ? `${coverage.followUpHouses} follow-up` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {coverage.pendingHouses > 0 ? (
          <Pressable onPress={viewPendingHouses} accessibilityRole="button">
            <Text
              style={[
                styles.coverageAction,
                { color: g.saffron, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              View houses still to collect
            </Text>
          </Pressable>
        ) : null}
        {coverage.today.count > 0 ? (
          <Text
            style={[
              styles.coverageMeta,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
            ]}
          >
            Today · {coverage.today.count}{" "}
            {coverage.today.count === 1 ? "entry" : "entries"} · {formatInr(coverage.today.amount)}
            {" · "}
            Cash {formatInr(coverage.today.cash)} · UPI {formatInr(coverage.today.upi)}
            {coverage.today.bank > 0 ? ` · Bank ${formatInr(coverage.today.bank)}` : ""}
            {coverage.today.other > 0 ? ` · Other ${formatInr(coverage.today.other)}` : ""}
          </Text>
        ) : null}
        {coverage.byArea.length > 0 ? (
          <View style={styles.areaList}>
            {coverage.byArea.map((row) => (
              <Text
                key={row.area}
                style={[
                  styles.coverageMeta,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                {row.area}: {row.paid}/{row.total} paid
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    ) : null;

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

      {/* GS-032: "Collected this festival ₹0 · 0 donors · 0 paid houses" was
          rendered while the summary was still loading, and identically when it
          failed — a collector could read it as a drive that had brought in
          nothing. The rows below were already gated; the headline was not. */}
      {embedded ? null : summaryLoading ? (
        <ListStateView loading title="Loading the collection totals" skeletonCount={3} />
      ) : summaryError ? (
        <ListStateView
          error={summaryError}
          onRetry={retrySummary}
          title="We couldn't load the collection totals."
          description="Showing ₹0 here would read as nothing collected, so the figures stay hidden until they load."
        />
      ) : (
        <FundHero
          eyebrow="Collected this festival"
          amount={summary.chanda}
          kind="god"
          footer={
            <Text
              style={[
                styles.counts,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              {summary.collectionCount} {summary.collectionCount === 1 ? "donor" : "donors"} ·{" "}
              {coverage.paidHouses} paid {coverage.paidHouses === 1 ? "house" : "houses"} ·{" "}
              {coverage.pendingHouses} still to collect
            </Text>
          }
        />
      )}

      <GaneshClosedBanner />

      {/* GS-076: the collector's own session, where they are actually working. */}
      <GaneshSessionBar />

      {truncationNotice}

      {coverageStrip}

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={
          isEntryView
            ? "Search name, house, receipt, or collector"
            : "Search name, house, or mobile"
        }
      />

      <FilterChips value={filter} options={FILTER_OPTIONS} onChange={setFilter} />
      {areaOptions.length > 0 ? (
        <FilterChips
          label="Area"
          value={areaFilter}
          options={[
            { id: "all", label: "All areas" },
            ...areaOptions.map((area) => ({ id: area, label: area })),
          ]}
          onChange={setAreaFilter}
        />
      ) : null}
      {collectorOptions.length > 0 ? (
        <FilterChips
          label="Collector"
          value={collectorFilter}
          options={[
            { id: "all", label: "All collectors" },
            ...collectorOptions.map((member) => ({
              id: member.userId,
              label: member.displayName,
            })),
          ]}
          onChange={setCollectorFilter}
        />
      ) : null}
    </>
  );

  const list = (
    <FlashList
      data={data}
      style={styles.list}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
      getItemType={(item) => ("donorName" in item ? "collection" : "household")}
      contentContainerStyle={{ paddingBottom: listPadding }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) =>
        "donorName" in item ? renderCollection(item) : renderHousehold(item)
      }
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
          illustration="collect"
          title={
            query.trim()
              ? "No matches"
              : households.length === 0
                ? "No households yet"
                : "No collections yet"
          }
          description={
            query.trim()
              ? "Try a different name, house number, mobile, or receipt."
              : households.length === 0
                ? "Add the houses on your street so collectors can record chanda at the door."
                : "Start recording your Chanda collection. Entries stay on the device if the network drops."
          }
          action={
            !query.trim() && households.length === 0 && canAddHousehold
              ? { label: "Add household", onPress: openAddHousehold }
              : canAdd && !query.trim()
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
  coverageCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderCurve: "continuous",
  },
  coverageTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  coverageMeta: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  coverageAction: {
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 2,
  },
  areaList: {
    gap: 2,
    marginTop: 2,
  },
  fab: {
    position: "absolute",
    right: 16,
  },
});

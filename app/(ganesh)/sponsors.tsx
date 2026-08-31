import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Building2, SlidersHorizontal } from "lucide-react-native";

import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
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
  type LedgerRowBadge,
} from "@/components/ganesh/ui";
import { SearchBar } from "@/components/common/SearchBar";
import { AddFab } from "@/components/ui/AddFab";
import { haptic } from "@/lib/haptics";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { useSponsorships } from "@/hooks/useSponsorships";
import { logError } from "@/lib/errors";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PandalSponsor } from "@/shared/types/ganesh";
import { formatInr } from "@/shared/utils/ganeshMoney";
import {
  SPONSORING_TYPES,
  SPONSORSHIP_PURPOSES,
  isSponsorshipOverdue,
  purposeLabelOf,
  sponsorshipStatusLabel,
  sponsorshipValue,
  summarizeSponsorships,
} from "@/shared/utils/ganeshSponsors";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS_FILTERS = [
  "all",
  "prospective",
  "promised",
  "confirmed",
  "received",
  "cancelled",
  "overdue",
] as const;
const TYPE_FILTERS = ["all", "cash", "item", "service", "expense"] as const;
const PURPOSE_FILTERS = ["all", ...SPONSORSHIP_PURPOSES.map((item) => item.id)] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];
type TypeFilter = (typeof TYPE_FILTERS)[number];
type PurposeFilter = (typeof PURPOSE_FILTERS)[number];

const STATUS_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "received", label: "Received" },
  { id: "confirmed", label: "Confirmed" },
  { id: "promised", label: "Promised" },
  { id: "overdue", label: "Overdue" },
  { id: "prospective", label: "Prospective" },
  { id: "cancelled", label: "Cancelled" },
];

function asStatus(value?: string): StatusFilter | undefined {
  return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : undefined;
}
function asType(value?: string): TypeFilter | undefined {
  return TYPE_FILTERS.includes(value as TypeFilter) ? (value as TypeFilter) : undefined;
}
function asPurpose(value?: string): PurposeFilter | undefined {
  return PURPOSE_FILTERS.includes(value as PurposeFilter) ? (value as PurposeFilter) : undefined;
}

/** Deal status → badge. Colour never carries the meaning on its own (§35). */
function sponsorBadge(status: string, overdue: boolean): LedgerRowBadge {
  if (overdue) return { kind: "overdue" };
  switch (status) {
    case "received":
      return { kind: "received" };
    case "confirmed":
      return { kind: "sponsored", label: "Confirmed" };
    case "promised":
      return { kind: "promised" };
    case "cancelled":
      return { kind: "cancelled" };
    default:
      return { kind: "neutral", label: "Prospective" };
  }
}

export default function SponsorsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const listPadding = useGaneshListPadding(false);
  const params = useLocalSearchParams<{ status?: string; type?: string; purpose?: string }>();

  const { pandalId, festivalId } = useGaneshSession();
  const { sponsors, loading, error } = usePandalSponsors(pandalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { can, isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(asStatus(params.status) ?? "all");
  const [type, setType] = useState<TypeFilter>(asType(params.type) ?? "all");
  const [purpose, setPurpose] = useState<PurposeFilter>(asPurpose(params.purpose) ?? "all");
  const [showArchived, setShowArchived] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(
    () => Boolean(asType(params.type) || asPurpose(params.purpose))
  );

  const totals = useMemo(() => summarizeSponsorships(sponsorships), [sponsorships]);

  useEffect(() => {
    const nextStatus = asStatus(params.status);
    const nextType = asType(params.type);
    const nextPurpose = asPurpose(params.purpose);
    if (nextStatus) setStatus(nextStatus);
    if (nextType) setType(nextType);
    if (nextPurpose) setPurpose(nextPurpose);
    if (nextType || nextPurpose) setShowMoreFilters(true);
  }, [params.purpose, params.status, params.type]);

  useEffect(() => {
    if (!isAdmin) return;
    writes.ensurePandalRoles().catch((caught) => {
      logError("ganesh.sponsors.ensureRoles", caught);
    });
  }, [isAdmin, pandalId]);

  const canAdd = can("sponsors.create");
  const openAdd = useCallback(() => push("/(ganesh)/add-sponsor" as never), [push]);
  const onOpen = useCallback((id: string) => push(`/(ganesh)/sponsor/${id}` as never), [push]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matchingDeals = sponsorships.filter((row) => {
      if (type !== "all" && row.sponsoringType !== type) return false;
      if (purpose !== "all" && row.purpose !== purpose) return false;
      if (status === "overdue") return isSponsorshipOverdue(row);
      if (status !== "all" && sponsorshipStatusLabel(row) !== status && row.status !== status) {
        return false;
      }
      return true;
    });
    const filteredIds = new Set(matchingDeals.map((row) => row.sponsorId));
    const narrowed =
      status === "all" && type === "all" && purpose === "all"
        ? sponsors
        : sponsors.filter((sponsor) => filteredIds.has(sponsor.id));
    return narrowed.filter((sponsor) => {
      if (!showArchived && sponsor.archived) return false;
      if (showArchived && !sponsor.archived) return false;
      if (!needle) return true;
      return sponsor.name.toLowerCase().includes(needle);
    });
  }, [purpose, query, showArchived, sponsors, sponsorships, status, type]);

  const renderItem = useCallback(
    ({ item }: { item: PandalSponsor }) => {
      const deals = sponsorships.filter((row) => row.sponsorId === item.id);
      const value = deals.reduce((sum, row) => sum + sponsorshipValue(row), 0);
      const first = deals[0];
      const overdue = deals.some((row) => isSponsorshipOverdue(row));

      return (
        <LedgerRow
          id={item.id}
          icon={<Building2 size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
          title={item.name}
          meta={
            [
              item.type,
              deals.length === 1 && first
                ? purposeLabelOf(first.purpose, first.purposeLabel)
                : deals.length > 0
                  ? `${deals.length} deals this festival`
                  : "No deal yet this festival",
            ]
              .filter(Boolean)
              .join(" · ")
          }
          badges={
            first ? [sponsorBadge(sponsorshipStatusLabel(first), overdue)] : undefined
          }
          amount={value > 0 ? value : undefined}
          amountMeta={
            value > 0 && deals.length > 1 ? <MetaLabel>Total</MetaLabel> : undefined
          }
          pending={item.pendingWrite}
          onPress={onOpen}
        />
      );
    },
    [onOpen, sponsorships, theme.colors.mutedForeground]
  );

  if (!can("sponsors.read")) {
    return <GaneshWriteLock message="Your role cannot view sponsors." />;
  }

  const filtersActive = status !== "all" || type !== "all" || purpose !== "all";

  return (
    <GaneshScreen
      safeTop
      scroll={false}
      overlay={
        canAdd ? (
          <View style={[styles.fab, { bottom: listPadding - 16 }]} pointerEvents="box-none">
            <AddFab onPress={openAdd} accessibilityLabel="Add sponsor" size="lg" />
          </View>
        ) : null
      }
    >
      <GaneshHeader
        title="Sponsors"
        subtitle={`${sponsors.length} ${sponsors.length === 1 ? "sponsor" : "sponsors"}`}
        icon={<Building2 size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
        rightElement={<GaneshSyncChip />}
      />

      <View style={styles.statRow}>
        <StatTile
          label="Cash received"
          meta={
            <Text
              style={[
                styles.tileMeta,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              In the God Fund
            </Text>
          }
        >
          <Money
            value={totals.cashReceived}
            size="primary"
            tone="positive"
            numberOfLines={1}
            adjustsFontSizeToFit
          />
        </StatTile>
        <StatTile
          label="In-kind received"
          meta={
            <Text
              style={[
                styles.tileMeta,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              Estimated value
            </Text>
          }
        >
          <Money
            value={totals.inKindReceived}
            size="primary"
            numberOfLines={1}
            adjustsFontSizeToFit
          />
        </StatTile>
      </View>

      {totals.promisedCash + totals.promisedInKind > 0 ? (
        <StatusStrip
          tone="warning"
          message={`${formatInr(
            totals.promisedCash + totals.promisedInKind
          )} promised — prospective and promised deals do not change festival cash.`}
        />
      ) : null}

      <SearchBar value={query} onChangeText={setQuery} placeholder="Search sponsor name" />

      <FilterChips value={status} options={STATUS_OPTIONS} onChange={setStatus} />

      <Pressable
        onPress={() => {
          void haptic.selection();
          setShowMoreFilters((prev) => !prev);
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityState={{ expanded: showMoreFilters }}
        style={({ pressed }) => [styles.moreToggle, pressed && { opacity: 0.7 }]}
      >
        <SlidersHorizontal size={14} color={g.saffron} strokeWidth={2.3} />
        <Text style={[styles.moreLabel, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
          {showMoreFilters ? "Fewer filters" : "More filters"}
        </Text>
        {!showMoreFilters && (type !== "all" || purpose !== "all") ? (
          <View style={[styles.dot, { backgroundColor: g.saffron }]} />
        ) : null}
      </Pressable>

      {showMoreFilters ? (
        <>
          <FilterChips
            label="Type"
            value={type}
            options={[{ id: "all" as const, label: "All types" }, ...SPONSORING_TYPES]}
            onChange={setType}
          />
          <FilterChips
            label="Purpose"
            value={purpose}
            options={[{ id: "all" as const, label: "All purposes" }, ...SPONSORSHIP_PURPOSES]}
            onChange={setPurpose}
          />
          <FilterChips
            label="Archive"
            value={showArchived ? "archived" : "active"}
            options={[{ id: "active" as const, label: "Active" }, { id: "archived" as const, label: "Archived" }]}
            onChange={(value) => setShowArchived(value === "archived")}
          />
        </>
      ) : null}

      <FlashList
        data={rows}
        style={styles.list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: listPadding }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <ListStateView
            loading={loading && sponsors.length === 0}
            error={error}
            illustration="collect"
            title={query.trim() || filtersActive ? "Nothing matches" : "No sponsors yet"}
            description={
              query.trim() || filtersActive
                ? "Clear a filter to see the rest of this festival's supporters."
                : "Add a person, shop, or organization. A promised deal never increases cash."
            }
            action={
              canAdd && !query.trim() && !filtersActive
                ? { label: "Add sponsor", onPress: openAdd }
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
  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 32,
  },
  moreLabel: {
    fontSize: 13,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  fab: {
    position: "absolute",
    right: 16,
  },
});

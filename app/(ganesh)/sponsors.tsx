import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";

import { EmptyState } from "@/components/common/EmptyState";
import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip, PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { AddFab } from "@/components/ui/AddFab";
import { Input } from "@/components/ui/Input";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { useSponsorships } from "@/hooks/useSponsorships";
import { logError } from "@/lib/errors";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
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
  { id: "prospective", label: "Prospective" },
  { id: "promised", label: "Promised" },
  { id: "confirmed", label: "Confirmed" },
  { id: "received", label: "Received" },
  { id: "cancelled", label: "Cancelled" },
  { id: "overdue", label: "Overdue" },
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

const SponsorCard = memo(function SponsorCard({
  id,
  name,
  meta,
  pending,
  onOpen,
}: {
  id: string;
  name: string;
  meta: string;
  pending?: boolean;
  onOpen: (id: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => onOpen(id)}
      style={{
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        gap: 4,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{name}</Text>
      <Text style={{ color: theme.colors.mutedForeground }}>{meta}</Text>
      <PendingHint pending={pending} />
    </Pressable>
  );
});

export default function SponsorsScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const params = useLocalSearchParams<{ status?: string; type?: string; purpose?: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { sponsors, loading } = usePandalSponsors(pandalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { can, isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(asStatus(params.status) ?? "all");
  const [type, setType] = useState<TypeFilter>(asType(params.type) ?? "all");
  const [purpose, setPurpose] = useState<PurposeFilter>(asPurpose(params.purpose) ?? "all");
  const totals = summarizeSponsorships(sponsorships);

  useEffect(() => {
    const nextStatus = asStatus(params.status);
    const nextType = asType(params.type);
    const nextPurpose = asPurpose(params.purpose);
    if (nextStatus) setStatus(nextStatus);
    if (nextType) setType(nextType);
    if (nextPurpose) setPurpose(nextPurpose);
  }, [params.purpose, params.status, params.type]);

  useEffect(() => {
    if (!isAdmin) return;
    writes.ensurePandalRoles().catch((error) => {
      logError("ganesh.sponsors.ensureRoles", error);
    });
  }, [isAdmin, pandalId]);

  const onOpen = useCallback(
    (id: string) => {
      push(`/(ganesh)/sponsor/${id}` as never);
    },
    [push]
  );

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
    const narrowed = status === "all" && type === "all" && purpose === "all"
      ? sponsors
      : sponsors.filter((sponsor) => filteredIds.has(sponsor.id));
    return narrowed.filter((sponsor) => {
      if (!needle) return true;
      return sponsor.name.toLowerCase().includes(needle);
    });
  }, [purpose, query, sponsors, sponsorships, status, type]);

  if (!can("sponsors.read")) {
    return <GaneshWriteLock message="Your role cannot view sponsors." />;
  }

  return (
    <GaneshScreen scroll={false}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Sponsors
        </Text>
        <GaneshSyncChip />
      </View>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Promised, prospective, and confirmed deals do not change festival cash.
      </Text>
      <MetricGrid
        items={[
          { label: "Cash received", value: totals.cashReceived },
          { label: "Promised cash", value: totals.promisedCash },
          { label: "In-kind received", value: totals.inKindReceived },
          { label: "Promised in-kind", value: totals.promisedInKind },
        ]}
      />
      <Input label="Search" value={query} onChangeText={setQuery} placeholder="Sponsor name" />
      <ChoiceChips value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      <ChoiceChips
        value={type}
        options={[{ id: "all", label: "All types" }, ...SPONSORING_TYPES]}
        onChange={setType}
      />
      <ChoiceChips
        value={purpose}
        options={[{ id: "all", label: "All purposes" }, ...SPONSORSHIP_PURPOSES]}
        onChange={setPurpose}
      />
      <FlashList
        data={rows}
        style={{ flex: 1 }}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => {
          const deals = sponsorships.filter((row) => row.sponsorId === item.id);
          const value = deals.reduce((sum, row) => sum + sponsorshipValue(row), 0);
          const first = deals[0];
          return (
            <SponsorCard
              id={item.id}
              name={item.name}
              meta={[
                item.type,
                deals.length === 1 && first
                  ? purposeLabelOf(first.purpose, first.purposeLabel)
                  : `${deals.length} this festival`,
                value > 0 ? formatInr(value) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              pending={item.pendingWrite}
              onOpen={onOpen}
            />
          );
        }}
        ListEmptyComponent={
          loading ? (
            <Text style={{ color: theme.colors.mutedForeground }}>Loading sponsors…</Text>
          ) : (
            <EmptyState
              title="No sponsors yet"
              description="Add a person, shop, or organization. A promised deal never increases cash."
              primaryAction={
                can("sponsors.create")
                  ? {
                      label: "Add sponsor",
                      onPress: () => push("/(ganesh)/add-sponsor" as never),
                    }
                  : undefined
              }
            />
          )
        }
      />
      {can("sponsors.create") && rows.length > 0 ? (
        <AddFab
          onPress={() => push("/(ganesh)/add-sponsor" as never)}
          accessibilityLabel="Add sponsor"
        />
      ) : null}
    </GaneshScreen>
  );
}

import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { GaneshSyncChip, PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { AddFab } from "@/components/ui/AddFab";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/common/EmptyState";
import { useCollections } from "@/hooks/useCollections";
import { useFestivals } from "@/hooks/useFestivals";
import { useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import type { GaneshCollection, Household } from "@/shared/types/ganesh";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

const FILTERS = ["all", "paid", "partial", "pending", "cash", "upi"] as const;

export default function CollectionsScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { households } = useHouseholds(pandalId, festivalId);
  const { collections } = useCollections(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const { can } = useGaneshPermissions();

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
      if (filter === "cash" || filter === "upi") return row.paymentMethod === filter;
      if (!needle) return true;
      return (
        row.donorName.toLowerCase().includes(needle)
        || (row.houseNumber ?? "").toLowerCase().includes(needle)
        || (row.mobile ?? "").includes(needle)
      );
    });
  }, [collections, filter, query]);

  const paid = households.filter((household) => household.status === "paid").length;
  const pending = households.filter((household) => household.status === "pending").length;

  const renderHousehold = useCallback(
    ({ item }: { item: Household }) => (
      <Pressable
        onPress={() => push(`/(ganesh)/household/${item.id}` as never)}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 16,
          padding: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: 4,
        }}
      >
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
          {item.houseNumber ? `House ${item.houseNumber} · ` : ""}
          {item.name}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          {formatInr(item.collectedAmount)}
          {item.expectedAmount > 0 ? ` / ${formatInr(item.expectedAmount)}` : ""}
          {` · ${item.status.replace("_", " ")}`}
        </Text>
        <PendingHint pending={item.pendingWrite} />
      </Pressable>
    ),
    [push, theme]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Collections
        </Text>
        <GaneshSyncChip />
      </View>
      <Text style={{ color: theme.colors.primary, fontSize: 28, fontWeight: "800" }}>
        {formatInr(summary.chanda)}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        {summary.collectionCount} donors · {paid} paid houses · {pending} pending
      </Text>
      <Input value={query} onChangeText={setQuery} placeholder="Name / house / mobile" />
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
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlashList
        data={(filter === "cash" || filter === "upi" ? visibleCollections : visibleHouseholds) as Array<Household | GaneshCollection>}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          if ("donorName" in item) {
            return (
              <View
                style={{
                  backgroundColor: theme.colors.card,
                  borderRadius: 16,
                  padding: 14,
                  marginBottom: 10,
                  gap: 4,
                }}
              >
                <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                  {item.donorName}
                </Text>
                <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>
                  {formatInr(item.amount)}
                </Text>
                <AccountabilityLine
                  collectedBy={memberDisplayName(members, item.collectorId)}
                  enteredBy={memberDisplayName(members, item.createdBy)}
                  at={item.createdAt}
                  date={item.date}
                />
                <PendingHint pending={item.pendingWrite} />
              </View>
            );
          }
          return renderHousehold({ item });
        }}
        ListEmptyComponent={
          <EmptyState
            title="No collections yet"
            description="Add the first household chanda. It stays available even if the network drops."
          />
        }
      />
      {festival?.status === "open" && can("collections.create") ? (
        <AddFab
          onPress={() => push("/(ganesh)/add-collection" as never)}
          accessibilityLabel="Add collection"
        />
      ) : null}
    </View>
  );
}

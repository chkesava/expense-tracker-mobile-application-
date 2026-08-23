import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { GaneshSyncChip, PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { AddFab } from "@/components/ui/AddFab";
import { EmptyState } from "@/components/common/EmptyState";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import type { ContributionKind, GaneshContribution } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const FILTERS: Array<"all" | ContributionKind> = ["all", "money", "item", "service", "sponsorship"];

export default function ContributionsScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const rows = useMemo(
    () =>
      contributions.filter((row) => {
        if (row.voided) return false;
        if (filter === "all") return true;
        return row.kind === filter;
      }),
    [contributions, filter]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Contributions
        </Text>
        <GaneshSyncChip />
      </View>
      <MetricGrid
        items={[
          {
            label: "Cash contributions",
            value: summary.committeeContributions + summary.otherCashContributions,
          },
          { label: "In-kind value", value: summary.inKindValue },
          { label: "Sponsored value", value: summary.sponsoredValue },
        ]}
      />
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
              {item === "item" ? "Items" : item}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: GaneshContribution }) => (
          <View
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
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              {item.itemName || item.contributorName}
            </Text>
            <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>
              {item.kind === "money" ? formatInr(item.amount) : formatInr(item.estimatedValue)}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground }}>
              {item.kind} · {item.status}
              {item.quantity ? ` · ${item.quantity}` : ""}
            </Text>
            <AccountabilityLine
              contributedBy={item.contributorName}
              enteredBy={memberDisplayName(members, item.createdBy)}
              at={item.createdAt}
              date={item.date}
            />
            <PendingHint pending={item.pendingWrite} />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No contributions yet"
            description="Record money, idols, laddus, services, or sponsorships. In-kind never increases cash."
          />
        }
      />
      {festival?.status === "open" ? (
        <AddFab
          onPress={() => push("/(ganesh)/add-contribution" as never)}
          accessibilityLabel="Add contribution"
        />
      ) : null}
    </View>
  );
}

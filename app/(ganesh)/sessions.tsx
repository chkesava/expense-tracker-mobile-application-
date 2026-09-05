import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Wallet } from "lucide-react-native";

import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  GaneshHeader,
  LedgerRow,
  ListStateView,
  StatTile,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useCollectionSessions, useReconciliations } from "@/hooks/useCollectionSessions";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { CollectionSession } from "@/shared/types/ganeshSessions";
import { formatInr } from "@/shared/utils/ganeshMoney";
import {
  sessionNeedsAttention,
  sessionStatusKind,
  sessionStatusLabel,
} from "@/shared/utils/ganeshSessionDisplay";
import { useTheme } from "@/theme/ThemeProvider";

type Filter = "attention" | "open" | "all";

/**
 * Every collector's session for this festival (GS-076).
 *
 * Defaults to **Needs attention** rather than to everything, because the list's
 * job is answering "whose cash is still uncounted" — a treasurer opening this
 * at the end of an evening wants the work, not the archive.
 */
export default function CollectionSessionsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back, push } = useRouter();
  const listPadding = useGaneshListPadding(false);
  const { pandalId, festivalId } = useGaneshSession();
  const { can } = useGaneshPermissions();

  const { sessions, loading, error, retry } = useCollectionSessions(pandalId, festivalId);
  const { reconciliations } = useReconciliations(pandalId, festivalId);
  const [filter, setFilter] = useState<Filter>("attention");

  const byId = useMemo(
    () => new Map(reconciliations.map((row) => [row.sessionId, row])),
    [reconciliations]
  );

  const rows = useMemo(() => {
    if (filter === "open") return sessions.filter((row) => row.status === "open");
    if (filter === "attention") {
      return sessions.filter((row) => sessionNeedsAttention(row, byId.get(row.id)));
    }
    return sessions;
  }, [sessions, filter, byId]);

  const awaiting = sessions.filter((row) => row.status === "closed").length;
  const mismatched = sessions.filter((row) => row.status === "mismatch").length;

  if (!can("sessions.read")) {
    return <GaneshWriteLock message="Your role cannot view collection sessions." />;
  }

  const renderRow = (item: CollectionSession) => {
    const reconciliation = byId.get(item.id);
    return (
      <LedgerRow
        id={item.id}
        icon={<Wallet size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
        title={item.collectorName}
        meta={[
          item.date,
          `${item.collectionCount} ${item.collectionCount === 1 ? "collection" : "collections"}`,
          item.status !== "open" ? `Cash ${formatInr(item.expectedCash)}` : null,
          // The difference travels with the row, so a mismatch is visible in
          // the list rather than only after opening it.
          reconciliation && reconciliation.difference !== 0
            ? `Off by ${formatInr(Math.abs(reconciliation.difference))}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        badges={[
          { kind: sessionStatusKind(item.status), label: sessionStatusLabel(item.status) },
        ]}
        amount={item.totalCollected}
        pending={item.pendingWrite}
        onPress={(id) => push(`/(ganesh)/session/${id}`)}
      />
    );
  };

  return (
    <GaneshScreen scroll={false}>
      <GaneshHeader
        title="Collection sessions"
        subtitle="Who collected, and whether the cash has been counted"
        icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <View style={styles.statRow}>
        <StatTile label="Awaiting count">
          <Text
            style={[
              styles.count,
              {
                color: awaiting > 0 ? theme.colors.warning : theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
              },
            ]}
          >
            {awaiting}
          </Text>
        </StatTile>
        <StatTile label="Did not match">
          <Text
            style={[
              styles.count,
              {
                color: mismatched > 0 ? theme.colors.destructive : theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
              },
            ]}
          >
            {mismatched}
          </Text>
        </StatTile>
        <StatTile label="Sessions">
          <Text
            style={[styles.count, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
          >
            {sessions.length}
          </Text>
        </StatTile>
      </View>

      <FilterChips
        value={filter}
        options={[
          { id: "attention", label: "Needs attention" },
          { id: "open", label: "Collecting now" },
          { id: "all", label: "All" },
        ]}
        onChange={(next) => setFilter(next as Filter)}
      />

      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: listPadding }}
        renderItem={({ item }) => renderRow(item)}
        ListEmptyComponent={
          <ListStateView
            loading={loading && sessions.length === 0}
            error={error}
            onRetry={retry}
            title={
              filter === "attention"
                ? "Nothing waiting"
                : filter === "open"
                  ? "Nobody is collecting right now"
                  : "No collection sessions yet"
            }
            description={
              filter === "attention"
                ? "Every session has been counted and approved."
                : "A collector starts a session from the Collections screen before going door to door."
            }
          />
        }
      />
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", gap: 10 },
  count: { fontSize: 24 },
});

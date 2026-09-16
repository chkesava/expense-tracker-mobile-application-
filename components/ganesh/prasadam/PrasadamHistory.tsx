import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Search, UtensilsCrossed } from "lucide-react-native";

import {
  FilterChips,
  ListStateView,
  MetaLabel,
  useGaneshTokens,
  type ChipOption,
} from "@/components/ganesh/ui";
import { PrasadamEntryRow } from "@/components/ganesh/prasadam/PrasadamEntryRow";
import { SearchBar } from "@/components/common/SearchBar";
import { Button } from "@/components/ui/Button";
import type {
  PrasadamEntry,
  PrasadamSession,
  PrasadamStatus,
} from "@/shared/types/ganeshPrasadam";
import {
  filterPrasadam,
  groupPrasadamByDay,
  prasadamSessionLabel,
} from "@/shared/utils/ganeshPrasadam";
import { formatSevaDate } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

type Row =
  | { kind: "day"; date: string; morning: number; evening: number }
  | { kind: "entry"; entry: PrasadamEntry };

/**
 * The register, grouped by day.
 *
 * Filtering is in memory, deliberately: `where('session','==',x)` alongside
 * `orderBy('date')` would need a composite index, and `firestore.indexes.json`
 * is a strict subset of the live project. The predicates in `filterPrasadam`
 * are independent of one another — coupling search to status is what produced
 * two shipped filter bugs before.
 */
export function PrasadamHistory({
  entries,
  loading,
  error,
  onRetry,
  onOpenEntry,
  onOpenDay,
  onExport,
  exporting,
  canExport,
  prefix,
}: {
  entries: readonly PrasadamEntry[];
  loading?: boolean;
  error?: { message?: string } | null;
  onRetry?: () => void;
  onOpenEntry: (id: string) => void;
  onOpenDay: (date: string) => void;
  onExport?: (filtered: PrasadamEntry[]) => void;
  exporting?: boolean;
  canExport?: boolean;
  prefix?: ReactNode;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  const [search, setSearch] = useState("");
  const [session, setSession] = useState<PrasadamSession | "all">("all");
  const [status, setStatus] = useState<PrasadamStatus | "all">("recorded");

  const filtered = useMemo(
    () => filterPrasadam(entries, { search, session, status }),
    [entries, search, session, status]
  );

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const day of groupPrasadamByDay(filtered)) {
      out.push({
        kind: "day",
        date: day.date,
        morning: day.morning.length,
        evening: day.evening.length,
      });
      for (const entry of [...day.morning, ...day.evening]) {
        out.push({ kind: "entry", entry });
      }
    }
    return out;
  }, [filtered]);

  const sessionOptions: Array<ChipOption<PrasadamSession | "all">> = [
    { id: "all", label: "All", badge: entries.length },
    {
      id: "morning",
      label: prasadamSessionLabel("morning"),
      badge: entries.filter((e) => e.session === "morning").length,
    },
    {
      id: "evening",
      label: prasadamSessionLabel("evening"),
      badge: entries.filter((e) => e.session === "evening").length,
    },
  ];

  const statusOptions: Array<ChipOption<PrasadamStatus | "all">> = [
    { id: "recorded", label: "Recorded" },
    { id: "cancelled", label: "Cancelled" },
    { id: "all", label: "All" },
  ];

  const isFiltered =
    Boolean(search.trim()) || session !== "all" || status !== "recorded";

  const header = (
    <View style={styles.header}>
      {prefix}
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Provider, item or mobile"
      />
      <FilterChips value={session} options={sessionOptions} onChange={setSession} />
      <FilterChips value={status} options={statusOptions} onChange={setStatus} />
      {isFiltered ? (
        <MetaLabel>
          {filtered.length} of {entries.length} entries
        </MetaLabel>
      ) : null}
    </View>
  );

  return (
    <FlashList
      data={rows}
      keyExtractor={(row) =>
        row.kind === "day" ? `day:${row.date}` : `entry:${row.entry.id}`
      }
      ListHeaderComponent={header}
      renderItem={({ item }) =>
        item.kind === "day" ? (
          <Pressable
            onPress={() => onOpenDay(item.date)}
            accessibilityRole="button"
            accessibilityLabel={`${formatSevaDate(item.date, true)}, ${item.morning} in the morning, ${item.evening} in the evening`}
            style={[styles.dayRow, { borderBottomColor: g.divider }]}
          >
            <Text
              style={{
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
              }}
            >
              {formatSevaDate(item.date, true)}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              Morning {item.morning} · Evening {item.evening}
            </Text>
          </Pressable>
        ) : (
          <PrasadamEntryRow entry={item.entry} onPress={onOpenEntry} />
        )
      }
      ListEmptyComponent={
        <ListStateView
          loading={loading}
          error={error}
          onRetry={onRetry}
          icon={
            search.trim() ? (
              <Search size={20} color={g.saffron} strokeWidth={2} />
            ) : (
              <UtensilsCrossed size={20} color={g.saffron} strokeWidth={2} />
            )
          }
          title={
            error
              ? "Couldn't load the prasadam register"
              : search.trim()
                ? "Nothing matches that"
                : isFiltered
                  ? "No entries in this filter"
                  : "No prasadam recorded yet"
          }
          description={
            error
              ? "Check your connection and try again."
              : search.trim()
                ? "Try a different provider, item or date."
                : isFiltered
                  ? "Change the session or status filter to see more."
                  : "Record who brings the morning and evening prasadam, and the committee always knows what is covered."
          }
        />
      }
      ListFooterComponent={
        canExport && filtered.length > 0 && onExport ? (
          <View style={styles.footer}>
            <Button
              variant="secondary"
              loading={exporting}
              onPress={() => onExport(filtered)}
            >
              Export this list
            </Button>
            <MetaLabel>
              Exports the {filtered.length} {filtered.length === 1 ? "entry" : "entries"}{" "}
              currently shown.
            </MetaLabel>
          </View>
        ) : null
      }
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, paddingBottom: 10 },
  content: { paddingBottom: 32 },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingTop: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  footer: { gap: 6, paddingTop: 16 },
});

import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, useRouter, type Href } from "expo-router";
import { ArrowUpDown, Bookmark, ChevronRight, Filter, ListFilter, X } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { InstrumentSheet } from "@/components/markets/InstrumentSheet";
import { MarketBanner, MarketCard } from "@/components/markets/MarketParts";
import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import { ScreenerFilterSheet } from "@/components/screener/ScreenerFilterSheet";
import { ScreenerSavedSheet, ScreenerSortSheet } from "@/components/screener/ScreenerSheets";
import { Chip } from "@/components/ui/Chip";
import { useScreenerUniverse, useScreenerUniverseCacheReady } from "@/hooks/useScreenerUniverse";
import { getSavedScreens, hydrateSavedScreens, subscribeSavedScreens } from "@/lib/screenerSavedScreens";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Instrument } from "@/shared/utils/marketsView";
import { EMPTY_SCREEN, activeFilterCount, type Screen } from "@/shared/utils/screener";
import { SORT_OPTIONS, screenerRowInstrument, screenerView, type ScreenerRowView } from "@/shared/utils/screenerView";
import { useTheme } from "@/theme/ThemeProvider";

/** Re-render on a slow clock so "open" turns to "closed" at 15:30 without a refetch. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Stock screener (SPENDLY-623, story SPENDLY-651): filter and sort the NIFTY
 * 500 on price, change, 52-week range, 1-year return, sector and NIFTY 50
 * membership. Data comes from /api/screener-universe through
 * `useScreenerUniverse`; filtering, sorting and paging run on the device
 * (`shared/utils/screener`). Saved screens stay on this device. No Firestore
 * listener is mounted, and the user's portfolio is never read.
 */
export default function ScreenerScreen() {
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();
  const router = useRouter();
  const { theme } = useTheme();
  const ready = useScreenerUniverseCacheReady();

  if (!(settings.enableInvestments && system.enableInvestments)) return <Redirect href="/ledger" />;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/investments?tab=markets" as Href));

  return (
    <PageShell contentContainerStyle={styles.content}>
      <PageHeader
        title="Stock screener"
        subtitle="NIFTY 500 by price, change and 52-week range"
        icon={<ListFilter size={22} color={theme.colors.primary} />}
        onBack={goBack}
      />
      {ready ? <ScreenerBody /> : <ScreenerSkeleton />}
    </PageShell>
  );
}

function ScreenerSkeleton() {
  return (
    <View style={styles.stack} accessibilityLabel="Loading the screener">
      <Skeleton height={14} width="70%" />
      <Skeleton height={32} />
      <SkeletonCard>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} height={36} />
        ))}
      </SkeletonCard>
    </View>
  );
}

function ScreenerBody() {
  const { theme } = useTheme();
  const universe = useScreenerUniverse();
  const nowMs = useNow(30_000);
  const [screen, setScreen] = useState<Screen>(EMPTY_SCREEN);
  const [pages, setPages] = useState(1);
  const [sheet, setSheet] = useState<"filters" | "sort" | "saved" | null>(null);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const saved = useSyncExternalStore(subscribeSavedScreens, getSavedScreens, getSavedScreens);

  useEffect(() => {
    void hydrateSavedScreens();
  }, []);

  const changeScreen = (next: Screen) => {
    setScreen(next);
    setPages(1);
    setSheet(null);
  };

  const retry = () => void universe.query.refetch();
  const view = screenerView({
    data: universe.data,
    isFetching: universe.query.isFetching,
    isOffline: universe.isOffline,
    errorMessage: universe.errorMessage,
    screen,
    pages,
    nowMs,
  });

  const rows = universe.data?.available ? universe.data.rows : [];
  const sortLabel = SORT_OPTIONS.find((o) => o.field === screen.sort.field)?.label ?? "Sort";
  const filterCount = activeFilterCount(screen);
  const small = { color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular };

  const toolbar = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar}>
      <Chip
        label={filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
        size="sm"
        appearance="tonal"
        selected={filterCount > 0}
        icon={(c) => <Filter size={14} color={c} />}
        onPress={() => setSheet("filters")}
        disabled={rows.length === 0}
      />
      <Chip
        label={`${sortLabel} ${screen.sort.direction === "desc" ? "↓" : "↑"}`}
        size="sm"
        appearance="tonal"
        icon={(c) => <ArrowUpDown size={14} color={c} />}
        onPress={() => setSheet("sort")}
        accessibilityLabel={`Sort by ${sortLabel}, ${screen.sort.direction === "desc" ? "high to low" : "low to high"}`}
      />
      <Chip
        label={saved.length > 0 ? `Screens (${saved.length})` : "Screens"}
        size="sm"
        appearance="tonal"
        icon={(c) => <Bookmark size={14} color={c} />}
        onPress={() => setSheet("saved")}
      />
      {filterCount > 0 ? (
        <Chip label="Reset" size="sm" appearance="outline" icon={(c) => <X size={14} color={c} />} onPress={() => changeScreen({ ...EMPTY_SCREEN, sort: screen.sort })} />
      ) : null}
    </ScrollView>
  );

  const sheets = (
    <>
      <ScreenerFilterSheet isOpen={sheet === "filters"} onClose={() => setSheet(null)} screen={screen} rows={rows} onApply={changeScreen} />
      <ScreenerSortSheet
        isOpen={sheet === "sort"}
        onClose={() => setSheet(null)}
        sort={screen.sort}
        onChange={(sort) => {
          setScreen((s) => ({ ...s, sort }));
          setPages(1);
        }}
      />
      <ScreenerSavedSheet isOpen={sheet === "saved"} onClose={() => setSheet(null)} screen={screen} saved={saved} onLoad={changeScreen} />
      <InstrumentSheet instrument={selected} onClose={() => setSelected(null)} />
    </>
  );

  if (view.kind === "loading") return <ScreenerSkeleton />;

  if (view.kind === "empty" || view.kind === "unavailable") {
    return (
      <View style={styles.stack}>
        {view.kind === "unavailable" ? <Text style={small}>{view.label}</Text> : null}
        <EmptyState
          icon={<ListFilter size={28} color={theme.colors.mutedForeground} />}
          title={view.title}
          description={view.description}
          primaryAction={view.retry ? { label: "Retry", onPress: retry } : undefined}
          compact
        />
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.headerLines}>
        <Text style={[small, { fontFamily: theme.fontFamily.medium }]}>{view.label}</Text>
        <Text style={small}>
          {view.coverage}
          {view.refreshing ? " · Refreshing…" : ""}
        </Text>
      </View>
      {view.banner ? <MarketBanner banner={view.banner} onRetry={retry} /> : null}
      {toolbar}
      {view.chips.length > 0 ? (
        <View style={styles.chips}>
          {view.chips.map((chip) => (
            <Chip key={chip} label={chip} size="sm" appearance="outline" onPress={() => setSheet("filters")} accessibilityLabel={`Filter: ${chip}. Edit filters`} />
          ))}
        </View>
      ) : null}

      <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }} accessibilityRole="header">
        {view.countText}
      </Text>
      {view.notes.map((note) => (
        <Text key={note} style={small}>
          {note}
        </Text>
      ))}

      {view.noMatches ? (
        <EmptyState
          icon={<Filter size={28} color={theme.colors.mutedForeground} />}
          title="No stocks match"
          description="Try widening a range or removing a filter."
          primaryAction={{ label: "Clear filters", onPress: () => changeScreen({ ...EMPTY_SCREEN, sort: screen.sort }) }}
          compact
        />
      ) : (
        <MarketCard dimmed={view.dimmed}>
          {view.rows.map((row, i) => (
            <ResultRow
              key={row.symbol}
              row={row}
              last={i === view.rows.length - 1}
              onPress={() => {
                const dto = rows.find((r) => r.symbol === row.symbol);
                if (dto) setSelected(screenerRowInstrument(dto));
              }}
            />
          ))}
        </MarketCard>
      )}

      {view.hasMore ? (
        <Pressable
          onPress={() => setPages((p) => p + 1)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.more, { borderColor: theme.colors.border }, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: theme.colors.primary, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }}>
            Show more ({view.shown} of {view.total})
          </Text>
        </Pressable>
      ) : null}

      <Text style={small}>
        Figures come from daily closing prices (Yahoo Finance) and may be delayed. 52-week figures use closing prices. Market cap, P/E and volume aren't available from this data source.
      </Text>
      {sheets}
    </View>
  );
}

function ResultRow({ row, last, onPress }: { row: ScreenerRowView; last: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const colors = usePortfolioColors();
  const color = colors.pnl(row.direction === "up" ? 1 : row.direction === "down" ? -1 : 0);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      accessibilityHint="Opens the chart"
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.rowName}>
        <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }} numberOfLines={1}>
          {row.ticker}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }} numberOfLines={1}>
          {row.name} · {row.sector}
        </Text>
        {row.sortedValue ? (
          <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.medium }} numberOfLines={1}>
            {row.sortedValue}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowFigures}>
        <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.medium, fontVariant: ["tabular-nums"] }}>
          {row.price}
        </Text>
        <Text style={{ color, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.semibold, fontVariant: ["tabular-nums"] }}>{row.changePercent}</Text>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 40 },
  stack: { gap: 12 },
  headerLines: { gap: 2 },
  toolbar: { gap: 8, paddingRight: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowName: { flex: 1, minWidth: 0, gap: 2 },
  rowFigures: { alignItems: "flex-end", gap: 2 },
  more: { alignItems: "center", paddingVertical: 12, borderWidth: 1, borderRadius: 14 },
});

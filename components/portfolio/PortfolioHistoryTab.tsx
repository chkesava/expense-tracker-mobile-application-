import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Download, RotateCcw } from "lucide-react-native";

import { Chip } from "@/components/ui/Chip";
import { SearchBar } from "@/components/common/SearchBar";
import { DateField } from "@/components/common/DateField";
import { EmptyState } from "@/components/common/EmptyState";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { useSettings } from "@/providers/SettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { logWarning } from "@/lib/errors";
import { sampleScrollFps } from "@/lib/perf";
import { todayDateKey } from "@/shared/utils/dates";
import type {
  Holding,
  InstrumentType,
  PortfolioTransaction,
} from "@/shared/features/portfolio/types";
import {
  filterAndSortPortfolioHistory,
  generatePortfolioHistoryCsv,
  type PortfolioHistoryFilterOptions,
  type PortfolioHistoryInstrumentFilter,
  type PortfolioHistoryItem,
  type PortfolioHistoryPeriod,
  type PortfolioHistorySort,
  type PortfolioHistoryTypeFilter,
} from "@/shared/features/portfolio/utils/portfolioHistory";
import {
  PortfolioHistoryRow,
  PortfolioHistoryTableHeader,
} from "@/components/portfolio/PortfolioHistoryRow";

interface PortfolioHistoryTabProps {
  transactions: PortfolioTransaction[];
  holdings: Holding[];
  currency: string;
  listHeader?: ReactNode;
}

const TYPE_FILTERS: Array<{ id: PortfolioHistoryTypeFilter; label: string }> = [
  { id: "all", label: "All types" },
  { id: "BUY", label: "Buy" },
  { id: "SELL", label: "Sell" },
  { id: "other", label: "Adjustments" },
];

const INSTRUMENT_FILTERS: Array<{
  id: PortfolioHistoryInstrumentFilter;
  label: string;
}> = [
  { id: "all", label: "All assets" },
  { id: "stock", label: "Stocks" },
  { id: "etf", label: "ETFs" },
  { id: "mutual_fund", label: "Mutual Funds" },
  { id: "crypto", label: "Crypto" },
  { id: "gold", label: "Gold" },
];

const PERIOD_FILTERS: Array<{ id: PortfolioHistoryPeriod; label: string }> = [
  { id: "all", label: "All time" },
  { id: "this_month", label: "This month" },
  { id: "custom", label: "Custom date" },
];

const SORT_OPTIONS: Array<{ id: PortfolioHistorySort; label: string }> = [
  { id: "date_desc", label: "Newest" },
  { id: "date_asc", label: "Oldest" },
  { id: "amount_desc", label: "Amount ↓" },
  { id: "amount_asc", label: "Amount ↑" },
];

function ItemSeparator() {
  return <View style={styles.separator} />;
}

export function PortfolioHistoryTab({
  transactions,
  holdings,
  currency,
  listHeader,
}: PortfolioHistoryTabProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const listBottomPadding = usePageListBottomPadding();

  const [listWidth, setListWidth] = useState(0);
  const wide = listWidth >= 720;

  // Filter states
  const [query, setQuery] = useState("");
  const [type, setType] = useState<PortfolioHistoryTypeFilter>("all");
  const [instrument, setInstrument] = useState<PortfolioHistoryInstrumentFilter>("all");
  const [period, setPeriod] = useState<PortfolioHistoryPeriod>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sort, setSort] = useState<PortfolioHistorySort>("date_desc");
  const [isExporting, setIsExporting] = useState(false);

  const today = useMemo(() => todayDateKey(settings?.timezone), [settings?.timezone]);

  const isFiltered = useMemo(() => {
    return (
      query.trim() !== "" ||
      type !== "all" ||
      instrument !== "all" ||
      period !== "all" ||
      sort !== "date_desc"
    );
  }, [query, type, instrument, period, sort]);

  const resetFilters = useCallback(() => {
    void haptic.selection();
    setQuery("");
    setType("all");
    setInstrument("all");
    setPeriod("all");
    setCustomFrom("");
    setCustomTo("");
    setSort("date_desc");
  }, []);

  const filterOptions: PortfolioHistoryFilterOptions = useMemo(
    () => ({
      query,
      type,
      instrument,
      period,
      range: {
        from: customFrom.trim() || undefined,
        to: customTo.trim() || undefined,
      },
      sort,
      today,
    }),
    [query, type, instrument, period, customFrom, customTo, sort, today]
  );

  const filteredItems = useMemo(
    () => filterAndSortPortfolioHistory(transactions, holdings, filterOptions),
    [transactions, holdings, filterOptions]
  );

  const handleExportCsv = useCallback(async () => {
    if (filteredItems.length === 0) {
      toast.error("No transactions to export");
      return;
    }

    setIsExporting(true);
    void haptic.selection();

    try {
      const csv = generatePortfolioHistoryCsv(filteredItems, currency);
      const filename = `portfolio_history_${today}.csv`;

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        await Share.share({
          title: filename,
          message: csv,
        });
      }

      void haptic.success();
      toast.success(`Exported ${filteredItems.length} transactions`);
    } catch (err) {
      logWarning("portfolioHistory.exportCsv", err);
      toast.error("Could not export history CSV");
    } finally {
      setIsExporting(false);
    }
  }, [filteredItems, currency, today]);

  const renderItem = useCallback(
    ({ item }: { item: PortfolioHistoryItem }) => (
      <PortfolioHistoryRow item={item} currency={currency} wide={wide} />
    ),
    [currency, wide]
  );

  const keyExtractor = useCallback((item: PortfolioHistoryItem) => item.id, []);

  const toolbar = (
    <View style={styles.toolbar}>
      {/* Search and Export action */}
      <View style={styles.searchRow}>
        <View style={styles.searchBarWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search symbol or name..."
            containerStyle={styles.searchBar}
          />
        </View>

        <Pressable
          onPress={handleExportCsv}
          disabled={isExporting || filteredItems.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Export transactions as CSV"
          style={({ pressed }) => [
            styles.csvButton,
            {
              backgroundColor: surfaces.tile,
              borderColor: theme.colors.outlineVariant,
              opacity: pressed || isExporting || filteredItems.length === 0 ? 0.6 : 1,
            },
          ]}
        >
          <Download size={15} color={theme.colors.foreground} />
          <Text style={[styles.csvButtonText, { color: theme.colors.foreground }]}>
            CSV
          </Text>
        </Pressable>
      </View>

      {/* Type filter chips */}
      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          accessibilityRole="radiogroup"
        >
          {TYPE_FILTERS.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              size="sm"
              selected={type === f.id}
              onPress={() => setType(f.id)}
              accessibilityRole="radio"
            />
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>

      {/* Asset category filter chips */}
      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          accessibilityRole="radiogroup"
        >
          {INSTRUMENT_FILTERS.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              size="sm"
              selected={instrument === f.id}
              onPress={() => setInstrument(f.id)}
              accessibilityRole="radio"
            />
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>

      {/* Period filter chips */}
      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          accessibilityRole="radiogroup"
        >
          {PERIOD_FILTERS.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              size="sm"
              selected={period === f.id}
              onPress={() => setPeriod(f.id)}
              accessibilityRole="radio"
            />
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>

      {/* Custom Date Range pickers */}
      {period === "custom" ? (
        <View style={styles.customDateRow}>
          <DateField
            label="From"
            value={customFrom}
            onChange={setCustomFrom}
            maxDate={customTo || undefined}
            containerStyle={styles.dateInput}
          />
          <DateField
            label="To"
            value={customTo}
            onChange={setCustomTo}
            minDate={customFrom || undefined}
            containerStyle={styles.dateInput}
          />
        </View>
      ) : null}

      {/* Sort options row */}
      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          accessibilityRole="radiogroup"
        >
          <Text style={[styles.sortLabel, { color: theme.colors.mutedForeground }]}>
            Sort:
          </Text>
          {SORT_OPTIONS.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              size="sm"
              selected={sort === s.id}
              onPress={() => setSort(s.id)}
              accessibilityRole="radio"
            />
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>

      {/* Filter active summary and reset button */}
      <View style={styles.summaryBar}>
        <Text style={[styles.resultCount, { color: theme.colors.mutedForeground }]}>
          Showing {filteredItems.length} of {transactions.length}{" "}
          {filteredItems.length === 1 ? "trade" : "trades"}
        </Text>

        {isFiltered ? (
          <Pressable
            onPress={resetFilters}
            style={({ pressed }) => [
              styles.resetBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Reset all filters"
          >
            <RotateCcw size={12} color={theme.colors.primary} />
            <Text style={[styles.resetText, { color: theme.colors.primary }]}>
              Reset filters
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const empty = useMemo(() => {
    if (transactions.length === 0) {
      return (
        <EmptyState
          title="No investment transactions"
          description="Your trade history, acquisitions, sells, and portfolio adjustments will appear here."
          compact
        />
      );
    }
    return (
      <EmptyState
        title="No matching transactions"
        description="Try adjusting or clearing your search and filters to view more trades."
        primaryAction={{
          label: "Reset filters",
          onPress: resetFilters,
        }}
        compact
      />
    );
  }, [transactions.length, resetFilters]);

  return (
    <View
      style={styles.container}
      onLayout={(e) => setListWidth(Math.round(e.nativeEvent.layout.width))}
    >
      <FlashList
        style={styles.list}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={
          <View>
            {listHeader}
            {toolbar}
            {wide && filteredItems.length > 0 ? <PortfolioHistoryTableHeader /> : null}
          </View>
        }
        ListEmptyComponent={empty}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: listBottomPadding }}
        extraData={`${query}-${type}-${instrument}-${period}-${customFrom}-${customTo}-${sort}-${wide}`}
        onScrollBeginDrag={() => {
          sampleScrollFps("portfolio_history");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  toolbar: {
    gap: 10,
    paddingBottom: 14,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchBarWrap: {
    flex: 1,
  },
  searchBar: {
    minHeight: 46,
  },
  csvButton: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  csvButtonText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: "600",
    paddingRight: 2,
  },
  customDateRow: {
    flexDirection: "row",
    gap: 8,
  },
  dateInput: {
    flex: 1,
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingHorizontal: 2,
  },
  resultCount: {
    fontSize: 12,
    fontWeight: "500",
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  resetText: {
    fontSize: 12,
    fontWeight: "600",
  },
  separator: {
    height: 8,
  },
});

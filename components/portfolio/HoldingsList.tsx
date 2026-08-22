import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Download, Plus, Search, X } from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_GREEN_BORDER,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { EmptyState } from "@/components/common/EmptyState";
import { BOTTOM_NAV_FAB_GAP, BOTTOM_NAV_FAB_SIZE } from "@/components/layout/chrome";
import { HoldingCard } from "@/components/portfolio/HoldingCard";
import { AddHoldingModal } from "@/components/portfolio/AddHoldingModal";
import { CsvImportModal } from "@/components/portfolio/CsvImportModal";
import { MockTradeModal } from "@/components/portfolio/MockTradeModal";
import { haptic } from "@/lib/haptics";
import { sampleScrollFps } from "@/lib/perf";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { computePositionMetrics } from "@/shared/types/market";
import type {
  Holding,
  HoldingWithMetrics,
  InstrumentType,
} from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

type SortOption = "value" | "pl_percent" | "day_change";

const FILTERS: { label: string; value: InstrumentType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Stocks", value: "stock" },
  { label: "ETFs", value: "etf" },
  { label: "Mutual Funds", value: "mutual_fund" },
  { label: "Crypto", value: "crypto" },
  { label: "Gold", value: "gold" },
];

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "value", label: "Value" },
  { id: "pl_percent", label: "P&L %" },
  { id: "day_change", label: "Day %" },
];

function ItemSeparator() {
  return <View style={styles.separator} />;
}

export function HoldingsList({ listHeader }: { listHeader?: ReactNode }) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();

  const {
    holdings,
    settings: portfolioSettings,
    addHolding,
    overwriteHoldings,
    executeMockBuy,
    executeMockSell,
    placeLimitBuyOrder,
  } = usePortfolio();

  const symbols = useMemo(
    () =>
      holdings.map((holding) => ({
        symbol: holding.yahooSymbol || holding.symbol,
        instrumentType: holding.instrumentType,
      })),
    [holdings]
  );
  const { quotes } = useMarketQuotes(symbols);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InstrumentType | "all">("all");
  const [sort, setSort] = useState<SortOption>("value");
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<HoldingWithMetrics | null>(
    null
  );
  const [searchFocused, setSearchFocused] = useState(false);

  const holdingsWithMetrics: HoldingWithMetrics[] = useMemo(() => {
    return holdings.map((holding) => {
      const quote = quotes.get(holding.yahooSymbol || holding.symbol);
      const currentPrice = quote?.currentPrice || holding.averageBuyPrice;
      const hasLiveQuote = !!quote;
      const metrics = computePositionMetrics(
        currentPrice,
        holding.quantity,
        holding.averageBuyPrice
      );
      const dayChange = quote ? quote.dayChange * holding.quantity : 0;
      const dayChangePercent = quote?.dayChangePercent || 0;

      return {
        ...holding,
        currentPrice,
        investedValue: metrics.investedValue,
        currentValue: metrics.currentValue,
        profit: metrics.profitLoss,
        profitPercent: metrics.returnPercent,
        dayChange,
        dayChangePercent,
        hasLiveQuote,
      };
    });
  }, [holdings, quotes]);

  const filteredAndSortedHoldings = useMemo(() => {
    let result = holdingsWithMetrics;

    if (filter !== "all") {
      result = result.filter((holding) => holding.instrumentType === filter);
    }

    if (search.trim()) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(
        (holding) =>
          holding.symbol.toLowerCase().includes(lowerSearch) ||
          holding.name.toLowerCase().includes(lowerSearch)
      );
    }

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (sort === "value") return b.currentValue - a.currentValue;
      if (sort === "pl_percent") return b.profitPercent - a.profitPercent;
      if (sort === "day_change") return b.dayChangePercent - a.dayChangePercent;
      return 0;
    });
    return sorted;
  }, [holdingsWithMetrics, filter, search, sort]);

  const handleAddHolding = async (
    params: Omit<Holding, "id" | "createdAt" | "updatedAt">
  ) => {
    await addHolding(params);
    return "success";
  };

  const openAdd = useCallback(() => {
    void haptic.impact();
    setAddModalVisible(true);
  }, []);

  const clearSearch = useCallback(() => {
    setSearch("");
  }, []);

  const clearFilters = useCallback(() => {
    setFilter("all");
    setSearch("");
    setSort("value");
  }, []);

  const onPressHolding = useCallback(
    (id: string) => {
      const found = holdingsWithMetrics.find((item) => item.id === id);
      if (found) setSelectedHolding(found);
    },
    [holdingsWithMetrics]
  );

  const renderHolding = useCallback(
    ({ item }: { item: HoldingWithMetrics }) => (
      <HoldingCard
        holding={item}
        currency={displayCurrency}
        onPress={onPressHolding}
      />
    ),
    [displayCurrency, onPressHolding]
  );

  const keyExtractor = useCallback((item: HoldingWithMetrics) => item.id, []);

  const hasSearch = search.trim().length > 0;
  const hasFilter = filter !== "all";
  const emptyKind =
    holdings.length === 0
      ? "none"
      : hasSearch
        ? "search"
        : hasFilter
          ? "filter"
          : "none";

  const toolbar =
    holdings.length > 0 ? (
      <View style={styles.toolbar}>
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchField,
              {
                backgroundColor: isDark ? "#10141C" : theme.colors.card,
                borderColor: searchFocused
                  ? CARD_ORANGE
                  : isDark
                    ? "rgba(148,163,184,0.14)"
                    : theme.colors.border,
              },
            ]}
          >
            <Search size={18} color={theme.colors.mutedForeground} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search holdings..."
              placeholderTextColor={theme.colors.mutedForeground}
              accessibilityLabel="Search holdings"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={[styles.searchInput, { color: theme.colors.foreground }]}
            />
            {search.length > 0 ? (
              <Pressable
                onPress={clearSearch}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={16} color={theme.colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import holdings CSV"
            onPress={() => {
              void haptic.selection();
              setImportModalVisible(true);
            }}
            style={({ pressed }) => [
              styles.csvButton,
              {
                backgroundColor: isDark ? "#10141C" : theme.colors.card,
                borderColor: isDark
                  ? "rgba(251, 191, 36, 0.35)"
                  : "rgba(217, 119, 6, 0.35)",
              },
              pressed && styles.pressed,
            ]}
          >
            <Download size={16} color={CARD_ORANGE} strokeWidth={2.3} />
            <Text style={[styles.csvLabel, { color: theme.colors.foreground }]}>
              CSV
            </Text>
          </Pressable>
        </View>

        <HorizontalSwipeBoundary>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((item) => {
              const active = filter === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => {
                    void haptic.selection();
                    setFilter(item.value);
                  }}
                  style={({ pressed }) => [
                    styles.filterChip,
                    {
                      backgroundColor: active
                        ? CARD_ORANGE
                        : isDark
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(15,23,42,0.04)",
                      borderColor: active
                        ? CARD_ORANGE
                        : isDark
                          ? "rgba(148,163,184,0.16)"
                          : theme.colors.border,
                    },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.label}
                >
                  <Text
                    style={[
                      styles.filterLabel,
                      {
                        color: active ? "#111827" : theme.colors.mutedForeground,
                        fontWeight: active ? "800" : "600",
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </HorizontalSwipeBoundary>

        <View style={styles.sortRow}>
          <Text style={[styles.sortLabel, { color: theme.colors.mutedForeground }]}>
            Sort by:
          </Text>
          {SORT_OPTIONS.map((option) => {
            const active = sort === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  void haptic.selection();
                  setSort(option.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Sort by ${option.label}`}
                hitSlop={6}
              >
                <Text
                  style={[
                    styles.sortOption,
                    {
                      color: active ? CARD_ORANGE : theme.colors.mutedForeground,
                      fontWeight: active ? "800" : "600",
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={openAdd}
          style={({ pressed }) => [
            styles.addBtn,
            {
              borderColor: isDark ? ACCOUNT_GREEN_BORDER : "rgba(22,163,74,0.35)",
              backgroundColor: isDark
                ? "rgba(14, 22, 18, 0.7)"
                : "rgba(240,253,244,0.9)",
            },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add holding"
        >
          <Plus
            size={16}
            color={isDark ? ACCOUNT_GREEN : theme.colors.success}
            strokeWidth={2.4}
          />
          <Text style={[styles.addLabel, { color: theme.colors.foreground }]}>
            Add holding
          </Text>
        </Pressable>
      </View>
    ) : null;

  const emptyTitle =
    emptyKind === "search"
      ? "No holdings found"
      : emptyKind === "filter"
        ? "No investments match these filters"
        : "No holdings yet";
  const emptyDescription =
    emptyKind === "search"
      ? "Try a different symbol or name."
      : emptyKind === "filter"
        ? "Clear filters to see all holdings."
        : "Add your first investment to start tracking your portfolio.";

  const empty = (
    <EmptyState
      illustration="general"
      title={emptyTitle}
      description={emptyDescription}
      primaryAction={
        emptyKind === "none"
          ? {
              label: "Add Investment",
              icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
              onPress: openAdd,
            }
          : emptyKind === "search"
            ? {
                label: "Clear search",
                onPress: clearSearch,
              }
            : {
                label: "Clear filters",
                onPress: clearFilters,
              }
      }
      compact
    />
  );

  return (
    <View style={styles.container}>
      <FlashList
        style={styles.list}
        data={filteredAndSortedHoldings}
        renderItem={renderHolding}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={
          <View>
            {listHeader}
            {toolbar}
          </View>
        }
        ListEmptyComponent={empty}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        extraData={`${filter}-${sort}-${search}-${isDark}`}
        onScrollBeginDrag={() => sampleScrollFps("portfolio_holdings")}
      />

      <AddHoldingModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAdd={handleAddHolding}
      />
      <CsvImportModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
        onImport={overwriteHoldings}
      />
      <MockTradeModal
        visible={!!selectedHolding}
        holding={selectedHolding}
        onClose={() => setSelectedHolding(null)}
        onBuy={executeMockBuy}
        onSell={executeMockSell}
        onPlaceLimitBuy={placeLimitBuyOrder}
        cashBalance={portfolioSettings?.cashBalance ?? 0}
        currency={displayCurrency}
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
  listContent: {
    paddingBottom: BOTTOM_NAV_FAB_SIZE + BOTTOM_NAV_FAB_GAP + 8,
  },
  toolbar: {
    gap: 12,
    paddingBottom: 14,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchField: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  csvButton: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  csvLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
    flexShrink: 0,
  },
  filterLabel: {
    fontSize: 13,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  sortOption: {
    fontSize: 13,
  },
  addBtn: {
    minHeight: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  separator: {
    height: 10,
  },
  pressed: {
    opacity: 0.84,
  },
});

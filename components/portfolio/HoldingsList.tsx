import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Text, FlatList, TouchableOpacity } from 'react-native';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/ThemeProvider';
import { themeUsesDarkPalette } from '@/theme/tokens';
import { HoldingCard } from './HoldingCard';
import { AddHoldingModal } from './AddHoldingModal';
import { CsvImportModal } from './CsvImportModal';
import { MockTradeModal } from './MockTradeModal';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useMarketQuotes } from '@/hooks/useMarketQuotes';
import { useSystemSettings } from '@/providers/SystemSettingsProvider';
import { computePositionMetrics } from '@/shared/types/market';
import { Download, Plus } from 'lucide-react-native';
import type { Holding, HoldingWithMetrics, InstrumentType } from '@/shared/features/portfolio/types';

const FILTERS: { label: string; value: InstrumentType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Stocks', value: 'stock' },
  { label: 'ETFs', value: 'etf' },
  { label: 'Mutual Funds', value: 'mutual_fund' },
  { label: 'Crypto', value: 'crypto' },
];

type SortOption = 'value' | 'pl_percent' | 'day_change';

export function HoldingsList() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const { holdings, settings: portfolioSettings, addHolding, overwriteHoldings, executeMockBuy, executeMockSell, placeLimitBuyOrder } = usePortfolio();

  // Create symbols array
  const symbols = useMemo(() => holdings.map(h => ({ symbol: h.yahooSymbol || h.symbol, instrumentType: h.instrumentType })), [holdings]);
  const { quotes } = useMarketQuotes(symbols);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InstrumentType | 'all'>('all');
  const [sort, setSort] = useState<SortOption>('value');
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<HoldingWithMetrics | null>(null);

  const holdingsWithMetrics: HoldingWithMetrics[] = useMemo(() => {
    return holdings.map(holding => {
      const quote = quotes.get(holding.yahooSymbol || holding.symbol);
      const currentPrice = quote?.currentPrice || holding.averageBuyPrice;
      const hasLiveQuote = !!quote;

      const metrics = computePositionMetrics(currentPrice, holding.quantity, holding.averageBuyPrice);

      const dayChange = quote ? (quote.dayChange * holding.quantity) : 0;
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

    if (filter !== 'all') {
      result = result.filter(h => h.instrumentType === filter);
    }

    if (search.trim()) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(h =>
        h.symbol.toLowerCase().includes(lowerSearch) ||
        h.name.toLowerCase().includes(lowerSearch)
      );
    }

    result.sort((a, b) => {
      if (sort === 'value') {
        return b.currentValue - a.currentValue;
      } else if (sort === 'pl_percent') {
        return b.profitPercent - a.profitPercent;
      } else if (sort === 'day_change') {
        return b.dayChangePercent - a.dayChangePercent;
      }
      return 0;
    });

    return result;
  }, [holdingsWithMetrics, filter, search, sort]);

  const handleAddHolding = async (params: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>) => {
    await addHolding(params);
    return 'success';
  };

  const textStyle = { color: theme.colors.foreground };
  const primaryBg = { backgroundColor: theme.colors.primary };
  const primaryText = { color: theme.colors.primaryForeground };
  const unselectedBg = { backgroundColor: theme.colors.muted };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchWrap}>
          <Input
            placeholder="Search holdings..."
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Import holdings CSV"
          style={[styles.importButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          onPress={() => setImportModalVisible(true)}
        >
          <Download size={16} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: '700' }}>CSV</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filtersScroll}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterPill, filter === item.value ? primaryBg : unselectedBg]}
              onPress={() => setFilter(item.value)}
            >
              <Text style={[styles.filterText, filter === item.value ? primaryText : textStyle]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, textStyle]}>Sort by:</Text>
        {(['value', 'pl_percent', 'day_change'] as SortOption[]).map(s => (
          <TouchableOpacity key={s} onPress={() => setSort(s)} style={styles.sortBtn}>
            <Text style={[styles.sortBtnText, sort === s ? { color: theme.colors.primary, fontWeight: '700' } : { color: theme.colors.mutedForeground }]}>
              {s === 'value' ? 'Value' : s === 'pl_percent' ? 'P&L %' : 'Day %'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredAndSortedHoldings}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <HoldingCard
            holding={item}
            currency={system.defaultCurrency}
            onPress={() => setSelectedHolding(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, textStyle]}>No holdings found.</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => setAddModalVisible(true)}
      >
        <Plus color={theme.colors.primaryForeground} size={24} />
      </TouchableOpacity>

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
        currency={system.defaultCurrency}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchInput: {
    marginBottom: 0,
  },
  searchWrap: {
    flex: 1,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    marginLeft: 8,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sortLabel: {
    fontSize: 12,
    marginRight: 12,
  },
  sortBtn: {
    marginRight: 16,
  },
  sortBtnText: {
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.7,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});

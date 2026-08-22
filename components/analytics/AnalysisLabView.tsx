import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Layers,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/Card";
import {
  FilterSheetModal,
  type LabFilters,
} from "@/components/analytics/FilterSheetModal";
import { useAccounts } from "@/hooks/useAccounts";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import type { Expense, Income } from "@/shared/types/expense";
import { currentMonthKey, toLocalDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface UnifiedTransaction {
  id: string;
  type: "expense" | "income";
  date: string;
  amount: number;
  category: string;
  subcategory?: string;
  accountId?: string;
  note?: string;
  tags?: string[];
}

export interface AnalysisLabViewProps {
  initialQuery?: string;
}

export function AnalysisLabView({ initialQuery = "" }: AnalysisLabViewProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();

  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { accounts } = useAccounts();

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<LabFilters>({
    query: initialQuery,
    type: "all",
    datePreset: "all",
    categories: [],
    accountIds: [],
    minAmount: "",
    maxAmount: "",
  });

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [accounts]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    expenses.forEach((e) => {
      if (e.category) cats.add(e.category);
    });
    return Array.from(cats).sort();
  }, [expenses]);

  // Combine expenses and incomes into unified collection
  const allTransactions: UnifiedTransaction[] = useMemo(() => {
    const expList: UnifiedTransaction[] = expenses.map((e) => ({
      id: e.id || "",
      type: "expense",
      date: e.date,
      amount: e.amount,
      category: e.category,
      subcategory: e.subcategory,
      accountId: e.accountId,
      note: e.note,
      tags: e.tags,
    }));

    const incList: UnifiedTransaction[] = incomes.map((inc) => ({
      id: inc.id || "",
      type: "income",
      date: inc.date,
      amount: inc.amount,
      category: inc.source || "Income",
      accountId: inc.accountId,
      note: inc.note,
    }));

    return [...expList, ...incList].sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, incomes]);

  // Apply filters & search query
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const currentMonthStr = currentMonthKey();
    const currentYearStr = String(now.getFullYear());
    const thirtyDaysAgo = toLocalDateKey(
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    );

    const minNum = parseFloat(filters.minAmount);
    const maxNum = parseFloat(filters.maxAmount);
    const queryLower = filters.query.trim().toLowerCase();

    return allTransactions.filter((item) => {
      // Type filter
      if (filters.type !== "all" && item.type !== filters.type) return false;

      // Date preset filter
      if (filters.datePreset === "this_month" && !item.date.startsWith(currentMonthStr)) {
        return false;
      }
      if (filters.datePreset === "this_year" && !item.date.startsWith(currentYearStr)) {
        return false;
      }
      if (filters.datePreset === "last_30_days" && item.date < thirtyDaysAgo) {
        return false;
      }

      // Min/Max amount
      if (!isNaN(minNum) && item.amount < minNum) return false;
      if (!isNaN(maxNum) && item.amount > maxNum) return false;

      // Category filter
      if (filters.categories.length > 0 && !filters.categories.includes(item.category)) {
        return false;
      }

      // Account filter
      if (filters.accountIds.length > 0 && (!item.accountId || !filters.accountIds.includes(item.accountId))) {
        return false;
      }

      // Text query match
      if (queryLower) {
        const matchNote = item.note?.toLowerCase().includes(queryLower);
        const matchCat = item.category.toLowerCase().includes(queryLower);
        const matchSub = item.subcategory?.toLowerCase().includes(queryLower);
        const matchAcc = item.accountId && accountMap.get(item.accountId)?.toLowerCase().includes(queryLower);
        const matchTag = item.tags?.some((t) => t.toLowerCase().includes(queryLower));
        const matchAmount = String(item.amount).includes(queryLower);

        if (!matchNote && !matchCat && !matchSub && !matchAcc && !matchTag && !matchAmount) {
          return false;
        }
      }

      return true;
    });
  }, [allTransactions, filters, accountMap]);

  // Aggregate stats
  const totalAmount = useMemo(
    () => filteredTransactions.reduce((sum, item) => sum + item.amount, 0),
    [filteredTransactions]
  );
  const avgAmount =
    filteredTransactions.length > 0 ? totalAmount / filteredTransactions.length : 0;

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.type !== "all") count++;
    if (filters.datePreset !== "all") count++;
    if (filters.categories.length > 0) count += filters.categories.length;
    if (filters.accountIds.length > 0) count += filters.accountIds.length;
    if (filters.minAmount || filters.maxAmount) count++;
    return count;
  }, [filters]);

  return (
    <View style={styles.container}>
      {/* Search Input Bar */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Search size={18} color={theme.colors.mutedForeground} />
        <TextInput
          value={filters.query}
          onChangeText={(q) => setFilters((p) => ({ ...p, query: q }))}
          placeholder="Search by note, category, tag, account or amount..."
          placeholderTextColor={theme.colors.mutedForeground}
          style={[styles.searchInput, { color: theme.colors.foreground }]}
        />
        {filters.query.length > 0 && (
          <Pressable
            onPress={() => setFilters((p) => ({ ...p, query: "" }))}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
          >
            <X size={16} color={theme.colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => {
            haptic.selection().catch(() => undefined);
            setIsFilterModalOpen(true);
          }}
          style={({ pressed }) => [
            styles.filterTriggerBtn,
            {
              backgroundColor:
                activeFiltersCount > 0
                  ? theme.colors.primary
                  : isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
              borderColor:
                activeFiltersCount > 0 ? theme.colors.primary : theme.colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <SlidersHorizontal
            size={14}
            color={activeFiltersCount > 0 ? "#FFFFFF" : theme.colors.foreground}
          />
          <Text
            style={[
              styles.filterTriggerText,
              { color: activeFiltersCount > 0 ? "#FFFFFF" : theme.colors.foreground },
            ]}
          >
            Filters{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
          </Text>
        </Pressable>

        {/* Quick Date Presets */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickChipsScroll}
        >
          {(
            [
              { id: "all", label: "All" },
              { id: "this_month", label: "This Month" },
              { id: "last_30_days", label: "30D" },
              { id: "this_year", label: "Year" },
            ] as const
          ).map((dp) => {
            const isSelected = filters.datePreset === dp.id;
            return (
              <Pressable
                key={dp.id}
                onPress={() => {
                  haptic.selection().catch(() => undefined);
                  setFilters((p) => ({ ...p, datePreset: dp.id }));
                }}
                style={[
                  styles.quickChip,
                  {
                    backgroundColor: isSelected
                      ? isDark
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(0,0,0,0.08)"
                      : "transparent",
                    borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.quickChipText,
                    {
                      color: isSelected
                        ? theme.colors.primary
                        : theme.colors.mutedForeground,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {dp.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Live Aggregation Summary */}
      <Card style={styles.summaryCard}>
        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
            Matched
          </Text>
          <Text style={[styles.statValue, { color: theme.colors.foreground }]}>
            {filteredTransactions.length}
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
            Total Sum
          </Text>
          <Amount
            value={totalAmount}
            currency={displayCurrency}
            ghostable
            style={{ fontSize: 16, fontWeight: "800", color: theme.colors.foreground }}
          />
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
            Average
          </Text>
          <Amount
            value={avgAmount}
            currency={displayCurrency}
            ghostable
            style={{ fontSize: 16, fontWeight: "800", color: theme.colors.mutedForeground }}
          />
        </View>
      </Card>

      {/* Transaction List */}
      {filteredTransactions.length === 0 ? (
        <EmptyState
          illustration="search"
          title="No Transactions Found"
          description="Try broadening your search query, adjusting amount bounds, or resetting filters."
          primaryAction={{
            label: "Reset All Filters",
            onPress: () => {
              setFilters({
                query: "",
                type: "all",
                datePreset: "all",
                categories: [],
                accountIds: [],
                minAmount: "",
                maxAmount: "",
              });
            },
          }}
          tip="The Analytics Lab allows deep multi-attribute slicing across all ledger accounts simultaneously."
        />
      ) : (
        <View style={styles.listContainer}>
          {filteredTransactions.slice(0, 50).map((item) => {
            const isExpense = item.type === "expense";
            const accName = item.accountId ? accountMap.get(item.accountId) : undefined;
            return (
              <View
                key={item.id}
                style={[
                  styles.txRow,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View style={styles.txLeft}>
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: isExpense
                          ? isDark
                            ? "rgba(239,68,68,0.12)"
                            : "rgba(239,68,68,0.06)"
                          : isDark
                          ? "rgba(34,197,94,0.12)"
                          : "rgba(34,197,94,0.06)",
                      },
                    ]}
                  >
                    {isExpense ? (
                      <ArrowUpRight size={18} color="#EF4444" />
                    ) : (
                      <ArrowDownLeft size={18} color="#22C55E" />
                    )}
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.txTitle, { color: theme.colors.foreground }]}
                      numberOfLines={1}
                    >
                      {item.note || item.category}
                    </Text>
                    <View style={styles.txMetaRow}>
                      <Text style={[styles.txMetaText, { color: theme.colors.mutedForeground }]}>
                        {item.date} • {item.category}
                      </Text>
                      {accName && (
                        <Text
                          style={[styles.accBadge, { color: theme.colors.primary }]}
                          numberOfLines={1}
                        >
                          • {accName}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                <Amount
                  value={item.amount}
                  currency={displayCurrency}
                  ghostable
                  style={{
                    fontSize: 15,
                    fontWeight: "800",
                    color: isExpense ? theme.colors.foreground : theme.colors.success,
                  }}
                />
              </View>
            );
          })}
          {filteredTransactions.length > 50 && (
            <Text
              style={[
                styles.limitNotice,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Showing first 50 of {filteredTransactions.length} results. Refine filters for more specific items.
            </Text>
          )}
        </View>
      )}

      {/* Filter Bottom Sheet Modal */}
      <FilterSheetModal
        visible={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        filters={filters}
        onApply={(f) => setFilters(f)}
        availableCategories={availableCategories}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  clearBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterTriggerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterTriggerText: {
    fontSize: 13,
    fontWeight: "700",
  },
  quickChipsScroll: {
    flexDirection: "row",
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  quickChipText: {
    fontSize: 13,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 18,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "800",
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  listContainer: {
    gap: 8,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 60,
  },
  txLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
    minWidth: 0,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  txTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  txMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  txMetaText: {
    fontSize: 12,
  },
  accBadge: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  limitNotice: {
    fontSize: 12,
    textAlign: "center",
    marginVertical: 8,
  },
});

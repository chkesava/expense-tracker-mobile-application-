import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import {
  FilterSheetModal,
  type DatePreset,
  type LabFilters,
} from "@/components/analytics/FilterSheetModal";
import {
  ActiveFilterChips,
  type ActiveFilterChip,
} from "@/components/analytics/search/ActiveFilterChips";
import { PopularSearches } from "@/components/analytics/search/PopularSearches";
import {
  ResultsHeader,
  type SearchSort,
} from "@/components/analytics/search/ResultsHeader";
import { SearchField } from "@/components/analytics/search/SearchField";
import { SearchFilterBar } from "@/components/analytics/search/SearchFilterBar";
import { SearchResultRow } from "@/components/analytics/search/SearchResultRow";
import { SearchSummaryCard } from "@/components/analytics/search/SearchSummaryCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Skeleton } from "@/components/common/Skeleton";
import {
  BOTTOM_NAV_CONTENT_CLEARANCE,
  BOTTOM_NAV_FAB_GAP,
  BOTTOM_NAV_FAB_SIZE,
} from "@/components/layout/chrome";
import { useAccounts } from "@/hooks/useAccounts";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useModals } from "@/providers/ModalProvider";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import type { Expense, Income } from "@/shared/types/expense";
import { currentMonthKey, toLocalDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

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

const EMPTY_FILTERS: LabFilters = {
  query: "",
  type: "all",
  datePreset: "all",
  categories: [],
  accountIds: [],
  minAmount: "",
  maxAmount: "",
};

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "All time",
  this_month: "This month",
  last_30_days: "Last 30 days",
  this_year: "This year",
};

/** How many popular-search chips to derive from the user's own data. */
const MAX_SUGGESTIONS = 5;

export interface AnalysisLabViewProps {
  initialQuery?: string;
  /** Screen chrome (page header + tabs) scrolled with the results. */
  listHeader?: ReactNode;
}

export function AnalysisLabView({
  initialQuery = "",
  listHeader,
}: AnalysisLabViewProps) {
  const { themeName } = useTheme();
  const { setEditingExpense, setEditingIncome } = useModals();

  const {
    expenses,
    loading: expensesLoading,
    error: expensesError,
    retry: retryExpenses,
  } = useExpenses();
  const { incomes } = useIncomes();
  const { accounts } = useAccounts();

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<LabFilters>({
    ...EMPTY_FILTERS,
    query: initialQuery,
  });
  const [sort, setSort] = useState<SearchSort>("latest");
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

  const currency = useDisplayCurrency();

  // A deep link can arrive after mount (?q=...), so keep the query in step.
  useEffect(() => {
    if (initialQuery) {
      setFilters((prev) => ({ ...prev, query: initialQuery }));
    }
  }, [initialQuery]);

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

  // Source records, kept so a tapped result can open the existing editor.
  const expenseById = useMemo(() => {
    const map = new Map<string, Expense>();
    expenses.forEach((e) => {
      if (e.id) map.set(e.id, e);
    });
    return map;
  }, [expenses]);

  const incomeById = useMemo(() => {
    const map = new Map<string, Income>();
    incomes.forEach((inc) => {
      if (inc.id) map.set(inc.id, inc);
    });
    return map;
  }, [incomes]);

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

  /** Client-side ordering of the already-filtered set. */
  const sortedTransactions = useMemo(() => {
    if (sort === "latest") return filteredTransactions;
    const next = [...filteredTransactions];
    switch (sort) {
      case "oldest":
        return next.sort((a, b) => a.date.localeCompare(b.date));
      case "highest":
        return next.sort((a, b) => b.amount - a.amount);
      case "lowest":
        return next.sort((a, b) => a.amount - b.amount);
      default:
        return next;
    }
  }, [filteredTransactions, sort]);

  // Aggregate stats
  const totalAmount = useMemo(
    () => filteredTransactions.reduce((sum, item) => sum + item.amount, 0),
    [filteredTransactions]
  );
  const avgAmount =
    filteredTransactions.length > 0 ? totalAmount / filteredTransactions.length : null;

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.type !== "all") count++;
    if (filters.datePreset !== "all") count++;
    if (filters.categories.length > 0) count += filters.categories.length;
    if (filters.accountIds.length > 0) count += filters.accountIds.length;
    if (filters.minAmount || filters.maxAmount) count++;
    return count;
  }, [filters]);

  /**
   * Popular searches, derived from the user's own notes and categories —
   * repeated notes first, then the busiest categories as a fallback.
   */
  const suggestions = useMemo(() => {
    const noteCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();

    expenses.forEach((e) => {
      const note = e.note?.trim();
      if (note && note.length >= 3) {
        noteCounts.set(note, (noteCounts.get(note) || 0) + 1);
      }
      if (e.category) {
        categoryCounts.set(e.category, (categoryCounts.get(e.category) || 0) + 1);
      }
    });

    const byCountDesc = (a: [string, number], b: [string, number]) => b[1] - a[1];

    const repeatedNotes = Array.from(noteCounts.entries())
      .filter(([, count]) => count > 1)
      .sort(byCountDesc)
      .map(([note]) => note);

    const topCategories = Array.from(categoryCounts.entries())
      .sort(byCountDesc)
      .map(([category]) => category);

    const seen = new Set<string>();
    const picked: string[] = [];
    [...repeatedNotes, ...topCategories].forEach((term) => {
      const key = term.toLowerCase();
      if (seen.has(key) || picked.length >= MAX_SUGGESTIONS) return;
      seen.add(key);
      picked.push(term);
    });
    return picked;
  }, [expenses]);

  const resetFilters = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS });
  }, []);

  /** Everything except the free-text query, which has its own clear button. */
  const clearFiltersOnly = useCallback(() => {
    setFilters((prev) => ({ ...EMPTY_FILTERS, query: prev.query }));
  }, []);

  const activeChips: ActiveFilterChip[] = useMemo(() => {
    const chips: ActiveFilterChip[] = [];

    if (filters.type !== "all") {
      chips.push({
        id: "type",
        label: `Type: ${filters.type === "expense" ? "Expenses" : "Incomes"}`,
        onRemove: () => setFilters((prev) => ({ ...prev, type: "all" })),
      });
    }

    if (filters.datePreset !== "all") {
      chips.push({
        id: "date",
        label: `Date: ${DATE_PRESET_LABELS[filters.datePreset]}`,
        onRemove: () => setFilters((prev) => ({ ...prev, datePreset: "all" })),
      });
    }

    filters.categories.forEach((category) => {
      chips.push({
        id: `category-${category}`,
        label: `Category: ${category}`,
        onRemove: () =>
          setFilters((prev) => ({
            ...prev,
            categories: prev.categories.filter((c) => c !== category),
          })),
      });
    });

    filters.accountIds.forEach((accountId) => {
      chips.push({
        id: `account-${accountId}`,
        label: `Account: ${accountMap.get(accountId) ?? "Unknown"}`,
        onRemove: () =>
          setFilters((prev) => ({
            ...prev,
            accountIds: prev.accountIds.filter((id) => id !== accountId),
          })),
      });
    });

    if (filters.minAmount || filters.maxAmount) {
      const min = filters.minAmount || "0";
      const max = filters.maxAmount || "∞";
      chips.push({
        id: "amount",
        label: `Amount: ${min} – ${max}`,
        onRemove: () =>
          setFilters((prev) => ({ ...prev, minAmount: "", maxAmount: "" })),
      });
    }

    return chips;
  }, [accountMap, filters]);

  const handleOpenTransaction = useCallback(
    (item: UnifiedTransaction) => {
      if (item.type === "expense") {
        const expense = expenseById.get(item.id);
        if (expense) setEditingExpense(expense);
        return;
      }
      const income = incomeById.get(item.id);
      if (income) setEditingIncome(income);
    },
    [expenseById, incomeById, setEditingExpense, setEditingIncome]
  );

  const renderRow = useCallback(
    ({ item }: { item: UnifiedTransaction }) => {
      const canOpen =
        item.type === "expense"
          ? expenseById.has(item.id)
          : incomeById.has(item.id);

      return (
        <SearchResultRow
          type={item.type}
          title={item.note || item.category}
          date={item.date}
          category={item.category}
          accountName={
            item.accountId ? accountMap.get(item.accountId) : undefined
          }
          amount={item.amount}
          currency={currency}
          query={filters.query}
          onPress={canOpen ? () => handleOpenTransaction(item) : undefined}
        />
      );
    },
    [
      accountMap,
      currency,
      expenseById,
      filters.query,
      handleOpenTransaction,
      incomeById,
    ]
  );

  const controls = (
    <View style={styles.controls}>
      <SearchField
        value={filters.query}
        onChangeText={(query) => setFilters((prev) => ({ ...prev, query }))}
      />

      <SearchFilterBar
        datePreset={filters.datePreset}
        onDatePresetChange={(datePreset) =>
          setFilters((prev) => ({ ...prev, datePreset }))
        }
        activeFilterCount={activeFiltersCount}
        onOpenFilters={() => setIsFilterModalOpen(true)}
      />

      <ActiveFilterChips chips={activeChips} onClearAll={clearFiltersOnly} />

      <SearchSummaryCard
        matched={filteredTransactions.length}
        totalSum={totalAmount}
        average={avgAmount}
        currency={currency}
      />

      {!suggestionsDismissed && !filters.query ? (
        <PopularSearches
          suggestions={suggestions}
          onSelect={(query) => setFilters((prev) => ({ ...prev, query }))}
          onDismiss={() => setSuggestionsDismissed(true)}
        />
      ) : null}

      {sortedTransactions.length > 0 ? (
        <ResultsHeader
          count={sortedTransactions.length}
          sort={sort}
          onSortChange={setSort}
        />
      ) : null}
    </View>
  );

  const filterSheet = (
    <FilterSheetModal
      visible={isFilterModalOpen}
      onClose={() => setIsFilterModalOpen(false)}
      filters={filters}
      onApply={(next) => setFilters(next)}
      availableCategories={availableCategories}
    />
  );

  // Listener failure — never fall through to "no results", which would read as
  // "you have no matching transactions".
  if (expensesError && expenses.length === 0) {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.stateWrap}
      >
        {listHeader}
        <ErrorState
          title="Unable to search transactions"
          description={expensesError.message}
          onRetry={expensesError.retryable ? retryExpenses : undefined}
        />
      </ScrollView>
    );
  }

  if (expensesLoading && expenses.length === 0) {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.stateWrap}
      >
        {listHeader}
        <Skeleton height={52} borderRadius={16} />
        <Skeleton height={40} borderRadius={20} />
        <Skeleton height={92} borderRadius={20} />
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Skeleton key={row} height={62} borderRadius={16} />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        style={styles.list}
        data={sortedTransactions}
        renderItem={renderRow}
        keyExtractor={(item, index) => item.id || `${item.type}-${index}`}
        extraData={`${themeName}|${sort}|${filters.query}|${activeFiltersCount}`}
        ItemSeparatorComponent={RowSeparator}
        ListHeaderComponent={
          <View>
            {listHeader}
            {controls}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            illustration="search"
            title="No matching transactions"
            description="Try a different keyword or adjust your filters."
            primaryAction={
              filters.query
                ? {
                    label: "Clear Search",
                    onPress: () => setFilters((prev) => ({ ...prev, query: "" })),
                  }
                : undefined
            }
            secondaryAction={
              activeFiltersCount > 0
                ? { label: "Clear Filters", onPress: resetFilters }
                : undefined
            }
            tip="Search & Lab slices notes, categories, tags, accounts and amounts across every ledger account at once."
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      {filterSheet}
    </View>
  );
}

function RowSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  controls: {
    gap: 12,
    paddingBottom: 12,
  },
  separator: {
    height: 8,
  },
  listContent: {
    // PageShell already clears the nav bar; this only clears the floating
    // add button so the last row is never hidden behind it.
    paddingBottom:
      BOTTOM_NAV_FAB_SIZE + BOTTOM_NAV_FAB_GAP - BOTTOM_NAV_CONTENT_CLEARANCE,
  },
  stateWrap: {
    gap: 12,
    paddingBottom:
      BOTTOM_NAV_FAB_SIZE + BOTTOM_NAV_FAB_GAP - BOTTOM_NAV_CONTENT_CLEARANCE,
  },
});

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Plus, Search, SlidersHorizontal, X } from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_GREEN_BORDER,
} from "@/components/accounts/accountScreenTheme";
import { BorrowingCard } from "@/components/borrowings/BorrowingCard";
import { BorrowingDetailModal } from "@/components/borrowings/BorrowingDetailModal";
import {
  BorrowingFilters,
  type BorrowingDateFilter,
  type BorrowingStatusFilter,
} from "@/components/borrowings/BorrowingFilters";
import { BorrowingSummaryCard } from "@/components/borrowings/BorrowingSummaryCard";
import { CreateBorrowingModal } from "@/components/borrowings/CreateBorrowingModal";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { BOTTOM_NAV_FAB_GAP, BOTTOM_NAV_FAB_SIZE } from "@/components/layout/chrome";
import { haptic } from "@/lib/haptics";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Borrowing } from "@/shared/types/borrowing";
import { summarizeBorrowings } from "@/shared/utils/borrowingMath";
import { todayDateKey, toLocalDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

function dateFilterCutoff(filter: BorrowingDateFilter, today: string): string | null {
  if (filter === "all") return null;
  const [year, month] = today.split("-").map(Number);

  if (filter === "thisMonth") return `${today.slice(0, 7)}-01`;
  if (filter === "thisYear") return `${year}-01-01`;

  const start = new Date(year, month - 1 - 5, 1);
  return toLocalDateKey(start);
}

export function BorrowingsList({ listHeader }: { listHeader?: ReactNode }) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const {
    borrowings,
    repayments,
    loading,
    summaries,
    getSummary,
    getRepayments,
    createBorrowing,
    deleteBorrowing,
    addRepayment,
    deleteRepayment,
  } = useBorrowings();

  const [statusFilter, setStatusFilter] = useState<BorrowingStatusFilter>("all");
  const [lenderTypeFilter, setLenderTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<BorrowingDateFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startRepaying, setStartRepaying] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const today = todayDateKey();
  const filtersActive =
    statusFilter !== "all" ||
    lenderTypeFilter !== "all" ||
    dateFilter !== "all" ||
    searchQuery.trim().length > 0;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cutoff = dateFilterCutoff(dateFilter, today);

    return borrowings.filter((borrowing) => {
      if (!borrowing.id) return false;
      const summary = summaries.get(borrowing.id);
      if (!summary) return false;

      if (statusFilter === "outstanding") {
        if (summary.totalOutstanding <= 0) return false;
      } else if (statusFilter !== "all" && summary.status !== statusFilter) {
        return false;
      }

      if (lenderTypeFilter !== "all" && borrowing.lenderType !== lenderTypeFilter) {
        return false;
      }

      if (cutoff && borrowing.borrowedDate < cutoff) return false;

      if (!q) return true;
      return (
        borrowing.lenderName.toLowerCase().includes(q) ||
        (borrowing.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [
    borrowings,
    summaries,
    statusFilter,
    lenderTypeFilter,
    dateFilter,
    searchQuery,
    today,
  ]);

  const portfolio = useMemo(
    () => summarizeBorrowings(filtered, repayments, today),
    [filtered, repayments, today]
  );

  const selectedBorrowing: Borrowing | null = useMemo(
    () => borrowings.find((b) => b.id === selectedId) ?? null,
    [borrowings, selectedId]
  );

  const clearFilters = useCallback(() => {
    setStatusFilter("all");
    setLenderTypeFilter("all");
    setDateFilter("all");
    setSearchQuery("");
  }, []);

  const openCreate = useCallback(() => {
    void haptic.impact();
    setIsCreateOpen(true);
  }, []);

  const onPressCard = useCallback((id: string) => {
    setStartRepaying(false);
    setSelectedId(id);
  }, []);

  const confirmDelete = useCallback(
    (id: string) => {
      Alert.alert(
        "Delete borrowing?",
        "This removes the borrowing and all of its repayment records. Expenses and accounts are not affected.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void deleteBorrowing(id);
            },
          },
        ]
      );
    },
    [deleteBorrowing]
  );

  const onMenuCard = useCallback(
    (id: string) => {
      const borrowing = borrowings.find((item) => item.id === id);
      const summary = summaries.get(id);
      if (!borrowing || !summary) return;
      const settled =
        summary.status === "FULLY_SETTLED" || summary.status === "CLOSED";
      Alert.alert(borrowing.lenderName, undefined, [
        {
          text: "View",
          onPress: () => {
            setStartRepaying(false);
            setSelectedId(id);
          },
        },
        ...(settled
          ? []
          : [
              {
                text: "Record repayment",
                onPress: () => {
                  setStartRepaying(true);
                  setSelectedId(id);
                },
              },
            ]),
        {
          text: "Delete",
          style: "destructive" as const,
          onPress: () => confirmDelete(id),
        },
        { text: "Cancel", style: "cancel" as const },
      ]);
    },
    [borrowings, summaries, confirmDelete]
  );

  const renderItem = useCallback(
    ({ item }: { item: Borrowing }) => {
      const summary = item.id ? summaries.get(item.id) : null;
      if (!item.id || !summary) return null;
      return (
        <BorrowingCard
          borrowing={item}
          summary={summary}
          currency={system.defaultCurrency}
          onPress={onPressCard}
          onMenu={onMenuCard}
        />
      );
    },
    [summaries, system.defaultCurrency, onPressCard, onMenuCard]
  );

  const keyExtractor = useCallback((item: Borrowing) => item.id ?? "", []);

  const controls = borrowings.length > 0 ? (
    <View style={styles.controls}>
      <BorrowingSummaryCard
        totalBorrowed={portfolio.totalBorrowed}
        totalOutstanding={portfolio.totalOutstanding}
        totalInterest={portfolio.totalInterest}
        totalRepaid={portfolio.totalRepaid}
        overdueCount={portfolio.overdueCount}
        currency={system.defaultCurrency}
      />

      <BorrowingFilters
        statusFilter={statusFilter}
        lenderTypeFilter={lenderTypeFilter}
        dateFilter={dateFilter}
        onStatusChange={setStatusFilter}
        onLenderChange={setLenderTypeFilter}
        onDateChange={setDateFilter}
      />

      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchField,
            {
              backgroundColor: isDark ? "#10141C" : theme.colors.card,
              borderColor: searchFocused
                ? ACCOUNT_GREEN_BORDER
                : isDark
                  ? "rgba(148,163,184,0.14)"
                  : theme.colors.border,
            },
          ]}
        >
          <Search size={18} color={theme.colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search lender or note..."
            placeholderTextColor={theme.colors.mutedForeground}
            accessibilityLabel="Search lender or note"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={[styles.searchInput, { color: theme.colors.foreground }]}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={16} color={theme.colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            void haptic.selection();
            if (filtersActive) clearFilters();
          }}
          style={({ pressed }) => [
            styles.filterBtn,
            {
              backgroundColor: isDark ? "#10141C" : theme.colors.card,
              borderColor: filtersActive
                ? ACCOUNT_GREEN_BORDER
                : isDark
                  ? "rgba(148,163,184,0.14)"
                  : theme.colors.border,
            },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={filtersActive ? "Clear filters" : "Filters"}
        >
          <SlidersHorizontal
            size={18}
            color={filtersActive ? ACCOUNT_GREEN : theme.colors.mutedForeground}
          />
          {filtersActive ? <View style={styles.filterDot} /> : null}
        </Pressable>
      </View>

      <Pressable
        onPress={openCreate}
        style={({ pressed }) => [
          styles.recordBtn,
          {
            borderColor: isDark ? ACCOUNT_GREEN_BORDER : "rgba(22,163,74,0.35)",
            backgroundColor: isDark ? "rgba(14, 22, 18, 0.7)" : "rgba(240,253,244,0.9)",
          },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Record borrowing"
      >
        <Plus size={16} color={isDark ? ACCOUNT_GREEN : theme.colors.success} strokeWidth={2.4} />
        <Text style={[styles.recordLabel, { color: theme.colors.foreground }]}>
          Record Borrowing
        </Text>
      </Pressable>
    </View>
  ) : null;

  const empty = loading ? (
    <View style={styles.skeleton}>
      <SkeletonCard />
      <SkeletonCard />
    </View>
  ) : (
    <EmptyState
      illustration="general"
      title={
        borrowings.length === 0 ? "No borrowings found" : "No matching borrowings"
      }
      description={
        borrowings.length === 0
          ? "Record your first borrowing to start tracking it."
          : "Try a different status, lender type, period, or search term."
      }
      primaryAction={{
        label: "Record Borrowing",
        icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
        onPress: openCreate,
      }}
      secondaryAction={
        borrowings.length > 0
          ? {
              label: "Clear Filters",
              onPress: clearFilters,
            }
          : undefined
      }
      compact
    />
  );

  return (
    <View style={styles.container}>
      <FlashList
        style={styles.list}
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={
          <View>
            {listHeader}
            {controls}
          </View>
        }
        ListEmptyComponent={empty}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        extraData={`${statusFilter}-${lenderTypeFilter}-${dateFilter}-${searchQuery}-${isDark}`}
      />

      <CreateBorrowingModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={createBorrowing}
      />

      <BorrowingDetailModal
        visible={!!selectedBorrowing}
        borrowing={selectedBorrowing}
        summary={selectedId ? getSummary(selectedId) : null}
        repayments={selectedId ? getRepayments(selectedId) : []}
        currency={system.defaultCurrency}
        startRepaying={startRepaying}
        onClose={() => {
          setSelectedId(null);
          setStartRepaying(false);
        }}
        onAddRepayment={addRepayment}
        onDeleteRepayment={deleteRepayment}
        onDeleteBorrowing={async (id) => {
          const ok = await deleteBorrowing(id);
          if (ok) {
            setSelectedId(null);
            setStartRepaying(false);
          }
          return ok;
        }}
      />
    </View>
  );
}

function ItemSeparator() {
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
  listContent: {
    paddingBottom: BOTTOM_NAV_FAB_SIZE + BOTTOM_NAV_FAB_GAP + 8,
  },
  controls: {
    gap: 14,
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
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ACCOUNT_GREEN,
  },
  recordBtn: {
    minHeight: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  recordLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  skeleton: {
    gap: 12,
    paddingTop: 8,
  },
  separator: {
    height: 10,
  },
  pressed: {
    opacity: 0.84,
  },
});

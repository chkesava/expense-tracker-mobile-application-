import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { SearchBar } from "@/components/common/SearchBar";
import { SkeletonCard } from "@/components/common/Skeleton";
import { BorrowingCard } from "@/components/borrowings/BorrowingCard";
import { BorrowingDetailModal } from "@/components/borrowings/BorrowingDetailModal";
import { CreateBorrowingModal } from "@/components/borrowings/CreateBorrowingModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Borrowing, BorrowingStatus } from "@/shared/types/borrowing";
import { LENDER_TYPES, LENDER_TYPE_LABELS } from "@/shared/types/borrowing";
import { summarizeBorrowings } from "@/shared/utils/borrowingMath";
import { todayDateKey, toLocalDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

type StatusFilter = "all" | "outstanding" | BorrowingStatus;
type DateFilter = "all" | "thisMonth" | "last6Months" | "thisYear";

const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "thisMonth", label: "This month" },
  { id: "last6Months", label: "Last 6 months" },
  { id: "thisYear", label: "This year" },
];

/** Earliest borrowed date included by a date filter, or null for all time. */
function dateFilterCutoff(filter: DateFilter, today: string): string | null {
  if (filter === "all") return null;
  const [year, month] = today.split("-").map(Number);

  if (filter === "thisMonth") return `${today.slice(0, 7)}-01`;
  if (filter === "thisYear") return `${year}-01-01`;

  const start = new Date(year, month - 1 - 5, 1);
  return toLocalDateKey(start);
}

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "outstanding", label: "Outstanding" },
  { id: "ACTIVE", label: "Active" },
  { id: "PARTIALLY_SETTLED", label: "Partial" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "FULLY_SETTLED", label: "Settled" },
];

export function BorrowingsList() {
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

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [lenderTypeFilter, setLenderTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const today = todayDateKey();

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

      if (
        lenderTypeFilter !== "all" &&
        borrowing.lenderType !== lenderTypeFilter
      ) {
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

  // Summary cards follow the active filters so the numbers match the list.
  const portfolio = useMemo(
    () => summarizeBorrowings(filtered, repayments, today),
    [filtered, repayments, today]
  );

  const selectedBorrowing: Borrowing | null = useMemo(
    () => borrowings.find((b) => b.id === selectedId) ?? null,
    [borrowings, selectedId]
  );

  const pillStyle = (isActive: boolean) => ({
    backgroundColor: isActive
      ? theme.colors.primary
      : isDark
        ? "rgba(255,255,255,0.06)"
        : "rgba(0,0,0,0.04)",
    borderColor: isActive ? theme.colors.primary : theme.colors.border,
  });

  const pillTextStyle = (isActive: boolean) => ({
    color: isActive ? theme.colors.primaryForeground : theme.colors.foreground,
    fontWeight: isActive ? ("700" as const) : ("500" as const),
  });

  return (
    <View style={styles.container}>
      {borrowings.length > 0 ? (
        <Card style={styles.summaryCard}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCell}>
              <Text
                style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
              >
                TOTAL BORROWED
              </Text>
              <Amount
                value={portfolio.totalBorrowed}
                currency={system.defaultCurrency}
                style={{
                  fontSize: 18,
                  fontWeight: "900",
                  color: theme.colors.foreground,
                }}
              />
            </View>

            <View style={styles.summaryCell}>
              <Text
                style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
              >
                OUTSTANDING
              </Text>
              <Amount
                value={portfolio.totalOutstanding}
                currency={system.defaultCurrency}
                style={{ fontSize: 18, fontWeight: "900", color: "#EF4444" }}
              />
            </View>

            <View style={styles.summaryCell}>
              <Text
                style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
              >
                INTEREST
              </Text>
              <Amount
                value={portfolio.totalInterest}
                currency={system.defaultCurrency}
                style={{ fontSize: 18, fontWeight: "900", color: "#F59E0B" }}
              />
            </View>

            <View style={styles.summaryCell}>
              <Text
                style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
              >
                REPAID
              </Text>
              <Amount
                value={portfolio.totalRepaid}
                currency={system.defaultCurrency}
                style={{ fontSize: 18, fontWeight: "900", color: "#10B981" }}
              />
            </View>
          </View>

          {portfolio.overdueCount > 0 ? (
            <Text style={[styles.overdueNote, { color: "#EF4444" }]}>
              {portfolio.overdueCount} borrowing
              {portfolio.overdueCount === 1 ? "" : "s"} past the due date
            </Text>
          ) : null}
        </Card>
      ) : null}

      {borrowings.length > 0 ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            {STATUS_FILTERS.map((filter) => {
              const isActive = statusFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setStatusFilter(filter.id);
                  }}
                  style={[styles.pill, pillStyle(isActive)]}
                >
                  <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            {[
              { id: "all", label: "Any lender" },
              ...LENDER_TYPES.map((type) => ({
                id: type as string,
                label: LENDER_TYPE_LABELS[type],
              })),
            ].map((filter) => {
              const isActive = lenderTypeFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setLenderTypeFilter(filter.id);
                  }}
                  style={[styles.pill, pillStyle(isActive)]}
                >
                  <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            {DATE_FILTERS.map((filter) => {
              const isActive = dateFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setDateFilter(filter.id);
                  }}
                  style={[styles.pill, pillStyle(isActive)]}
                >
                  <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {borrowings.length > 2 ? (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search lender or note..."
        />
      ) : null}

      {borrowings.length > 0 ? (
        <Button onPress={() => setIsCreateOpen(true)} variant="outline">
          <Plus size={16} color={theme.colors.foreground} />
          <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
            Record Borrowing
          </Text>
        </Button>
      ) : null}

      {loading ? (
        <View style={{ gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration="general"
          title={
            borrowings.length === 0
              ? "No Borrowings Tracked"
              : "No Matching Borrowings"
          }
          description={
            borrowings.length === 0
              ? "Track money borrowed from banks, finance companies, friends or family, with interest and repayments."
              : "Try a different status, lender type or search term."
          }
          primaryAction={{
            label: "Record Borrowing",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
            onPress: () => setIsCreateOpen(true),
          }}
          secondaryAction={
            borrowings.length > 0
              ? {
                  label: "Clear Filters",
                  onPress: () => {
                    setStatusFilter("all");
                    setLenderTypeFilter("all");
                    setDateFilter("all");
                    setSearchQuery("");
                  },
                }
              : undefined
          }
          tip="Borrowed money increases your account balance but is recorded as a liability, never as income."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map((borrowing) => {
            const summary = borrowing.id ? summaries.get(borrowing.id) : null;
            if (!borrowing.id || !summary) return null;
            return (
              <BorrowingCard
                key={borrowing.id}
                borrowing={borrowing}
                summary={summary}
                currency={system.defaultCurrency}
                onPress={() => setSelectedId(borrowing.id ?? null)}
              />
            );
          })}
        </View>
      )}

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
        onClose={() => setSelectedId(null)}
        onAddRepayment={addRepayment}
        onDeleteRepayment={deleteRepayment}
        onDeleteBorrowing={async (id) => {
          const ok = await deleteBorrowing(id);
          if (ok) setSelectedId(null);
          return ok;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  summaryCard: {
    borderRadius: 18,
    borderCurve: "continuous",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 14,
  },
  summaryCell: {
    width: "50%",
    gap: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  overdueNote: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 12,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
  },
});

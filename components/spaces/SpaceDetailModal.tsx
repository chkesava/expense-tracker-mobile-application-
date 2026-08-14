import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Pencil, Trash2, X } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { SearchBar } from "@/components/common/SearchBar";
import { Button } from "@/components/ui/Button";
import { useReceivables } from "@/hooks/useReceivables";
import type { Expense } from "@/shared/types/expense";
import type { Space } from "@/shared/types/space";
import { SPACE_COLORS } from "@/shared/types/space";
import { todayDateKey } from "@/shared/utils/dates";
import {
  receivablesInSpace,
  summarizeReceivables,
} from "@/shared/utils/receivableMath";
import {
  buildSpaceCategoryBreakdown,
  expensesInSpace,
  summarizeSpace,
  type BudgetProgressTier,
} from "@/shared/utils/spaceMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const TIER_COLORS: Record<BudgetProgressTier, string> = {
  none: "#6B7280",
  safe: "#10B981",
  warning: "#F59E0B",
  danger: "#F97316",
  over: "#EF4444",
};

type SortMode = "dateDesc" | "dateAsc" | "amountDesc" | "amountAsc";

const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "dateDesc", label: "Newest" },
  { id: "dateAsc", label: "Oldest" },
  { id: "amountDesc", label: "Highest" },
  { id: "amountAsc", label: "Lowest" },
];

export interface SpaceDetailModalProps {
  visible: boolean;
  space: Space | null;
  expenses: Expense[];
  currency?: string;
  onClose: () => void;
  onEdit: (space: Space) => void;
  onDelete: (spaceId: string) => Promise<boolean>;
  onArchiveToggle: (space: Space) => Promise<boolean>;
  onRemoveExpense: (expenseId: string) => Promise<boolean>;
}

export function SpaceDetailModal({
  visible,
  space,
  expenses,
  currency,
  onClose,
  onEdit,
  onDelete,
  onArchiveToggle,
  onRemoveExpense,
}: SpaceDetailModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("dateDesc");

  const { receivables, repayments } = useReceivables({
    enabled: visible && !!space?.id,
  });

  const spaceReceivables = useMemo(
    () => (space?.id ? receivablesInSpace(receivables, space.id) : []),
    [space?.id, receivables]
  );

  const moneyLentSummary = useMemo(() => {
    if (spaceReceivables.length === 0) return null;
    return summarizeReceivables(spaceReceivables, repayments, todayDateKey());
  }, [spaceReceivables, repayments]);

  const spaceExpenses = useMemo(
    () => (space?.id ? expensesInSpace(expenses, space.id) : []),
    [space?.id, expenses]
  );

  const summary = useMemo(
    () => (space ? summarizeSpace(space, expenses) : null),
    [space, expenses]
  );

  const breakdown = useMemo(
    () => buildSpaceCategoryBreakdown(spaceExpenses),
    [spaceExpenses]
  );

  const visibleExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = spaceExpenses.filter((expense) => {
      if (categoryFilter !== "all" && expense.category !== categoryFilter) {
        return false;
      }
      if (fromDate && expense.date < fromDate) return false;
      if (!q) return true;
      return (
        (expense.note ?? "").toLowerCase().includes(q) ||
        (expense.category ?? "").toLowerCase().includes(q) ||
        (expense.subcategory ?? "").toLowerCase().includes(q)
      );
    });

    return filtered.sort((a, b) => {
      switch (sortMode) {
        case "dateAsc":
          return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        case "amountDesc":
          return b.amount - a.amount;
        case "amountAsc":
          return a.amount - b.amount;
        default:
          return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
      }
    });
  }, [spaceExpenses, searchQuery, categoryFilter, fromDate, sortMode]);

  if (!space || !summary) {
    return (
      <Modal isOpen={visible} onClose={onClose} title="Space">
        <View />
      </Modal>
    );
  }

  const accent = space.color ?? SPACE_COLORS[0];
  const tierColor = TIER_COLORS[summary.tier];
  const progress = summary.hasBudget
    ? Math.min(1, summary.percentUsed / 100)
    : 0;

  const confirmDelete = () => {
    if (!space.id) return;
    Alert.alert(
      "Delete space?",
      "The space is removed and its expenses are unlinked. No expense is deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void onDelete(space.id as string);
          },
        },
      ]
    );
  };

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
    <Modal isOpen={visible} onClose={onClose} title={space.name}>
      <View style={styles.body}>
        {space.description ? (
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            {space.description}
          </Text>
        ) : null}

        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
              TOTAL SPENT
            </Text>
            <Amount
              value={summary.totalSpent}
              currency={currency}
              style={{
                fontSize: 20,
                fontWeight: "900",
                color: theme.colors.foreground,
              }}
            />
          </View>

          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
              EXPENSES
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.foreground }]}>
              {summary.expenseCount}
            </Text>
          </View>
        </View>

        {summary.hasBudget ? (
          <View style={styles.budgetBlock}>
            <View
              style={[
                styles.track,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.06)",
                },
              ]}
            >
              <View
                style={[
                  styles.fill,
                  { width: `${progress * 100}%`, backgroundColor: tierColor },
                ]}
              />
            </View>
            <View style={styles.footerRow}>
              <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
                Budget {summary.budget} · {summary.percentUsed}% used
              </Text>
              <Text style={[styles.remaining, { color: tierColor }]}>
                {summary.budgetRemaining >= 0
                  ? `${summary.budgetRemaining} left`
                  : `${Math.abs(summary.budgetRemaining)} over`}
              </Text>
            </View>
          </View>
        ) : null}

        {breakdown.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              Category Breakdown
            </Text>
            {breakdown.map((slice) => (
              <View key={slice.category} style={styles.breakdownRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.rowTitle, { color: theme.colors.foreground }]}
                    numberOfLines={1}
                  >
                    {slice.category}
                  </Text>
                  <View
                    style={[
                      styles.miniTrack,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.06)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${slice.percentage}%`,
                          backgroundColor: accent,
                        },
                      ]}
                    />
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Amount
                    value={slice.total}
                    currency={currency}
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: theme.colors.foreground,
                    }}
                  />
                  <Text
                    style={[styles.meta, { color: theme.colors.mutedForeground }]}
                  >
                    {slice.percentage}% · {slice.count}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {moneyLentSummary ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              Money Lent
            </Text>
            <View style={styles.statRow}>
              <View style={styles.statCell}>
                <Text
                  style={[styles.statLabel, { color: theme.colors.mutedForeground }]}
                >
                  LOANS
                </Text>
                <Text style={[styles.statValue, { color: theme.colors.foreground }]}>
                  {spaceReceivables.length}
                </Text>
              </View>

              <View style={styles.statCell}>
                <Text
                  style={[styles.statLabel, { color: theme.colors.mutedForeground }]}
                >
                  TOTAL LENT
                </Text>
                <Amount
                  value={moneyLentSummary.totalLent}
                  currency={currency}
                  style={{
                    fontSize: 20,
                    fontWeight: "900",
                    color: theme.colors.foreground,
                  }}
                />
              </View>

              <View style={styles.statCell}>
                <Text
                  style={[styles.statLabel, { color: theme.colors.mutedForeground }]}
                >
                  OUTSTANDING
                </Text>
                <Amount
                  value={moneyLentSummary.totalOutstanding}
                  currency={currency}
                  style={{
                    fontSize: 20,
                    fontWeight: "900",
                    color: "#EF4444",
                  }}
                />
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Expenses
          </Text>

          {spaceExpenses.length > 0 ? (
            <>
              <SearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search notes or categories..."
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                {[
                  { id: "all", label: "All categories" },
                  ...breakdown.map((slice) => ({
                    id: slice.category,
                    label: slice.category,
                  })),
                ].map((filter) => {
                  const isActive = categoryFilter === filter.id;
                  return (
                    <Pressable
                      key={filter.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setCategoryFilter(filter.id);
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
                {SORT_MODES.map((mode) => {
                  const isActive = sortMode === mode.id;
                  return (
                    <Pressable
                      key={mode.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setSortMode(mode.id);
                      }}
                      style={[styles.pill, pillStyle(isActive)]}
                    >
                      <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                        {mode.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {summary.firstExpenseDate ? (
                <View style={styles.pillRow}>
                  {[
                    { id: "", label: "Any date" },
                    {
                      id: summary.lastExpenseDate?.slice(0, 7) + "-01",
                      label: "Latest month",
                    },
                  ].map((filter) => {
                    const isActive = fromDate === filter.id;
                    return (
                      <Pressable
                        key={filter.label}
                        onPress={() => setFromDate(filter.id)}
                        style={[styles.pill, pillStyle(isActive)]}
                      >
                        <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                          {filter.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}

          {visibleExpenses.length === 0 ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              {spaceExpenses.length === 0
                ? "No expenses in this space yet. Assign expenses from the Journal."
                : "No expenses match these filters."}
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {visibleExpenses.map((expense) => (
                <View
                  key={expense.id}
                  style={[styles.expenseRow, { borderColor: theme.colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.rowTitle, { color: theme.colors.foreground }]}
                      numberOfLines={1}
                    >
                      {expense.note || expense.category}
                    </Text>
                    <Text
                      style={[styles.meta, { color: theme.colors.mutedForeground }]}
                    >
                      {expense.date} · {expense.category}
                      {expense.subcategory ? ` · ${expense.subcategory}` : ""}
                    </Text>
                  </View>

                  <Amount
                    value={expense.amount}
                    currency={currency}
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: theme.colors.foreground,
                    }}
                  />

                  <Pressable
                    onPress={() => {
                      void onRemoveExpense(expense.id as string);
                    }}
                    hitSlop={8}
                    accessibilityLabel="Remove from space"
                    accessibilityRole="button"
                  >
                    <X size={16} color={theme.colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.actionRow}>
          <Button
            variant="outline"
            onPress={() => onEdit(space)}
            style={{ flex: 1 }}
          >
            <Pencil size={16} color={theme.colors.foreground} />
            <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
              Edit
            </Text>
          </Button>

          <Button
            variant="outline"
            onPress={() => {
              void onArchiveToggle(space);
            }}
            style={{ flex: 1 }}
          >
            <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
              {space.status === "ARCHIVED" ? "Restore" : "Archive"}
            </Text>
          </Button>
        </View>

        <Button variant="outline" onPress={confirmDelete}>
          <Trash2 size={16} color={theme.colors.destructive} />
          <Text style={{ fontWeight: "700", color: theme.colors.destructive }}>
            Delete Space
          </Text>
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 18,
  },
  meta: {
    fontSize: 11,
  },
  statRow: {
    flexDirection: "row",
    gap: 16,
  },
  statCell: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
  },
  budgetBlock: {
    gap: 8,
  },
  track: {
    height: 8,
    borderRadius: 4,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  miniTrack: {
    height: 4,
    borderRadius: 2,
    borderCurve: "continuous",
    overflow: "hidden",
    marginTop: 4,
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  remaining: {
    fontSize: 11,
    fontWeight: "800",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    padding: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
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

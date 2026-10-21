import { appDialog } from "@/lib/appDialog";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pencil, Trash2, X } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { Chip } from "@/components/ui/Chip";
import { useGhostMoney } from "@/hooks/useGhostMoney";
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
} from "@/shared/utils/spaceMath";
import { spaceBudgetLeftText, spaceBudgetPresentation } from "@/shared/utils/vaultSpacePresentation";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

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
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency ?? "INR");

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("dateDesc");

  // Receivables now come from a shared app-wide listener (BorrowingsReceivablesProvider)
  // rather than a per-modal one, so there's no listener to gate with `enabled` anymore.
  const { receivables, repayments } = useReceivables();

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
  const budget = spaceBudgetPresentation(summary.tier);

  const confirmDelete = () => {
    if (!space.id) return;
    appDialog.alert(
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
              Total spent
            </Text>
            <FinancialAmount value={summary.totalSpent} currency={currency ?? "INR"} size="lg" weight="bold" />
          </View>

          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
              Expenses
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.foreground }]}>
              {summary.expenseCount}
            </Text>
          </View>
        </View>

        {summary.hasBudget ? (
          <ProgressIndicator
            pct={summary.percentUsed}
            status={budget.status}
            value={
              <Text style={[styles.progressValue, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
                Budget {money(summary.budget)}
              </Text>
            }
            statusLabel={`${budget.label} · ${spaceBudgetLeftText(summary.budgetRemaining, money)}`}
            trailing={`${summary.percentUsed}% used`}
            accessibilityLabel={`${summary.percentUsed} percent of the budget used, ${budget.label}`}
          />
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
                        backgroundColor: surfaces.track,
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
                  <FinancialAmount value={slice.total} currency={currency ?? "INR"} size="sm" weight="bold" />
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
                  Loans
                </Text>
                <Text style={[styles.statValue, { color: theme.colors.foreground }]}>
                  {spaceReceivables.length}
                </Text>
              </View>

              <View style={styles.statCell}>
                <Text
                  style={[styles.statLabel, { color: theme.colors.mutedForeground }]}
                >
                  Total lent
                </Text>
                <FinancialAmount value={moneyLentSummary.totalLent} currency={currency ?? "INR"} size="lg" weight="bold" />
              </View>

              <View style={styles.statCell}>
                <Text
                  style={[styles.statLabel, { color: theme.colors.mutedForeground }]}
                >
                  Outstanding
                </Text>
                <FinancialAmount
                  value={moneyLentSummary.totalOutstanding}
                  currency={currency ?? "INR"}
                  size="lg"
                  weight="bold"
                  tone="negative"
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
                ].map((filter) => (
                  <Chip
                    key={filter.id}
                    label={filter.label}
                    selected={categoryFilter === filter.id}
                    appearance="outline"
                    haptic={categoryFilter !== filter.id}
                    onPress={() => setCategoryFilter(filter.id)}
                  />
                ))}
              </ScrollView>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                {SORT_MODES.map((mode) => (
                  <Chip
                    key={mode.id}
                    label={mode.label}
                    selected={sortMode === mode.id}
                    appearance="outline"
                    haptic={sortMode !== mode.id}
                    onPress={() => setSortMode(mode.id)}
                  />
                ))}
              </ScrollView>

              {summary.firstExpenseDate ? (
                <View style={styles.pillRow}>
                  {[
                    { id: "", label: "Any date" },
                    {
                      id: summary.lastExpenseDate?.slice(0, 7) + "-01",
                      label: "Latest month",
                    },
                  ].map((filter) => (
                    <Chip
                      key={filter.label}
                      label={filter.label}
                      selected={fromDate === filter.id}
                      appearance="outline"
                      haptic={fromDate !== filter.id}
                      onPress={() => setFromDate(filter.id)}
                    />
                  ))}
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

                  <FinancialAmount value={expense.amount} currency={currency ?? "INR"} size="sm" weight="bold" />

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
  progressValue: {
    fontSize: 12,
    fontWeight: "600",
  },
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
});

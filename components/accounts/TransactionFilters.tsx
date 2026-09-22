import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Filter } from "lucide-react-native";

import { accountAccent } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import type {
  AccountActivityFilters,
  AccountActivityKind,
} from "@/shared/utils/accountActivityFilters";

export type ActivityFilter = AccountActivityKind;

export type AccountActivityFilterField =
  | keyof Pick<
      AccountActivityFilters,
      | "kind"
      | "specialKinds"
      | "categories"
      | "counterparties"
      | "fromDate"
      | "toDate"
      | "minAmount"
      | "maxAmount"
      | "tags"
      | "statuses"
    >;

export function TransactionFilters({
  filters,
  totalCount,
  allCount,
  incomeCount,
  expenseCount,
  transferCount,
  filteredCount,
  activeFilterCount,
  compact,
  onKindChange,
  onOpenAdvanced,
  onRemoveFilter,
  onClearAll,
  scopeLabel,
}: {
  filters: AccountActivityFilters;
  totalCount: number;
  allCount: number;
  incomeCount: number;
  expenseCount: number;
  transferCount: number;
  filteredCount: number;
  activeFilterCount: number;
  compact: boolean;
  onKindChange: (filter: ActivityFilter) => void;
  onOpenAdvanced: () => void;
  onRemoveFilter: (field: AccountActivityFilterField, value?: string) => void;
  onClearAll: () => void;
  /** e.g. "this cycle" for a credit card, appended after the activity count. */
  scopeLabel?: string;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const chips: { id: ActivityFilter; label: string; count: number }[] = [
    {
      id: "all",
      label: compact ? "All" : "All Transactions",
      count: allCount,
    },
    { id: "income", label: "Income", count: incomeCount },
    { id: "expense", label: "Expense", count: expenseCount },
    { id: "transfers", label: "Transfers", count: transferCount },
  ];

  const activeChips: Array<{
    id: string;
    label: string;
    field: AccountActivityFilterField;
    value?: string;
  }> = [];
  if (filters.kind !== "all") {
    activeChips.push({
      id: "kind",
      label:
        filters.kind === "income"
          ? "Income"
          : filters.kind === "expense"
            ? "Expense"
            : "Transfers",
      field: "kind",
    });
  }
  filters.specialKinds.forEach((value) =>
    activeChips.push({
      id: `special-${value}`,
      label:
        value === "refunds"
          ? "Refunds & cashback"
          : value === "investments"
            ? "Investments"
            : "Bills & payments",
      field: "specialKinds",
      value,
    })
  );
  filters.categories.forEach((value) =>
    activeChips.push({
      id: `category-${value}`,
      label: `Category: ${value}`,
      field: "categories",
      value,
    })
  );
  filters.counterparties.forEach((value) =>
    activeChips.push({
      id: `counterparty-${value}`,
      label: `With: ${value}`,
      field: "counterparties",
      value,
    })
  );
  if (filters.fromDate) {
    activeChips.push({
      id: "from-date",
      label: `From: ${filters.fromDate}`,
      field: "fromDate",
    });
  }
  if (filters.toDate) {
    activeChips.push({
      id: "to-date",
      label: `To: ${filters.toDate}`,
      field: "toDate",
    });
  }
  if (filters.minAmount) {
    activeChips.push({
      id: "min-amount",
      label: `Min: ${filters.minAmount}`,
      field: "minAmount",
    });
  }
  if (filters.maxAmount) {
    activeChips.push({
      id: "max-amount",
      label: `Max: ${filters.maxAmount}`,
      field: "maxAmount",
    });
  }
  filters.tags.forEach((value) =>
    activeChips.push({
      id: `tag-${value}`,
      label: `Tag: ${value}`,
      field: "tags",
      value,
    })
  );
  filters.statuses.forEach((value) =>
    activeChips.push({
      id: `status-${value}`,
      label: value === "audited" ? "Audited" : "Not audited",
      field: "statuses",
      value,
    })
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text
            style={[
              styles.title,
              { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
            ]}
          >
            Transactions
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            {activeFilterCount > 0 ? `${filteredCount} of ` : ""}
            {totalCount} {totalCount === 1 ? "activity" : "activities"}
            {scopeLabel ? ` · ${scopeLabel}` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            void haptic.selection();
            onOpenAdvanced();
          }}
          style={[
            styles.filterIcon,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)",
              borderColor: isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount > 0
              ? `Open advanced filters, ${activeFilterCount} active`
              : "Open advanced filters"
          }
        >
          <Filter size={16} color={theme.colors.mutedForeground} />
          {activeFilterCount > 0 ? (
            <View style={[styles.filterCount, { backgroundColor: accent }]}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => {
            const selected = filters.kind === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => {
                  void haptic.selection();
                  onKindChange(chip.id);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(15,23,42,0.04)",
                    borderColor: selected ? accent : "transparent",
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${chip.label} ${chip.count}`}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: selected ? accent : theme.colors.foreground },
                  ]}
                >
                  {chip.label}
                </Text>
                <View
                  style={[
                    styles.count,
                    {
                      backgroundColor: selected
                        ? isDark
                          ? "rgba(74,222,128,0.16)"
                          : "rgba(22,163,74,0.12)"
                        : isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(15,23,42,0.06)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.countText,
                      { color: selected ? accent : theme.colors.mutedForeground },
                    ]}
                  >
                    {chip.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </HorizontalSwipeBoundary>

      {activeChips.length > 0 ? (
        <View style={styles.activeChips}>
          {activeChips.map((chip) => (
            <Pressable
              key={chip.id}
              onPress={() => {
                void haptic.selection();
                onRemoveFilter(chip.field, chip.value);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${chip.label}`}
              style={({ pressed }) => [
                styles.activeChip,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(15,23,42,0.04)",
                  borderColor: isDark
                    ? "rgba(148,163,184,0.16)"
                    : "rgba(15,23,42,0.08)",
                },
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                style={[styles.activeChipText, { color: theme.colors.foreground }]}
                numberOfLines={1}
              >
                {chip.label} ×
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              void haptic.selection();
              onClearAll();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear all transaction filters"
            style={({ pressed }) => [
              styles.clearAll,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.clearAllText, { color: accent }]}>Clear all</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function TransactionColumnHeaders({
  showBalanceAfter,
}: {
  showBalanceAfter: boolean;
}) {
  const { theme } = useTheme();
  const color = theme.colors.mutedForeground;
  return (
    <View style={styles.columns}>
      <Text style={[styles.colLabel, styles.colTransaction, { color }]}>TRANSACTION</Text>
      <Text style={[styles.colLabel, styles.colTime, { color }]}>TIME</Text>
      <Text style={[styles.colLabel, styles.colAmount, { color }]}>AMOUNT</Text>
      {showBalanceAfter ? (
        <Text style={[styles.colLabel, styles.colBalance, { color }]}>BALANCE AFTER</Text>
      ) : null}
      <View style={styles.colChevron} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    marginTop: 8,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headingCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
  },
  filterIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCount: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  chips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  count: {
    minWidth: 28,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  activeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  activeChip: {
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  activeChipText: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: "600",
  },
  clearAll: {
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  clearAllText: {
    fontSize: 11.5,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.7,
  },
  columns: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingTop: 8,
    gap: 8,
  },
  colLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  colTransaction: {
    flex: 1.4,
    paddingLeft: 48,
  },
  colTime: {
    width: 78,
  },
  colAmount: {
    width: 88,
    textAlign: "right",
  },
  colBalance: {
    width: 88,
    textAlign: "right",
  },
  colChevron: {
    width: 16,
  },
});

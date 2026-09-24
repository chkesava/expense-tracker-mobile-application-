import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Filter } from "lucide-react-native";

import { accountAccent } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { SearchBar } from "@/components/common/SearchBar";
import type {
  AccountActivityFilters,
  AccountActivityKind,
} from "@/shared/utils/accountActivityFilters";
import { describeAccountActivityFilters } from "@/shared/utils/accountActivityFilterLabels";
import type { AccountActivityFilterField } from "@/shared/utils/accountActivityFilterLabels";

export type ActivityFilter = AccountActivityKind;

const DEFAULT_ACTIVITY_KINDS: ActivityFilter[] = [
  "all",
  "income",
  "expense",
  "transfers",
];

/**
 * SPENDLY-113 — the chip labels moved to `accountActivityFilterLabels` so the
 * Journal's export header can state the same filters in the same words. The
 * type is re-exported from here so no existing import has to change.
 */
export type { AccountActivityFilterField };

export function TransactionFilters({
  filters,
  searchQuery,
  onSearchChange,
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
  title = "Transactions",
  availableKinds = DEFAULT_ACTIVITY_KINDS,
  action,
}: {
  filters: AccountActivityFilters;
  searchQuery: string;
  onSearchChange: (text: string) => void;
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
  /** SPENDLY-109 — heading; the Journal calls its rows "Journal". */
  title?: string;
  /**
   * SPENDLY-109 — which kind chips to render. The Journal has no transfer rows
   * by construction, so a permanently-zero Transfers chip would be a lie; pass
   * `[]` to hide the chip row entirely.
   */
  availableKinds?: ActivityFilter[];
  /**
   * SPENDLY-113 — an optional action beside the filter button, used by the
   * Journal to export the rows these filters produced. A narrow typed object
   * rather than a `ReactNode`: a bar shared by three screens should not accept
   * arbitrary injected layout. Omitted at the account and card call sites, so
   * their filter bars are unchanged.
   */
  action?: {
    accessibilityLabel: string;
    icon: ReactNode;
    onPress: () => void;
    busy?: boolean;
  };
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const allChips: { id: ActivityFilter; label: string; count: number }[] = [
    {
      id: "all",
      label: compact ? "All" : "All Transactions",
      count: allCount,
    },
    { id: "income", label: "Income", count: incomeCount },
    { id: "expense", label: "Expense", count: expenseCount },
    { id: "transfers", label: "Transfers", count: transferCount },
  ];
  const chips = allChips.filter((chip) => availableKinds.includes(chip.id));

  const activeChips = describeAccountActivityFilters(filters);

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
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            {activeFilterCount > 0 || searchQuery.trim()
              ? `${filteredCount} of `
              : ""}
            {totalCount} {totalCount === 1 ? "activity" : "activities"}
            {scopeLabel ? ` · ${scopeLabel}` : ""}
          </Text>
        </View>
        {action ? (
          <Pressable
            onPress={() => {
              void haptic.selection();
              action.onPress();
            }}
            disabled={action.busy}
            style={[
              styles.filterIcon,
              {
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)",
                borderColor: isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
                opacity: action.busy ? 0.5 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
          >
            {action.icon}
          </Pressable>
        ) : null}
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

      <View style={styles.search}>
        <SearchBar
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search transactions"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {chips.length > 0 ? (
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
      ) : null}

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
  search: {
    marginBottom: 12,
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

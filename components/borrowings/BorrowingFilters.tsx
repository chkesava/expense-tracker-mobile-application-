import { ScrollView, StyleSheet, View } from "react-native";

import { ACCOUNT_GREEN } from "@/components/accounts/accountScreenTheme";
import {
  INTEREST_TYPES,
  LENDER_TYPES,
  LENDER_TYPE_LABELS,
} from "@/shared/types/borrowing";
import { Chip } from "@/components/ui/Chip";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import type {
  BorrowingDateFilter,
  BorrowingInterestFilter,
  BorrowingStatusFilter,
} from "@/shared/utils/borrowingFilters";

export type {
  BorrowingDateFilter,
  BorrowingInterestFilter,
  BorrowingStatusFilter,
} from "@/shared/utils/borrowingFilters";

export const BORROWING_STATUS_FILTERS: { id: BorrowingStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "outstanding", label: "Outstanding" },
  { id: "ACTIVE", label: "Active" },
  { id: "PARTIALLY_SETTLED", label: "Partial" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "FULLY_SETTLED", label: "Settled" },
];

export const BORROWING_DATE_FILTERS: { id: BorrowingDateFilter; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "thisMonth", label: "This month" },
  { id: "last6Months", label: "Last 6 months" },
  { id: "thisYear", label: "This year" },
];

export const BORROWING_LENDER_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "Any lender" },
  ...LENDER_TYPES.map((type) => ({
    id: type,
    label: LENDER_TYPE_LABELS[type],
  })),
];

const INTEREST_FILTER_LABELS: Record<(typeof INTEREST_TYPES)[number], string> = {
  NONE: "Interest-free",
  SIMPLE: "Simple interest",
};

export const BORROWING_INTEREST_FILTERS: {
  id: BorrowingInterestFilter;
  label: string;
}[] = [
  { id: "all", label: "Any terms" },
  ...INTEREST_TYPES.map((type) => ({
    id: type as BorrowingInterestFilter,
    label: INTEREST_FILTER_LABELS[type],
  })),
];

/**
 * Exported so `BorrowingFilterSheet` dresses its options identically to the
 * status row — one chip, two callers, rather than the sheet growing a
 * near-copy that drifts.
 */
export function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  // The Money hub's green: the brighter account green on dark, success on light.
  return (
    <Chip
      label={label}
      selected={active}
      onPress={onPress}
      tone="success"
      accentColor={isDark ? ACCOUNT_GREEN : undefined}
    />
  );
}

/**
 * The quick status row (SPENDLY-139).
 *
 * Lender type, date range and interest terms used to sit here as two more
 * stacked scrolling rows, which meant three rows of chips competing with the
 * list for height. They moved into `BorrowingFilterSheet`; status stays out
 * here because it is the one people flick between constantly.
 */
export function BorrowingStatusFilters({
  statusFilter,
  onStatusChange,
}: {
  statusFilter: BorrowingStatusFilter;
  onStatusChange: (id: BorrowingStatusFilter) => void;
}) {
  return (
    <View style={styles.wrap}>
      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {BORROWING_STATUS_FILTERS.map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.label}
              active={statusFilter === filter.id}
              onPress={() => onStatusChange(filter.id)}
            />
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: 12,
  },
  pressed: {
    opacity: 0.84,
  },
});

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ACCOUNT_GREEN } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { LENDER_TYPES, LENDER_TYPE_LABELS } from "@/shared/types/borrowing";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type BorrowingStatusFilter =
  | "all"
  | "outstanding"
  | "ACTIVE"
  | "PARTIALLY_SETTLED"
  | "OVERDUE"
  | "FULLY_SETTLED";

export type BorrowingDateFilter = "all" | "thisMonth" | "last6Months" | "thisYear";

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

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active
            ? isDark
              ? ACCOUNT_GREEN
              : theme.colors.success
            : isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(15,23,42,0.04)",
          borderColor: active
            ? isDark
              ? ACCOUNT_GREEN
              : theme.colors.success
            : isDark
              ? "rgba(148,163,184,0.16)"
              : theme.colors.border,
        },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.chipLabel,
          {
            color: active
              ? "#052E16"
              : theme.colors.mutedForeground,
            fontWeight: active ? "800" : "600",
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function BorrowingFilters({
  statusFilter,
  lenderTypeFilter,
  dateFilter,
  onStatusChange,
  onLenderChange,
  onDateChange,
}: {
  statusFilter: BorrowingStatusFilter;
  lenderTypeFilter: string;
  dateFilter: BorrowingDateFilter;
  onStatusChange: (id: BorrowingStatusFilter) => void;
  onLenderChange: (id: string) => void;
  onDateChange: (id: BorrowingDateFilter) => void;
}) {
  return (
    <View style={styles.wrap}>
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {BORROWING_LENDER_FILTERS.map((filter) => (
          <FilterChip
            key={filter.id}
            label={filter.label}
            active={lenderTypeFilter === filter.id}
            onPress={() => onLenderChange(filter.id)}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {BORROWING_DATE_FILTERS.map((filter) => (
          <FilterChip
            key={filter.id}
            label={filter.label}
            active={dateFilter === filter.id}
            onPress={() => onDateChange(filter.id)}
          />
        ))}
      </ScrollView>
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

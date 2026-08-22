import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Filter } from "lucide-react-native";

import { accountAccent } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

export type ActivityFilter = "all" | "debit" | "credit";

export function TransactionFilters({
  filter,
  allCount,
  debitCount,
  creditCount,
  compact,
  onChange,
  scopeLabel,
}: {
  filter: ActivityFilter;
  allCount: number;
  debitCount: number;
  creditCount: number;
  compact: boolean;
  onChange: (filter: ActivityFilter) => void;
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
    { id: "debit", label: "Debit", count: debitCount },
    { id: "credit", label: "Credit", count: creditCount },
  ];

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
            {allCount} {allCount === 1 ? "activity" : "activities"}
            {scopeLabel ? ` · ${scopeLabel}` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            void haptic.selection();
            onChange("all");
          }}
          style={[
            styles.filterIcon,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)",
              borderColor: isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Show all transactions"
        >
          <Filter size={16} color={theme.colors.mutedForeground} />
        </Pressable>
      </View>

      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => {
            const selected = filter === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => {
                  void haptic.selection();
                  onChange(chip.id);
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

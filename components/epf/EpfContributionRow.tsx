import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Pencil } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";

/**
 * One month on the backfill / history list.
 *
 * Read-only by design — tapping opens the edit sheet. A virtualizer recycles
 * views, and recycled rows carrying controlled TextInputs bleed values between
 * months and fight the keyboard. Since amounts are computed from the wage, the
 * overwhelming majority of rows never need editing at all.
 *
 * Props are primitives only, so `memo` can shallow-compare them (see the repo's
 * list-performance-item-memo rule).
 */
type Props = {
  month: string;
  monthLabel: string;
  employeeShare: number;
  employerShare: number;
  epsShare: number;
  epfCredit: number;
  statusLabel: string;
  statusTone: "neutral" | "success" | "warning" | "info";
  overridden: boolean;
  partialMonth: boolean;
  recorded: boolean;
  hasIssue: boolean;
  formatAmount: (value: number) => string;
  onPress: (month: string) => void;
};

function EpfContributionRowBase({
  month,
  monthLabel,
  employeeShare,
  employerShare,
  epsShare,
  epfCredit,
  statusLabel,
  statusTone,
  overridden,
  partialMonth,
  recorded,
  hasIssue,
  formatAmount,
  onPress,
}: Props) {
  const { theme } = useTheme();

  const toneColor =
    statusTone === "success"
      ? theme.colors.success
      : statusTone === "warning"
        ? theme.colors.destructive
        : statusTone === "info"
          ? theme.colors.primary
          : theme.colors.mutedForeground;

  return (
    <Pressable
      onPress={() => onPress(month)}
      style={[
        styles.row,
        {
          borderColor: hasIssue ? theme.colors.destructive : theme.colors.border,
          backgroundColor: theme.colors.card,
          opacity: recorded ? 1 : 0.6,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${monthLabel}, ${recorded ? statusLabel : "not recorded"}`}
    >
      <View style={styles.left}>
        <Text style={[styles.month, { color: theme.colors.foreground }]}>{monthLabel}</Text>
        {recorded ? (
          <Text style={[styles.detail, { color: theme.colors.mutedForeground }]}>
            You {formatAmount(employeeShare)} · Employer {formatAmount(employerShare)}
            {epsShare > 0 ? ` (pension ${formatAmount(epsShare)})` : ""}
          </Text>
        ) : (
          <Text style={[styles.detail, { color: theme.colors.mutedForeground }]}>
            Not recorded — tap to add
          </Text>
        )}
      </View>

      <View style={styles.right}>
        {recorded ? (
          <Text style={[styles.credit, { color: theme.colors.foreground }]}>
            {formatAmount(epfCredit)}
          </Text>
        ) : null}
        <View style={styles.chips}>
          {recorded ? (
            <Text style={[styles.chip, { color: toneColor }]}>{statusLabel}</Text>
          ) : null}
          {overridden ? (
            <Pencil size={12} color={theme.colors.mutedForeground} />
          ) : null}
          {partialMonth ? (
            <Text style={[styles.chip, { color: theme.colors.mutedForeground }]}>Part</Text>
          ) : null}
        </View>
      </View>

      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

export const EpfContributionRow = memo(EpfContributionRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginBottom: 8,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  month: {
    fontSize: 14,
    fontWeight: "600",
  },
  detail: {
    fontSize: 12,
  },
  right: {
    alignItems: "flex-end",
    gap: 4,
  },
  credit: {
    fontSize: 14,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chip: {
    fontSize: 11,
    fontWeight: "600",
  },
});

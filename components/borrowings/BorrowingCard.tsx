import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import type { Borrowing, BorrowingStatus } from "@/shared/types/borrowing";
import {
  BORROWING_STATUS_LABELS,
  LENDER_TYPE_LABELS,
} from "@/shared/types/borrowing";
import {
  describeInterest,
  type BorrowingSummary,
} from "@/shared/utils/borrowingMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const STATUS_COLORS: Record<BorrowingStatus, string> = {
  ACTIVE: "#3B82F6",
  PARTIALLY_SETTLED: "#F59E0B",
  FULLY_SETTLED: "#10B981",
  OVERDUE: "#EF4444",
  CLOSED: "#6B7280",
};

export interface BorrowingCardProps {
  borrowing: Borrowing;
  summary: BorrowingSummary;
  currency?: string;
  onPress: () => void;
}

export function BorrowingCard({
  borrowing,
  summary,
  currency,
  onPress,
}: BorrowingCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const statusColor = STATUS_COLORS[summary.status];
  const repaidRatio =
    summary.principalAmount > 0
      ? Math.min(1, summary.principalPaid / summary.principalAmount)
      : 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Borrowing from ${borrowing.lenderName}`}
    >
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <Amount
            value={summary.principalAmount}
            currency={currency}
            style={{
              fontSize: 20,
              fontWeight: "900",
              color: theme.colors.foreground,
            }}
          />
          <Text
            style={[styles.lender, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            {borrowing.lenderName}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            {LENDER_TYPE_LABELS[borrowing.lenderType]} ·{" "}
            {describeInterest(borrowing)}
          </Text>
        </View>

        <View
          style={[styles.statusPill, { backgroundColor: statusColor + "22" }]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {BORROWING_STATUS_LABELS[summary.status]}
          </Text>
        </View>
      </View>

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
            {
              width: `${repaidRatio * 100}%`,
              backgroundColor: statusColor,
            },
          ]}
        />
      </View>

      <View style={styles.footerRow}>
        <View>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            OUTSTANDING
          </Text>
          <Amount
            value={summary.totalOutstanding}
            currency={currency}
            style={{
              fontSize: 15,
              fontWeight: "800",
              color: theme.colors.foreground,
            }}
          />
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            REPAID
          </Text>
          <Amount
            value={summary.totalPaid}
            currency={currency}
            style={{
              fontSize: 15,
              fontWeight: "800",
              color: theme.colors.mutedForeground,
            }}
          />
        </View>
      </View>

      {summary.interestAccrued > 0 ? (
        <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
          Includes accrued interest of {summary.outstandingInterest}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    borderCurve: "continuous",
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  lender: {
    fontSize: 14,
    fontWeight: "700",
  },
  meta: {
    fontSize: 11,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderCurve: "continuous",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  track: {
    height: 6,
    borderRadius: 3,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});

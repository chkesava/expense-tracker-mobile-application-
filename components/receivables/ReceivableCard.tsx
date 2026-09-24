import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ACCOUNT_GREEN } from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
import type { Receivable, ReceivableStatus } from "@/shared/types/receivable";
import {
  PERSON_TYPE_LABELS,
  RECEIVABLE_STATUS_LABELS,
} from "@/shared/types/receivable";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import {
  describeInterest,
  type ReceivableSummary,
} from "@/shared/utils/receivableMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const STATUS_COLORS: Record<ReceivableStatus, string> = {
  ACTIVE: "#3B82F6",
  PARTIALLY_SETTLED: "#F59E0B",
  FULLY_SETTLED: "#10B981",
  OVERDUE: "#EF4444",
  CANCELLED: "#6B7280",
};

export interface ReceivableCardProps {
  receivable: Receivable;
  summary: ReceivableSummary;
  currency?: string;
  onPress: () => void;
  onRecordRepayment: () => void;
}

export function ReceivableCard({
  receivable,
  summary,
  currency,
  onPress,
  onRecordRepayment,
}: ReceivableCardProps) {
  const { theme, themeName } = useTheme();
  const { settings } = useSettings();
  const isDark = themeUsesDarkPalette(themeName);

  const statusColor = STATUS_COLORS[summary.status];
  // Measured against principal plus accrued interest, or the bar would read
  // 100% while interest was still owed (SPENDLY-160).
  const collectable = summary.originalAmount + summary.interestAccrued;
  const receivedRatio =
    collectable > 0 ? Math.min(1, summary.totalReceived / collectable) : 0;
  // Nothing left to collect on a settled or cancelled receivable.
  const closed =
    summary.status === "FULLY_SETTLED" || summary.status === "CANCELLED";

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
      accessibilityLabel={`Money lent to ${receivable.personName}`}
    >
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <Text
            style={[styles.personName, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            {receivable.personName}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            {PERSON_TYPE_LABELS[receivable.personType]}
            {summary.interestAccrued > 0 ? ` · ${describeInterest(receivable)}` : ""}
            {receivable.purpose ? ` · ${receivable.purpose}` : ""}
          </Text>
        </View>

        <View
          style={[styles.statusPill, { backgroundColor: statusColor + "22" }]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {RECEIVABLE_STATUS_LABELS[summary.status]}
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
              width: `${receivedRatio * 100}%`,
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
            value={summary.outstandingAmount}
            currency={currency}
            style={{
              fontSize: 15,
              fontWeight: "800",
              color: theme.colors.foreground,
            }}
          />
        </View>

        <View style={{ alignItems: "center" }}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            ORIGINAL
          </Text>
          <Amount
            value={summary.originalAmount}
            currency={currency}
            style={{
              fontSize: 15,
              fontWeight: "800",
              color: theme.colors.mutedForeground,
            }}
          />
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            RECEIVED
          </Text>
          <Amount
            value={summary.totalReceived}
            currency={currency}
            style={{
              fontSize: 15,
              fontWeight: "800",
              color: "#10B981",
            }}
          />
        </View>
      </View>

      {receivable.dueDate ? (
        <Text style={[styles.dueDate, { color: theme.colors.mutedForeground }]}>
          {summary.isOverdue ? "Was due " : "Due "}
          {formatDisplayDate(receivable.dueDate, settings.dateFormat)}
        </Text>
      ) : null}

      {closed ? null : (
        <Pressable
          onPress={(event) => {
            // The card itself opens the detail view; don't do both.
            event.stopPropagation();
            void haptic.selection();
            onRecordRepayment();
          }}
          style={({ pressed }) => [
            styles.repayBtn,
            {
              borderColor: isDark ? ACCOUNT_GREEN : theme.colors.success,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Record repayment from ${receivable.personName}`}
        >
          <Text
            style={[
              styles.repayLabel,
              { color: isDark ? ACCOUNT_GREEN : theme.colors.success },
            ]}
          >
            Record Repayment
          </Text>
        </Pressable>
      )}
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
  dueDate: {
    fontSize: 12,
    fontWeight: "600",
  },
  repayBtn: {
    minHeight: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  repayLabel: {
    fontSize: 13,
    fontWeight: "800",
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
  personName: {
    fontSize: 16,
    fontWeight: "800",
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

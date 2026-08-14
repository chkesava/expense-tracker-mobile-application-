import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import type { Receivable, ReceivableStatus } from "@/shared/types/receivable";
import {
  PERSON_TYPE_LABELS,
  RECEIVABLE_STATUS_LABELS,
} from "@/shared/types/receivable";
import type { ReceivableSummary } from "@/shared/utils/receivableMath";
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
}

export function ReceivableCard({
  receivable,
  summary,
  currency,
  onPress,
}: ReceivableCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const statusColor = STATUS_COLORS[summary.status];
  const receivedRatio =
    summary.originalAmount > 0
      ? Math.min(1, summary.totalReceived / summary.originalAmount)
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

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import type { Space } from "@/shared/types/space";
import { SPACE_COLORS } from "@/shared/types/space";
import type { SpaceSummary } from "@/shared/utils/spaceMath";
import { spaceBudgetLeftText, spaceBudgetPresentation } from "@/shared/utils/vaultSpacePresentation";
import { useTheme } from "@/theme/ThemeProvider";

export interface SpaceCardProps {
  space: Space;
  summary: SpaceSummary;
  currency?: string;
  onPress: () => void;
}

/**
 * One space in the list. SPENDLY-549: theme tokens, ghost-aware amounts, and
 * a budget bar whose state is a word as well as a colour. The accent bar is
 * the space's own stored colour.
 */
export function SpaceCard({ space, summary, currency, onPress }: SpaceCardProps) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency ?? "INR");

  const accent = space.color ?? SPACE_COLORS[0];
  const budget = spaceBudgetPresentation(summary.tier);

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
      accessibilityLabel={`Space ${space.name}`}
    >
      <View style={styles.topRow}>
        <View style={[styles.accent, { backgroundColor: accent }]} />

        <View style={styles.identity}>
          <Text
            style={[styles.name, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            {space.name}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            {summary.expenseCount} expense
            {summary.expenseCount === 1 ? "" : "s"}
            {space.status === "ARCHIVED" ? " · Archived" : ""}
          </Text>
        </View>

        <FinancialAmount value={summary.totalSpent} currency={currency ?? "INR"} size="md" weight="bold" />
      </View>

      {summary.hasBudget ? (
        <ProgressIndicator
          pct={summary.percentUsed}
          status={budget.status}
          statusLabel={`${budget.label} · ${spaceBudgetLeftText(summary.budgetRemaining, money)}`}
          trailing={`${summary.percentUsed}% used`}
          accessibilityLabel={`${space.name}: ${summary.percentUsed} percent of budget used, ${budget.label}`}
        />
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
    alignItems: "center",
    gap: 12,
  },
  accent: {
    width: 6,
    height: 34,
    borderRadius: 3,
    borderCurve: "continuous",
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: "800",
  },
  meta: {
    fontSize: 11,
  },
});

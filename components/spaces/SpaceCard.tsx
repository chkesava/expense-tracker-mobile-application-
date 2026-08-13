import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import type { Space } from "@/shared/types/space";
import { SPACE_COLORS } from "@/shared/types/space";
import type { BudgetProgressTier, SpaceSummary } from "@/shared/utils/spaceMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const TIER_COLORS: Record<BudgetProgressTier, string> = {
  none: "#6B7280",
  safe: "#10B981",
  warning: "#F59E0B",
  danger: "#F97316",
  over: "#EF4444",
};

export interface SpaceCardProps {
  space: Space;
  summary: SpaceSummary;
  currency?: string;
  onPress: () => void;
}

export function SpaceCard({ space, summary, currency, onPress }: SpaceCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const accent = space.color ?? SPACE_COLORS[0];
  const tierColor = TIER_COLORS[summary.tier];
  const progress = summary.hasBudget
    ? Math.min(1, summary.percentUsed / 100)
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

        <Amount
          value={summary.totalSpent}
          currency={currency}
          style={{
            fontSize: 17,
            fontWeight: "900",
            color: theme.colors.foreground,
          }}
        />
      </View>

      {summary.hasBudget ? (
        <>
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
                { width: `${progress * 100}%`, backgroundColor: tierColor },
              ]}
            />
          </View>

          <View style={styles.footerRow}>
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              {summary.percentUsed}% of budget used
            </Text>
            <Text style={[styles.remaining, { color: tierColor }]}>
              {summary.budgetRemaining >= 0
                ? `${summary.budgetRemaining} left`
                : `${Math.abs(summary.budgetRemaining)} over`}
            </Text>
          </View>
        </>
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
    alignItems: "center",
    justifyContent: "space-between",
  },
  remaining: {
    fontSize: 11,
    fontWeight: "800",
  },
});

import { Pressable, StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import {
  accountAccent,
  ACCOUNT_RED,
} from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { formatActivityDateLabel } from "@/shared/utils/activityDisplay";
import {
  UNCATEGORIZED,
  type AccountSpendingInsights,
  type PeriodComparison,
} from "@/shared/utils/accountSpendingInsights";

function comparisonLabel(comparison: PeriodComparison, window: number): string {
  if (comparison.previous === 0) {
    return comparison.current === 0
      ? `Nothing in the last ${window} months`
      : `No comparable spend in the previous ${window} months`;
  }
  const percent = Math.abs(Math.round((comparison.changeRatio ?? 0) * 100));
  if (comparison.delta === 0) return `Level with the previous ${window} months`;
  return `${percent}% ${comparison.delta > 0 ? "more" : "less"} than the previous ${window} months`;
}

/**
 * Account-specific spending insights. Every figure comes from
 * `computeAccountSpendingInsights()`; this component only presents them.
 */
export function SpendingInsightsCard({
  insights,
  currency,
  selectedCategory,
  onSelectCategory,
}: {
  insights: AccountSpendingInsights;
  currency: string;
  /** The category the transaction list is currently filtered to, if any. */
  selectedCategory?: string;
  onSelectCategory: (category: string) => void;
}) {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const hasSpend = insights.totalSpend > 0;

  const sectionTitle = (text: string) => (
    <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
      {text}
    </Text>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            {
              color: theme.colors.foreground,
              fontFamily: theme.fontFamily.semibold,
            },
          ]}
        >
          Spending insights
        </Text>
        <Amount
          value={insights.totalSpend}
          currency={currency}
          ghostable
          style={[styles.total, { color: theme.colors.foreground }]}
        />
      </View>

      <Text style={[styles.comparison, { color: theme.colors.mutedForeground }]}>
        {comparisonLabel(insights.spendComparison, insights.window)}
      </Text>

      {hasSpend ? (
        <View style={styles.section}>
          {sectionTitle("By category")}
          {insights.categories.map((entry) => {
            const selected = entry.category === selectedCategory;
            // The transaction filter matches a real category value, so the
            // catch-all bucket has nothing to filter by and stays inert
            // rather than filtering the list down to nothing.
            const filterable = entry.category !== UNCATEGORIZED;
            return (
              <Pressable
                key={entry.category}
                onPress={() => {
                  if (!filterable) return;
                  void haptic.selection();
                  onSelectCategory(entry.category);
                }}
                disabled={!filterable}
                accessibilityRole={filterable ? "button" : "text"}
                accessibilityState={{ selected }}
                accessibilityLabel={
                  filterable
                    ? selected
                      ? `Clear the ${entry.category} filter`
                      : `Show only ${entry.category} transactions`
                    : entry.category
                }
                style={styles.categoryRow}
              >
                <View style={styles.categoryHeader}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.categoryName,
                      { color: selected ? accent : theme.colors.foreground },
                    ]}
                  >
                    {entry.category}
                  </Text>
                  <Amount
                    value={entry.amount}
                    currency={currency}
                    ghostable
                    style={[styles.categoryAmount, { color: theme.colors.foreground }]}
                  />
                </View>
                <View
                  style={[
                    styles.track,
                    {
                      backgroundColor: surfaces.control,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.max(2, Math.round(entry.share * 100))}%`,
                        backgroundColor: selected ? accent : ACCOUNT_RED,
                      },
                    ]}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          No spending in the last {insights.window} months.
        </Text>
      )}

      {insights.largestExpense ? (
        <View style={styles.section}>
          {sectionTitle("Largest expense")}
          <View style={styles.line}>
            <Text
              numberOfLines={1}
              style={[styles.lineLabel, { color: theme.colors.foreground }]}
            >
              {insights.largestExpense.title}
            </Text>
            <Amount
              value={insights.largestExpense.amount}
              currency={currency}
              ghostable
              style={[styles.lineValue, { color: theme.colors.foreground }]}
            />
          </View>
          <Text style={[styles.lineCaption, { color: theme.colors.mutedForeground }]}>
            {insights.largestExpense.category} ·{" "}
            {formatActivityDateLabel(insights.largestExpense.date)}
          </Text>
        </View>
      ) : null}

      {insights.topCounterparties.length > 0 ? (
        <View style={styles.section}>
          {sectionTitle("Top payees")}
          {insights.topCounterparties.map((entry) => (
            <View key={entry.name} style={styles.line}>
              <Text
                numberOfLines={1}
                style={[styles.lineLabel, { color: theme.colors.foreground }]}
              >
                {entry.name}
              </Text>
              <Amount
                value={entry.amount}
                currency={currency}
                ghostable
                style={[styles.lineValue, { color: theme.colors.foreground }]}
              />
            </View>
          ))}
        </View>
      ) : null}

      {insights.incomeSources.length > 0 ? (
        <View style={styles.section}>
          {sectionTitle("Income sources")}
          {insights.incomeSources.map((entry) => (
            <View key={entry.name} style={styles.line}>
              <Text
                numberOfLines={1}
                style={[styles.lineLabel, { color: theme.colors.foreground }]}
              >
                {entry.name}
              </Text>
              <Amount
                value={entry.amount}
                currency={currency}
                ghostable
                style={[styles.lineValue, { color: accent }]}
              />
            </View>
          ))}
        </View>
      ) : null}

      {insights.refundsTotal > 0 ? (
        <Text style={[styles.footnote, { color: theme.colors.mutedForeground }]}>
          Refunds and cashback are counted separately and are not included in
          income.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 15,
  },
  total: {
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  comparison: {
    fontSize: 12,
    marginTop: -6,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  categoryRow: {
    gap: 5,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  categoryName: {
    fontSize: 13,
    flexShrink: 1,
  },
  categoryAmount: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  lineLabel: {
    fontSize: 13,
    flexShrink: 1,
  },
  lineValue: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  lineCaption: {
    fontSize: 11,
    marginTop: -4,
  },
  empty: {
    fontSize: 12,
  },
  footnote: {
    fontSize: 11,
  },
});

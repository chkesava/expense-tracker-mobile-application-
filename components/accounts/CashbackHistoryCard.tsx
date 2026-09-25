import { StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, Gift } from "lucide-react-native";
import { useState } from "react";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import type { CashbackHistoryEntry, CashbackSummary } from "@/shared/utils/cashbackHistory";
import { useTheme } from "@/theme/ThemeProvider";

export function CashbackHistoryCard({
  summary,
  currency,
}: {
  summary: CashbackSummary;
  currency: string;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const hasEntries = summary.entries.length > 0;
  const displayEntries = expanded ? summary.entries : summary.entries.slice(0, 5);
  const hasMore = summary.entries.length > 5;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text
          style={[styles.heading, { color: theme.colors.mutedForeground }]}
          accessibilityRole="header"
        >
          CASHBACK & REWARDS
        </Text>
        {hasEntries && (
          <Text style={[styles.totalLabel, { color: theme.colors.foreground }]}>
            Total: <Amount value={summary.totalReceived} currency={currency} />
          </Text>
        )}
      </View>

      {!hasEntries ? (
        <View
          style={[
            styles.empty,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.emptyTitle, { color: theme.colors.foreground }]}>
            No cashback recorded yet
          </Text>
          <Text style={[styles.emptyBody, { color: theme.colors.mutedForeground }]}>
            When you receive statement credits or rewards, record them to adjust your balance.
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {displayEntries.map((entry, index) => (
            <View
              key={entry.id}
              style={[
                styles.row,
                index < displayEntries.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.iconContainer}>
                <Gift size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.details}>
                <View style={styles.titleRow}>
                  <Text
                    style={[
                      styles.title,
                      { color: theme.colors.foreground },
                      entry.isVoided && styles.strikethrough,
                    ]}
                  >
                    {entry.kind === "statement_credit" ? "Statement Credit" : "Reward"}
                  </Text>
                  <Amount
                    value={entry.amount}
                    currency={currency}
                    style={[
                      styles.amount,
                      { color: theme.colors.foreground },
                      entry.isVoided && styles.strikethrough,
                    ]}
                  />
                </View>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaText, { color: theme.colors.mutedForeground }]}>
                    {entry.date}
                  </Text>
                  {entry.isVoided ? (
                    <View style={styles.badge}>
                      <Text style={[styles.badgeText, { color: theme.colors.destructive }]}>
                        Voided
                      </Text>
                    </View>
                  ) : entry.linkedExpenseNote ? (
                    <Text
                      style={[styles.metaText, { color: theme.colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {" • "}
                      Against {entry.linkedExpenseNote}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              onPress={() => setExpanded(!expanded)}
              style={styles.expandButton}
            >
              <Text style={[styles.expandText, { color: theme.colors.primary }]}>
                {expanded ? "Show less" : `Show all (${summary.entries.length})`}
              </Text>
              {expanded ? (
                <ChevronUp size={16} color={theme.colors.primary} />
              ) : (
                <ChevronDown size={16} color={theme.colors.primary} />
              )}
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heading: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  empty: {
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 18,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyBody: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
  card: {
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    padding: 16,
    alignItems: "center",
    gap: 14,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(148, 163, 184, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  details: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  amount: {
    fontSize: 16,
    fontWeight: "700",
  },
  strikethrough: {
    textDecorationLine: "line-through",
    opacity: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 13,
    fontWeight: "500",
  },
  badge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 4,
  },
  expandText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

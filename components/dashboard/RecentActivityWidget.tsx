import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ChevronRight, History } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/Card";
import type { Expense } from "@/shared/types/expense";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface RecentActivityWidgetProps {
  expenses: Expense[];
  currency: string;
  onEditExpense: (expense: Expense) => void;
  onViewAll: () => void;
}

export function RecentActivityWidget({
  expenses,
  currency,
  onEditExpense,
  onViewAll,
}: RecentActivityWidgetProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const recentTransactions = expenses.slice(0, 5);

  return (
    <Card
      title="Recent Transactions"
      subtitle={`${expenses.length} total recorded`}
      headerRight={
        expenses.length > 5 ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onViewAll();
            }}
            style={styles.viewAllBtn}
          >
            <Text
              style={[
                styles.viewAllText,
                { color: theme.colors.primary, fontSize: theme.typography.xs },
              ]}
            >
              View All
            </Text>
            <ChevronRight size={14} color={theme.colors.primary} />
          </Pressable>
        ) : undefined
      }
    >
      {recentTransactions.length === 0 ? (
        <EmptyState
          icon={<History size={32} color={theme.colors.mutedForeground} />}
          title="No Transactions"
          description="Your logged expenses will appear here in realtime."
        />
      ) : (
        <View style={styles.transactionsList}>
          {recentTransactions.map((item, index) => (
            <Pressable
              key={item.id || `tx-${index}`}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                onEditExpense(item);
              }}
              style={({ pressed }) => [
                styles.transactionRow,
                index < recentTransactions.length - 1 && {
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={styles.txLeft}>
                <View
                  style={[
                    styles.categoryDot,
                    {
                      backgroundColor: isDark
                        ? "rgba(107, 99, 255, 0.2)"
                        : "rgba(79, 70, 255, 0.12)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryDotText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    {item.category?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <View style={styles.txMeta}>
                  <Text
                    style={[
                      styles.txTitle,
                      { color: theme.colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {item.note || item.category || "Expense"}
                  </Text>
                  <Text
                    style={[
                      styles.txSubtitle,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    {item.date} • {item.category}
                  </Text>
                </View>
              </View>

              <Amount
                value={item.amount}
                currency={currency}
                ghostable
                style={{
                  color: theme.colors.foreground,
                  fontWeight: "700",
                  fontSize: theme.typography.md,
                }}
              />
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAllText: {
    fontWeight: "700",
  },
  transactionsList: {
    gap: 2,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  txLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  categoryDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryDotText: {
    fontSize: 14,
    fontWeight: "800",
  },
  txMeta: {
    flex: 1,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  txSubtitle: {
    fontSize: 11,
  },
});

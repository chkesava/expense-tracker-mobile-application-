import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Receipt } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import {
  DataRow,
  RowGlyph,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import type { Expense } from "@/shared/types/expense";
import { useTheme } from "@/theme/ThemeProvider";

export interface RecentActivityWidgetProps {
  expenses: Expense[];
  currency: string;
  loading?: boolean;
  onEditExpense: (expense: Expense) => void;
  onViewAll: () => void;
}

const PREVIEW_LIMIT = 5;

export const RecentActivityWidget = memo(function RecentActivityWidget({
  expenses,
  currency,
  loading = false,
  onEditExpense,
  onViewAll,
}: RecentActivityWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const recentTransactions = expenses.slice(0, PREVIEW_LIMIT);
  const hasMore = expenses.length > PREVIEW_LIMIT;

  return (
    <Section
      title="Recent Transactions"
      subtitle={
        loading && expenses.length === 0
          ? "Loading transactions..."
          : `${expenses.length} total recorded`
      }
      icon={<Receipt size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={hasMore ? <SectionAction label="View all" onPress={onViewAll} /> : null}
      footer={
        hasMore ? (
          <View style={styles.seeAll}>
            <SectionAction label="See all transactions" onPress={onViewAll} />
          </View>
        ) : null
      }
    >
      {loading && recentTransactions.length === 0 ? (
        <View style={{ gap: 14, paddingVertical: 8 }}>
          {[1, 2, 3].map((key) => (
            <View
              key={key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Skeleton width={34} height={34} borderRadius={10} />
                <View style={{ gap: 6 }}>
                  <Skeleton width={120} height={14} borderRadius={4} />
                  <Skeleton width={70} height={10} borderRadius={3} />
                </View>
              </View>
              <Skeleton width={60} height={16} borderRadius={4} />
            </View>
          ))}
        </View>
      ) : recentTransactions.length === 0 ? (
        <EmptyState
          illustration="expenses"
          compact
          title="No Recent Transactions"
          description="Add your first expense or income to see live activity here."
          tip="Tap the bottom '+' button to quickly log your first transaction."
        />
      ) : (
        <View>
          {recentTransactions.map((item, index) => (
            <DataRow
              key={item.id || `tx-${index}`}
              onPress={() => onEditExpense(item)}
              divider={index < recentTransactions.length - 1}
              leading={
                <RowGlyph size={34} tint={surfaces.tile}>
                  <Text
                    style={[
                      styles.initial,
                      {
                        color: theme.colors.mutedForeground,
                        fontFamily: theme.fontFamily.semibold,
                      },
                    ]}
                  >
                    {item.category?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </RowGlyph>
              }
              title={item.note || item.category || "Expense"}
              meta={[item.date, item.category].filter(Boolean).join(" · ")}
              value={
                <Amount
                  value={item.amount}
                  currency={currency}
                  ghostable
                  style={{
                    fontSize: 14.5,
                    fontFamily: theme.fontFamily.semibold,
                    color: theme.colors.foreground,
                  }}
                />
              }
              accessibilityLabel={`Edit ${item.note || item.category || "expense"}`}
            />
          ))}
        </View>
      )}
    </Section>
  );
});

const styles = StyleSheet.create({
  initial: {
    fontSize: 13,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 32,
  },
});

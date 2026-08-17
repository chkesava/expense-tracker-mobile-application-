import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Receipt } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import {
  DataRow,
  RowGlyph,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import type { Expense } from "@/shared/types/expense";
import { useTheme } from "@/theme/ThemeProvider";

export interface RecentActivityWidgetProps {
  expenses: Expense[];
  currency: string;
  onEditExpense: (expense: Expense) => void;
  onViewAll: () => void;
}

const PREVIEW_LIMIT = 5;

export function RecentActivityWidget({
  expenses,
  currency,
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
      subtitle={`${expenses.length} total recorded`}
      icon={<Receipt size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={hasMore ? <SectionAction label="View all" onPress={onViewAll} /> : null}
      footer={
        hasMore ? (
          <Pressable
            onPress={() => {
              void haptic.selection();
              onViewAll();
            }}
            style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="See all transactions"
          >
            <Text
              style={[
                styles.seeAllText,
                {
                  color: theme.colors.primary,
                  fontFamily: theme.fontFamily.semibold,
                },
              ]}
            >
              See all transactions
            </Text>
            <ChevronRight size={14} color={theme.colors.primary} strokeWidth={2.4} />
          </Pressable>
        ) : null
      }
    >
      {recentTransactions.length === 0 ? (
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
}

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
  seeAllText: {
    fontSize: 13,
  },
});

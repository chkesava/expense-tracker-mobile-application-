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
import { useSettings } from "@/providers/SettingsProvider";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import type { Expense } from "@/shared/types/expense";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { signedCurrencyPrefix } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

export interface RecentActivityWidgetProps {
  expenses: Expense[];
  currency: string;
  loading?: boolean;
  /** Account id → display name, from the accounts the screen already holds. */
  accountNames?: ReadonlyMap<string, string>;
  onEditExpense: (expense: Expense) => void;
  onViewAll: () => void;
}

const PREVIEW_LIMIT = 5;

export const RecentActivityWidget = memo(function RecentActivityWidget({
  expenses,
  currency,
  loading = false,
  accountNames,
  onEditExpense,
  onViewAll,
}: RecentActivityWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();

  const recentTransactions = expenses.slice(0, PREVIEW_LIMIT);
  // The feed is a limit-N query, so its length can't tell whether older rows
  // exist; the full ledger is always one tap away once there is any activity.
  const canViewAll = recentTransactions.length > 0;

  return (
    <Section
      title="Recent activity"
      subtitle={
        loading && expenses.length === 0
          ? "Loading transactions..."
          // SPENDLY-413: `expenses.length` is the staged recent-first page
          // count (SPENDLY-409), not the lifetime total — don't assert one.
          : "Latest activity"
      }
      icon={<Receipt size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={
        canViewAll ? (
          <SectionAction
            label="View all"
            onPress={onViewAll}
            accessibilityLabel="View all transactions"
          />
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
          {recentTransactions.map((item, index) => {
            const title = item.note || item.category || "Expense";
            const accountName = item.accountId ? accountNames?.get(item.accountId) : undefined;
            const meta = [
              item.date ? formatDisplayDate(item.date, settings.dateFormat) : null,
              accountName,
              item.note ? item.category : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <DataRow
                key={item.id || `tx-${index}`}
                onPress={() => onEditExpense(item)}
                divider={index < recentTransactions.length - 1}
                leading={
                  <RowGlyph size={38} tint={surfaces.tile}>
                    <Text style={styles.glyph} accessible={false}>
                      {item.category ? getCategoryIcon(item.category) : "📦"}
                    </Text>
                  </RowGlyph>
                }
                title={title}
                meta={meta}
                value={
                  <Amount
                    value={item.amount}
                    currency={currency}
                    prefix={signedCurrencyPrefix("-", currency)}
                    ghostable
                    numberOfLines={1}
                    style={{
                      fontSize: 14.5,
                      fontFamily: theme.fontFamily.semibold,
                      color: theme.colors.foreground,
                    }}
                  />
                }
                accessibilityLabel={`Edit ${title}`}
              />
            );
          })}
        </View>
      )}
    </Section>
  );
});

const styles = StyleSheet.create({
  glyph: {
    fontSize: 17,
  },
});

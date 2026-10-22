import { memo, useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { ArrowDownLeft } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { MerchantMonogramTile } from "@/components/dashboard/MerchantMonogramTile";
import {
  DataRow,
  RowGlyph,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { useMerchantOverridesOnce } from "@/hooks/useMerchantOverridesOnce";
import { useSettings } from "@/providers/SettingsProvider";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import type { Expense, Income } from "@/shared/types/expense";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { merchantMonogram, type MerchantMonogram } from "@/shared/utils/merchantMonogram";
import { expenseSourceText, incomeSourceText } from "@/shared/utils/merchantModel";
import { resolveMerchants } from "@/shared/utils/merchantResolve";
import type { RecentActivityItem } from "@/shared/utils/recentActivity";
import { useTheme } from "@/theme/ThemeProvider";

export interface RecentActivityWidgetProps {
  /** Newest-first expenses and incomes from `mergeRecentActivity`. */
  items: RecentActivityItem[];
  currency: string;
  loading?: boolean;
  /** Account id → display name, from the accounts the screen already holds. */
  accountNames?: ReadonlyMap<string, string>;
  onEditExpense: (expense: Expense) => void;
  onEditIncome: (income: Income) => void;
  onViewAll: () => void;
}

/**
 * Recent activity (SPENDLY-532/533): money out and money in together. Income
 * rows carry a "+" and an "Income" caption, expenses a "-", so the direction
 * never depends on colour alone.
 */
export const RecentActivityWidget = memo(function RecentActivityWidget({
  items,
  currency,
  loading = false,
  accountNames,
  onEditExpense,
  onEditIncome,
  onViewAll,
}: RecentActivityWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();

  // SPENDLY-570: a monogram tile for merchants the resolver is sure of (or the
  // user named); everything else keeps its category glyph. Derived only — no
  // merchant is written anywhere.
  const overrides = useMerchantOverridesOnce(items.length > 0);
  const monograms = useMemo(() => {
    const sources = items.map((item) =>
      item.kind === "income"
        ? incomeSourceText({ ...item.row, id: item.row.id ?? item.key })
        : expenseSourceText({ ...item.row, id: item.row.id ?? item.key })
    );
    const resolutions = resolveMerchants(sources, overrides);
    return new Map<string, MerchantMonogram | null>(
      items.map((item, i) => [item.key, merchantMonogram(resolutions[i])])
    );
  }, [items, overrides]);

  if (loading && items.length === 0) {
    return <DashboardSkeleton variant="section" rows={3} />;
  }

  return (
    <Section
      // SPENDLY-566: Visual First header. SPENDLY-413 still holds: the feed is
      // a recent-first page, not the lifetime ledger, so nothing asserts a count.
      title="Recent Transactions"
      action={
        // A limit-N feed can't tell whether older rows exist; the full ledger
        // is always one tap away once there is any activity.
        items.length > 0 ? (
          <SectionAction
            label="See all"
            onPress={onViewAll}
            accessibilityLabel="View all transactions"
          />
        ) : null
      }
    >
      {items.length === 0 ? (
        <EmptyState
          illustration="expenses"
          compact
          title="No recent activity"
          description="Add an expense or income and it shows up here."
          tip="Tap the '+' button to log your first transaction."
        />
      ) : (
        items.map((item, index) => {
          const isIncome = item.kind === "income";
          const title = isIncome
            ? item.row.note || item.row.source || "Income"
            : item.row.note || item.row.category || "Expense";
          const accountName = item.row.accountId ? accountNames?.get(item.row.accountId) : undefined;
          const meta = [
            item.date ? formatDisplayDate(item.date, settings.dateFormat) : null,
            accountName,
            isIncome
              ? item.row.note
                ? item.row.source || "Income"
                : "Income"
              : item.row.note
                ? item.row.category
                : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <DataRow
              key={item.key}
              onPress={() => (item.kind === "income" ? onEditIncome(item.row) : onEditExpense(item.row))}
              divider={index < items.length - 1}
              leading={
                monograms.get(item.key) ? (
                  <MerchantMonogramTile monogram={monograms.get(item.key) as MerchantMonogram} />
                ) : (
                <RowGlyph size={38} tint={isIncome ? surfaces.wash(theme.colors.success) : surfaces.tile}>
                  {isIncome ? (
                    <ArrowDownLeft size={17} color={theme.colors.success} strokeWidth={2.4} />
                  ) : (
                    <Text style={styles.glyph} accessible={false}>
                      {item.row.category ? getCategoryIcon(item.row.category) : "📦"}
                    </Text>
                  )}
                </RowGlyph>
                )
              }
              title={title}
              meta={meta}
              value={
                <FinancialAmount
                  value={item.row.amount}
                  currency={currency}
                  size="sm"
                  sign={isIncome ? "plus" : "minus"}
                  tone={isIncome ? "positive" : "negative"}
                  fit={false}
                />
              }
              accessibilityLabel={`Edit ${isIncome ? "income" : "expense"} ${title}`}
            />
          );
        })
      )}
    </Section>
  );
});

const styles = StyleSheet.create({
  glyph: {
    fontSize: 17,
  },
});

import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { MerchantMonogramTile } from "@/components/dashboard/MerchantMonogramTile";
import {
  Section,
  SectionAction,
  useSurfaces,
  withAlpha,
} from "@/components/dashboard/primitives";
import { useMerchantOverridesOnce } from "@/hooks/useMerchantOverridesOnce";
import { useSettings } from "@/providers/SettingsProvider";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import type { Expense, Income } from "@/shared/types/expense";
import { shortRowDate } from "@/shared/utils/dashboardLabels";
import { todayDateKey } from "@/shared/utils/dates";
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
  const todayKey = todayDateKey(settings.timezone);

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
        <View style={styles.list}>
          {items.map((item) => {
            const isIncome = item.kind === "income";
            const title = isIncome
              ? item.row.note || item.row.source || "Income"
              : item.row.note || item.row.category || "Expense";
            // SPENDLY-572: one short line under the title, as in the reference.
            const subtitle = isIncome
              ? item.row.note
                ? item.row.source || "Income"
                : "Income"
              : item.row.note
                ? item.row.category || ""
                : item.row.subcategory || "";
            const accountName = item.row.accountId ? accountNames?.get(item.row.accountId) : undefined;
            const monogram = monograms.get(item.key);
            const dateLabel = shortRowDate(item.date, todayKey);

            return (
              <Pressable
                key={item.key}
                onPress={() => (item.kind === "income" ? onEditIncome(item.row) : onEditExpense(item.row))}
                android_ripple={{ color: surfaces.control, borderless: false }}
                style={({ pressed }) => [
                  styles.tile,
                  { backgroundColor: surfaces.tile, borderColor: withAlpha(theme.colors.foreground, 0.06) },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${isIncome ? "income" : "expense"} ${title}${accountName ? `, ${accountName}` : ""}${dateLabel ? `, ${dateLabel}` : ""}`}
              >
                {monogram ? (
                  <MerchantMonogramTile monogram={monogram} size={44} />
                ) : (
                  <View
                    style={[
                      styles.glyphTile,
                      { backgroundColor: isIncome ? surfaces.wash(theme.colors.success) : withAlpha(theme.colors.foreground, 0.06) },
                    ]}
                  >
                    {isIncome ? (
                      <ArrowDownLeft size={20} color={theme.colors.success} strokeWidth={2.4} />
                    ) : (
                      <Text style={styles.glyph} accessible={false}>
                        {item.row.category ? getCategoryIcon(item.row.category) : "📦"}
                      </Text>
                    )}
                  </View>
                )}
                <View style={styles.textCol}>
                  <Text
                    style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text
                      style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
                      numberOfLines={1}
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.valueCol}>
                  <FinancialAmount
                    value={item.row.amount}
                    currency={currency}
                    size="sm"
                    sign={isIncome ? "plus" : "minus"}
                    tone={isIncome ? "positive" : "negative"}
                    fit={false}
                  />
                  {dateLabel ? (
                    <Text style={[styles.date, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                      {dateLabel}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Section>
  );
});

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.85,
  },
  glyphTile: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    fontSize: 20,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
  },
  subtitle: {
    fontSize: 13,
  },
  valueCol: {
    alignItems: "flex-end",
    gap: 2,
  },
  date: {
    fontSize: 12.5,
  },
});

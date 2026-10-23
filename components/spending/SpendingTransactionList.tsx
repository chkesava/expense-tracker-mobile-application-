import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ArrowUpDown } from "lucide-react-native";

import { ReadModelFreshnessBadge } from "@/components/common/ReadModelFreshnessBadge";
import { useJournalFreshness } from "@/hooks/useReadModelFreshness";
import { EmptyState } from "@/components/common/EmptyState";
import { SearchBar } from "@/components/common/SearchBar";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { DataRow } from "@/components/dashboard/primitives";
import { CategoryIcon, DataNote, SurfaceCard } from "@/components/spending/SpendingParts";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useSettings } from "@/providers/SettingsProvider";
import type { Expense } from "@/shared/types/expense";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import {
  NO_SUBCATEGORY,
  TRANSACTION_SORTS,
  TRANSACTION_SORT_LABELS,
  filterSortExpenses,
  ledgerReconciles,
  transactionStats,
  type TransactionSort,
} from "@/shared/utils/spendingDrilldown";
import { transactionHref } from "@/shared/utils/transactionRef";
import { useTheme } from "@/theme/ThemeProvider";

/** Rows rendered per step; "Show more" adds another page. */
const PAGE_SIZE = 25;

/** A filter chip; `color` also tints the matching rows' icons. */
export type FilterOption = { value: string; label: string; color?: string };

/**
 * SPENDLY-574 — the drill-downs' transaction tab. `rows` are already the
 * month's eligible rows (and one category's, on a category page), so search,
 * filters and sort only ever narrow that set. Rows open the existing
 * transaction detail route.
 */
export function SpendingTransactionList({
  rows,
  loading,
  monthLoaded,
  summaryTotal,
  currency,
  filterLabel,
  filterOptions,
  filterKey,
  initialFilter = null,
  emptyTitle,
}: {
  rows: readonly Expense[];
  loading: boolean;
  monthLoaded: boolean;
  /** The summary's figure for the same scope, to reconcile the full list against. */
  summaryTotal: number;
  currency: string;
  /** Accessible name of the filter group ("Category", "Subcategory"). */
  filterLabel: string;
  filterOptions: readonly FilterOption[];
  /** Which row field the chips filter on. */
  filterKey: "category" | "subcategory";
  initialFilter?: string | null;
  emptyTitle: string;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const { settings } = useSettings();
  const money = useGhostMoney(currency);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(initialFilter);
  const [sort, setSort] = useState<TransactionSort>("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const freshness = useJournalFreshness();

  const filtered = useMemo(
    () => filterSortExpenses(rows, { query, sort, [filterKey]: filter }),
    [rows, query, sort, filter, filterKey]
  );
  const shown = filtered.slice(0, visible);
  const colorByValue = useMemo(
    () => new Map(filterOptions.filter((o) => o.color).map((o) => [o.value, o.color as string])),
    [filterOptions]
  );
  const narrowed = Boolean(query.trim() || filter);
  const fullTotal = useMemo(() => transactionStats(rows).total, [rows]);
  const filteredTotal = useMemo(() => transactionStats(filtered).total, [filtered]);

  const cycleSort = () => {
    const next = TRANSACTION_SORTS[(TRANSACTION_SORTS.indexOf(sort) + 1) % TRANSACTION_SORTS.length];
    setSort(next);
  };
  const pickFilter = (value: string | null) => {
    setFilter(value);
    setVisible(PAGE_SIZE);
  };

  if (loading) {
    return <DashboardSkeleton variant="section" rows={5} />;
  }

  return (
    <View style={styles.wrap}>
      <ReadModelFreshnessBadge freshness={freshness} />
      <SearchBar
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setVisible(PAGE_SIZE);
        }}
        placeholder="Search by note, subcategory or tag"
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="Search these transactions"
      />

      {filterOptions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityLabel={`${filterLabel} filter`}
        >
          <Chip label="All" selected={filter === null} appearance="outline" accessibilityRole="radio" onPress={() => pickFilter(null)} />
          {filterOptions.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={filter === option.value}
              appearance="outline"
              accessibilityRole="radio"
              onPress={() => pickFilter(filter === option.value ? null : option.value)}
            />
          ))}
        </ScrollView>
      ) : null}

      {!monthLoaded ? (
        <DataNote>Still loading this month's older transactions — the list may be incomplete.</DataNote>
      ) : !ledgerReconciles(fullTotal, summaryTotal) ? (
        <DataNote>
          {`These transactions add up to ${money(fullTotal)}, while the month's summary shows ${money(summaryTotal)}. The summary is catching up with a recent change.`}
        </DataNote>
      ) : null}

      <SurfaceCard
        title={narrowed ? `${filtered.length} of ${rows.length} · ${money(filteredTotal)}` : `${filtered.length} transactions`}
        action={
          <Chip
            label={TRANSACTION_SORT_LABELS[sort]}
            appearance="tonal"
            size="sm"
            icon={(color) => <ArrowUpDown size={13} color={color} />}
            onPress={cycleSort}
            accessibilityLabel={`Sort: ${TRANSACTION_SORT_LABELS[sort]}. Tap to change`}
          />
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            illustration="search"
            compact
            title={narrowed ? "No matching transactions" : emptyTitle}
            description={narrowed ? "Try another search or clear the filter." : undefined}
          />
        ) : (
          <>
            {shown.map((row, index) => {
              const title = row.note?.trim() || row.subcategory || row.category;
              const where =
                filterKey === "category"
                  ? row.subcategory
                    ? `${row.category} · ${row.subcategory}`
                    : row.category
                  : row.subcategory || "No subcategory";
              const date = formatDisplayDate(row.date, settings?.dateFormat);
              const meta = `${where} · ${date}`;
              const tint =
                colorByValue.get(row[filterKey] || (filterKey === "subcategory" ? NO_SUBCATEGORY : "")) ?? theme.colors.primary;
              return (
                <DataRow
                  key={row.id ?? `${row.date}-${index}`}
                  leading={<CategoryIcon category={row.category} color={tint} size={38} />}
                  title={title}
                  meta={where}
                  value={<FinancialAmount value={row.amount} currency={currency} size="sm" sign="minus" weight="semibold" />}
                  valueMeta={
                    <Text style={[styles.date, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                      {date}
                    </Text>
                  }
                  divider={index < shown.length - 1}
                  onPress={
                    row.id
                      ? () => router.push(transactionHref({ kind: "expense", id: row.id! }, row.accountId) as Href)
                      : undefined
                  }
                  accessibilityLabel={`${title}, ${meta}, spent ${money(row.amount)}`}
                />
              );
            })}
            {filtered.length > shown.length ? (
              <Button variant="outline" onPress={() => setVisible((v) => v + PAGE_SIZE)} style={styles.more}>
                {`Show more (${filtered.length - shown.length} left)`}
              </Button>
            ) : null}
          </>
        )}
      </SurfaceCard>
      <Text style={[styles.footnote, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
        Expenses only — refunds and transfers aren't counted as spending.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  date: { fontSize: 12, marginTop: 2, textAlign: "right" },
  chips: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  more: { marginTop: 12 },
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
});

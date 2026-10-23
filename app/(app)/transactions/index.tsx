import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ArrowLeftRight, ArrowUpDown, ChevronRight, Receipt, SlidersHorizontal } from "lucide-react-native";

import { ReadModelFreshnessBadge } from "@/components/common/ReadModelFreshnessBadge";
import { useJournalFreshness } from "@/hooks/useReadModelFreshness";
import { AccountActivityFilterModal } from "@/components/accounts/AccountActivityFilterModal";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { SearchBar } from "@/components/common/SearchBar";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { PageShell } from "@/components/layout/PageShell";
import {
  CategoryIcon,
  DataNote,
  DrilldownTabs,
  DrilldownTopBar,
  SurfaceCard,
} from "@/components/spending/SpendingParts";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useIncomes } from "@/hooks/useIncomes";
import { haptic } from "@/lib/haptics";
import { useGlobalMonth } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { activityTitle } from "@/shared/utils/activityDisplay";
import {
  createEmptyAccountActivityFilters,
  type AccountActivityFilters,
} from "@/shared/utils/accountActivityFilters";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { currentMonthKey, todayDateKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import { resolveSpendingMonth, resolveSpendingTab } from "@/shared/utils/spendingDrilldown";
import {
  TRANSACTIONS_SORTS,
  TRANSACTIONS_SORT_LABELS,
  TRANSACTIONS_TABS,
  buildTransactionsFeed,
  feedRowHref,
  groupFeedByDay,
  monthsInScope,
  relativeDayLabel,
  type FeedRow,
  type TransactionsSort,
  type TransactionsTab,
} from "@/shared/utils/transactionsFeed";
import { useTheme } from "@/theme/ThemeProvider";

/** Rows rendered per step; "Show more" adds another page. */
const PAGE_SIZE = 40;

/**
 * SPENDLY-576 — every transaction for a period, opened from the dashboard's
 * Recent Transactions "See all". Rows, search, filters and totals come from
 * the Journal's own pipeline (`buildTransactionsFeed`), over the expenses,
 * incomes and transfers the app already holds; each row opens the existing
 * `/transactions/[id]` detail. Month and tab live in the route; search,
 * filters and sort stay in this screen, which stays mounted under the detail,
 * so they are still there on the way back.
 */
export default function TransactionsScreen() {
  const params = useLocalSearchParams<{ month?: string; tab?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const { globalMonth } = useGlobalMonth();
  const currency = useDisplayCurrency();

  const thisMonth = currentMonthKey(settings.timezone);
  const month = resolveSpendingMonth(params.month, globalMonth || thisMonth);
  const tab = resolveSpendingTab(params.tab, TRANSACTIONS_TABS, "all");

  const expensesStore = useExpenses();
  const freshness = useJournalFreshness();
  const incomesStore = useIncomes();
  const { transfers } = useAccountTransfers();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AccountActivityFilters>(createEmptyAccountActivityFilters);
  const [sort, setSort] = useState<TransactionsSort>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const feedInput = useMemo(
    () => ({
      expenses: expensesStore.expenses,
      incomes: incomesStore.incomes,
      transfers,
      accounts,
      accountTypes,
      query,
      filters,
      monthKey: month,
      tab,
      sort,
    }),
    [expensesStore.expenses, incomesStore.incomes, transfers, accounts, accountTypes, query, filters, month, tab, sort]
  );
  const feed = useMemo(() => buildTransactionsFeed(feedInput), [feedInput]);

  // The store's first page may not reach this period: ask for each month it
  // covers once (bounded reads, skipped when already loaded).
  const scopeMonths = useMemo(() => monthsInScope(feed.dateScope), [feed.dateScope]);
  const { loadMonth: loadExpenseMonth, monthsLoaded: expenseMonths } = expensesStore;
  const { loadMonth: loadIncomeMonth, monthsLoaded: incomeMonths } = incomesStore;
  const monthsKey = scopeMonths.months.join(",");
  useEffect(() => {
    for (const m of monthsKey.split(",")) {
      void loadExpenseMonth(m);
      void loadIncomeMonth(m);
    }
  }, [monthsKey, loadExpenseMonth, loadIncomeMonth]);
  const complete = scopeMonths.months.every((m) => expenseMonths.has(m) && incomeMonths.has(m));

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href));
  const setMonth = (next: string) => {
    setVisible(PAGE_SIZE);
    router.setParams({ month: next });
  };
  const setTab = (next: TransactionsTab) => {
    setVisible(PAGE_SIZE);
    router.setParams({ tab: next });
  };
  const cycleSort = () => setSort(TRANSACTIONS_SORTS[(TRANSACTIONS_SORTS.indexOf(sort) + 1) % TRANSACTIONS_SORTS.length]);

  const loading = (expensesStore.loading || incomesStore.loading) && feed.rows.length === 0;
  const error = expensesStore.error ?? incomesStore.error;
  const shown = feed.rows.slice(0, visible);
  // Grouping by day only reads right when the rows are in date order.
  const byDate = sort === "newest" || sort === "oldest";
  const days = useMemo(() => (byDate ? groupFeedByDay(shown) : []), [byDate, shown]);
  const todayKey = todayDateKey(settings.timezone);
  const dayLabel = (date: string) => relativeDayLabel(date, todayKey) ?? formatDisplayDate(date, settings?.dateFormat);
  const narrowed = Boolean(query.trim()) || feed.activeFilterCount > 0;

  const tabs = TRANSACTIONS_TABS.map((id) => ({
    id,
    label: `${id === "all" ? "All" : id === "expenses" ? "Expenses" : id === "income" ? "Income" : "Transfers"}${
      feed.counts[id] > 0 ? ` ${feed.counts[id]}` : ""
    }`,
  }));

  return (
    <PageShell contentContainerStyle={styles.content}>
      <DrilldownTopBar onBack={goBack} month={month} maxMonth={thisMonth} onChangeMonth={setMonth} />

      <View style={styles.titleRow}>
        <View style={[styles.heroIcon, { backgroundColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.18 : 0.1) }]}>
          <Receipt size={22} color={theme.colors.primary} strokeWidth={2} />
        </View>
        <View style={styles.titleText}>
          <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>Transactions</Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
            {feed.dateScope.monthOverridden
              ? `${formatDisplayDate(feed.dateScope.fromDate, settings?.dateFormat)} – ${formatDisplayDate(feed.dateScope.toDate, settings?.dateFormat)}`
              : `Income, expenses and transfers · ${monthLabel(month)}`}
          </Text>
        </View>
      </View>

      <View style={styles.totals}>
        <TotalTile label="Spent" value={feed.totals.spent} currency={currency} tone="default" />
        <TotalTile label="Income" value={feed.totals.income} currency={currency} tone="positive" />
        <TotalTile label="Transferred" value={feed.transferred} currency={currency} tone="muted" />
      </View>

      <DrilldownTabs tabs={tabs} value={tab} onChange={setTab} />

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <SearchBar
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Search title, category, account or note"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search transactions"
          />
        </View>
        <Pressable
          onPress={() => {
            void haptic.selection();
            setShowFilters(true);
          }}
          style={({ pressed }) => [
            styles.filterButton,
            {
              backgroundColor: feed.activeFilterCount > 0 ? withAlpha(theme.colors.primary, surfaces.isDark ? 0.2 : 0.1) : surfaces.control,
              borderColor: feed.activeFilterCount > 0 ? theme.colors.primary : theme.colors.border,
            },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filters${feed.activeFilterCount > 0 ? `, ${feed.activeFilterCount} active` : ""}`}
        >
          <SlidersHorizontal size={18} color={feed.activeFilterCount > 0 ? theme.colors.primary : theme.colors.foreground} />
          {feed.activeFilterCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.badgeText, { color: theme.colors.primaryForeground, fontFamily: theme.fontFamily.bold }]}>
                {feed.activeFilterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {feed.activeFilterCount > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip
            label={`${feed.activeFilterCount} filter${feed.activeFilterCount === 1 ? "" : "s"} · Clear`}
            selected
            appearance="outline"
            onPress={() => setFilters(createEmptyAccountActivityFilters())}
            accessibilityLabel="Clear all filters"
          />
        </ScrollView>
      ) : null}

      {expensesStore.isFromCache ? <DataNote offline>You're offline — showing the transactions saved on this device.</DataNote> : null}
      <ReadModelFreshnessBadge freshness={freshness} />
      {!complete && !loading ? <DataNote>Still loading this period's older transactions — the list may be incomplete.</DataNote> : null}
      {scopeMonths.truncated ? <DataNote>Only the latest 12 months of this range are loaded here. Narrow the dates to see older ones.</DataNote> : null}
      {feed.validationError ? <DataNote>{feed.validationError}</DataNote> : null}

      {error && feed.rows.length === 0 ? (
        <ErrorState title="Couldn't load transactions" description={error.message} onRetry={expensesStore.retry} />
      ) : loading ? (
        <DashboardSkeleton variant="section" rows={6} />
      ) : (
        <SurfaceCard
          title={narrowed ? `${feed.rows.length} matching` : `${feed.rows.length} transactions`}
          action={
            <Chip
              label={TRANSACTIONS_SORT_LABELS[sort]}
              appearance="tonal"
              size="sm"
              icon={(color) => <ArrowUpDown size={13} color={color} />}
              onPress={cycleSort}
              accessibilityLabel={`Sort: ${TRANSACTIONS_SORT_LABELS[sort]}. Tap to change`}
            />
          }
        >
          {feed.rows.length === 0 ? (
            <EmptyState
              illustration={narrowed ? "search" : "expenses"}
              compact
              title={narrowed ? "No matching transactions" : `Nothing recorded in ${monthLabel(month, "long")}`}
              description={narrowed ? "Try another search or clear the filters." : "Transactions you add for this period appear here."}
            />
          ) : byDate ? (
            days.map((day) => (
              <View key={day.date} style={styles.day}>
                <View style={[styles.dayHeader, { borderBottomColor: theme.colors.border }]}>
                  <Text style={[styles.dayLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
                    {dayLabel(day.date)}
                  </Text>
                  {day.totals.transactionCount > 0 ? (
                    <FinancialAmount
                      value={Math.abs(day.totals.net)}
                      currency={currency}
                      size="xs"
                      weight="semibold"
                      sign={day.totals.net < 0 ? "minus" : day.totals.net > 0 ? "plus" : "none"}
                      tone={day.totals.net > 0 ? "positive" : "muted"}
                    />
                  ) : null}
                </View>
                {day.rows.map((row) => (
                  <FeedRowView key={`${row.kind}:${row.record.activity.id}`} row={row} currency={currency} showDate={false} />
                ))}
              </View>
            ))
          ) : (
            shown.map((row) => (
              <FeedRowView key={`${row.kind}:${row.record.activity.id}`} row={row} currency={currency} showDate />
            ))
          )}
          {feed.rows.length > shown.length ? (
            <Button variant="outline" onPress={() => setVisible((v) => v + PAGE_SIZE)}>
              {`Show more (${feed.rows.length - shown.length} left)`}
            </Button>
          ) : null}
        </SurfaceCard>
      )}

      <Text style={[styles.footnote, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
        Day totals are income minus spending. Transfers between your own accounts are listed but not counted.
      </Text>

      <AccountActivityFilterModal
        visible={showFilters}
        filters={filters}
        options={feed.filterOptions}
        onClose={() => setShowFilters(false)}
        onApply={(next) => {
          setFilters(next);
          setVisible(PAGE_SIZE);
          setShowFilters(false);
        }}
        getResultCount={(next) => buildTransactionsFeed({ ...feedInput, filters: next }).rows.length}
      />
    </PageShell>
  );
}

function TotalTile({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  tone: "default" | "positive" | "muted";
}) {
  const { theme } = useTheme();
  return (
    <Card variant="outlined" elevation={0} radius={16} style={styles.tile} contentStyle={styles.tileContent}>
      <Text style={[styles.tileLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>{label}</Text>
      <FinancialAmount value={value} currency={currency} size="md" weight="bold" tone={tone} fit />
    </Card>
  );
}

function FeedRowView({ row, currency, showDate }: { row: FeedRow; currency: string; showDate: boolean }) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const money = useGhostMoney(currency);
  const { activity } = row.record;
  const date = formatDisplayDate(activity.date, settings?.dateFormat);

  let title: string;
  let meta: string;
  let icon;
  if (row.kind === "transfer") {
    title = row.record.transfer.note?.trim() || "Transfer";
    meta = `${row.record.fromName} → ${row.record.toName}`;
    icon = (
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(theme.colors.info, surfaces.isDark ? 0.18 : 0.1) }]}>
        <ArrowLeftRight size={17} color={theme.colors.info} />
      </View>
    );
  } else {
    title = activityTitle(activity);
    const where = row.kind === "income" ? activity.source || "Income" : [row.record.category, row.record.subcategory].filter(Boolean).join(" › ");
    meta = [where, row.record.accountName].filter(Boolean).join(" · ");
    icon = (
      <CategoryIcon
        category={row.kind === "income" ? "Income" : row.record.category || ""}
        color={row.kind === "income" ? theme.colors.success : theme.colors.primary}
        size={38}
      />
    );
  }
  const when = [showDate ? date : null, activity.time].filter(Boolean).join(" · ");
  const sign = row.kind === "expense" ? "minus" : row.kind === "income" ? "plus" : "none";

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        router.push(feedRowHref(row) as Href);
      }}
      android_ripple={{ color: surfaces.control, borderless: false }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}, ${date}${activity.time ? ` ${activity.time}` : ""}, ${
        row.kind === "expense" ? "spent" : row.kind === "income" ? "received" : "transferred"
      } ${money(activity.amount)}. Open details`}
    >
      {icon}
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.rowMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <FinancialAmount
          value={activity.amount}
          currency={currency}
          size="sm"
          weight="semibold"
          sign={sign}
          tone={row.kind === "income" ? "positive" : row.kind === "transfer" ? "muted" : "default"}
        />
        {when ? (
          <Text style={[styles.rowMeta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>{when}</Text>
        ) : null}
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  pressed: { opacity: 0.8 },
  heroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleText: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 2 },
  title: { fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  subtitle: { fontSize: 13 },
  totals: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, borderWidth: StyleSheet.hairlineWidth },
  tileContent: { padding: 0, gap: 4 },
  tileLabel: { fontSize: 12.5 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchField: { flex: 1 },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10 },
  chips: { flexDirection: "row", gap: 8 },
  day: { gap: 2 },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayLabel: { fontSize: 13.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, minHeight: 60 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rowBody: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 2 },
  rowTitle: { fontSize: 14.5 },
  rowMeta: { fontSize: 12, fontVariant: ["tabular-nums"] },
  rowEnd: { alignItems: "flex-end", gap: 2 },
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
});

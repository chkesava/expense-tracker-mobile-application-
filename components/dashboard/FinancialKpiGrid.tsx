import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ArrowDownToLine, ArrowUpFromLine, CreditCard, Layers } from "lucide-react-native";

import { KpiCard } from "@/components/dashboard/KpiCard";
import type { TotalChange } from "@/shared/utils/dashboardDesktop";
import { totalChangeTone, monthOverMonthChange } from "@/shared/utils/dashboardDesktop";
import { transactionsHref } from "@/shared/utils/transactionsFeed";

export interface FinancialKpiGridProps {
  currency: string;
  loading: boolean;
  /** "over the past month", "since 12 Oct" — shared with the hero card. */
  when: string;
  totalAssets: number;
  totalLiabilities: number;
  assetsChange: TotalChange;
  liabilitiesChange: TotalChange;
  monthlyIncome: number;
  monthlyExpense: number;
  previousIncome: number;
  previousExpense: number;
  activeMonth: string;
  style?: React.ComponentProps<typeof View>["style"];
}

/**
 * Total Assets / Total Liabilities / This Month Income / This Month Expense,
 * beside (desktop) or under (mobile) the Net Worth hero. Every figure and
 * every change comes from the hero's own data — `useUnifiedNetWorth` for the
 * assets/liabilities pair, `useDashboardCashFlow`'s active/previous month
 * summaries for income/expense — nothing here recomputes a total.
 */
export const FinancialKpiGrid = memo(function FinancialKpiGrid({
  currency,
  loading,
  when,
  totalAssets,
  totalLiabilities,
  assetsChange,
  liabilitiesChange,
  monthlyIncome,
  monthlyExpense,
  previousIncome,
  previousExpense,
  activeMonth,
  style,
}: FinancialKpiGridProps) {
  const router = useRouter();
  const openAccounts = () => router.push("/ledger?tab=accounts" as Href);
  // A breakdown of what makes up the figure (credit cards, overdrafts,
  // borrowings, group funds held) — not the flat accounts list.
  const openLiabilities = () => router.push("/liabilities" as Href);
  const openIncome = () => router.push(transactionsHref(activeMonth, "income") as Href);
  const openExpense = () => router.push(transactionsHref(activeMonth, "expenses") as Href);

  const incomeChange = monthOverMonthChange(monthlyIncome, previousIncome);
  const expenseChange = monthOverMonthChange(monthlyExpense, previousExpense);
  // Rising expense is bad news, rising income is good — the opposite sense
  // from how `totalChangeTone` reads assets vs liabilities, so it isn't reused here.
  const incomeTone = incomeChange.change === null || incomeChange.change === 0 ? "flat" : incomeChange.change > 0 ? "good" : "bad";
  const expenseTone = expenseChange.change === null || expenseChange.change === 0 ? "flat" : expenseChange.change > 0 ? "bad" : "good";

  return (
    <View style={[styles.grid, style]}>
      <View style={styles.row}>
        <KpiCard
          icon={Layers}
          label="Total Assets"
          value={totalAssets}
          currency={currency}
          change={assetsChange}
          changeTone={totalChangeTone("assets", assetsChange.change)}
          when={when}
          loading={loading}
          onPress={openAccounts}
          style={styles.cell}
          testID="dash-kpi-assets"
        />
        <KpiCard
          icon={CreditCard}
          label="Total Liabilities"
          value={totalLiabilities}
          currency={currency}
          change={liabilitiesChange}
          changeTone={totalChangeTone("liabilities", liabilitiesChange.change)}
          when={when}
          loading={loading}
          onPress={openLiabilities}
          style={styles.cell}
          testID="dash-kpi-liabilities"
        />
      </View>
      <View style={styles.row}>
        <KpiCard
          icon={ArrowDownToLine}
          label="This Month Income"
          value={monthlyIncome}
          currency={currency}
          change={incomeChange}
          changeTone={incomeTone}
          when="vs last month"
          loading={loading}
          onPress={openIncome}
          style={styles.cell}
          testID="dash-kpi-income"
        />
        <KpiCard
          icon={ArrowUpFromLine}
          label="This Month Expense"
          value={monthlyExpense}
          currency={currency}
          change={expenseChange}
          changeTone={expenseTone}
          when="vs last month"
          loading={loading}
          onPress={openExpense}
          style={styles.cell}
          testID="dash-kpi-expense"
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // A true 2x2 grid (not a wrap) so each row can stretch to fill whatever
  // height the parent gives it — on desktop that's the Net Worth hero's full
  // height, so the KPI cards never leave a blank gap below them.
  grid: {
    flexDirection: "column",
    gap: 10,
  },
  // Each row wraps once a card would drop under 160px (phones up to ~360px),
  // where the 2x2 cut titles to "Tot…" and amounts to "₹7,78,…". Wider
  // layouts (and the desktop hero) keep the 2x2.
  row: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  cell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
    minWidth: 0,
  },
});

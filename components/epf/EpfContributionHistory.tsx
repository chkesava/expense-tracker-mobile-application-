import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { IdCard } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { EpfContributionRow } from "@/components/epf/EpfContributionRow";
import { Card } from "@/components/ui/Card";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfContributions } from "@/hooks/useEpfContributions";
import { epfCurrentMonth } from "@/shared/features/epf/utils/epfClock";
import type { EpfContribution, EpfEstablishment } from "@/shared/features/epf/types";
import {
  contributionMonthsFor,
  contributionStatusMeta,
  groupContributionsByFinancialYear,
  summarizeContributions,
} from "@/shared/features/epf/utils/contributions";
import { financialYearLabel } from "@/shared/utils/financialYear";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { monthLabel } from "@/shared/utils/monthLabel";

type HistoryItem =
  | { type: "header"; id: string; title: string; meta: string }
  | { type: "row"; id: string; row: EpfContribution };

export function EpfContributionHistory({
  establishment,
  onAddMonths,
}: {
  establishment: EpfEstablishment;
  onAddMonths: () => void;
}) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  const {
    contributions,
    contributionsLoading,
    contributionsError,
    retryContributions,
  } = useEpfContributions(establishment.id);

  const money = useCallback((value: number) => formatAmount(value, currency), [currency]);

  const expectedMonths = useMemo(
    () => contributionMonthsFor(establishment, epfCurrentMonth()),
    [establishment]
  );

  const totals = useMemo(() => summarizeContributions(contributions), [contributions]);

  const items = useMemo((): HistoryItem[] => {
    const groups = groupContributionsByFinancialYear(contributions, expectedMonths);
    const out: HistoryItem[] = [];
    for (const group of groups) {
      if (group.rows.length === 0) continue;
      out.push({
        type: "header",
        id: `fy-${group.financialYear}`,
        title: financialYearLabel(group.financialYear),
        meta: `${group.rows.length} of ${group.expectedCount} · ${money(group.totals.epfCredit)}`,
      });
      for (const row of group.rows) {
        out.push({ type: "row", id: row.id, row });
      }
    }
    return out;
  }, [contributions, expectedMonths, money]);

  if (contributionsLoading) {
    return (
      <View style={styles.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (contributionsError) {
    return (
      <ErrorState
        title="Couldn't load contributions"
        description={contributionsError.message}
        onRetry={retryContributions}
      />
    );
  }

  if (contributions.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon={<IdCard size={theme.iconSize.xl} color={theme.colors.primary} />}
          title="No contributions recorded"
          description={`Add the monthly EPF contributions for ${establishment.employerName} so interest and balances can be tracked against it.`}
          primaryAction={{ label: "Add months", onPress: onAddMonths }}
        />
      </View>
    );
  }

  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.id}
      getItemType={(item) => item.type}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <Card>
          <Text style={[styles.totalLabel, { color: theme.colors.mutedForeground }]}>
            Total credited to EPF
          </Text>
          <Text style={[styles.totalValue, { color: theme.colors.foreground }]}>
            {money(totals.epfCredit)}
          </Text>
          <Text style={[styles.totalBreakdown, { color: theme.colors.mutedForeground }]}>
            You {money(totals.employee)} · Employer {money(totals.employerEpf)} · Pension{" "}
            {money(totals.eps)} across {totals.count} month
            {totals.count === 1 ? "" : "s"}
          </Text>
        </Card>
      }
      renderItem={({ item }) => {
        if (item.type === "header") {
          return (
            <View style={styles.fyHeader}>
              <Text style={[styles.fyTitle, { color: theme.colors.foreground }]}>
                {item.title}
              </Text>
              <Text style={[styles.fyMeta, { color: theme.colors.mutedForeground }]}>
                {item.meta}
              </Text>
            </View>
          );
        }

        const meta = contributionStatusMeta(item.row.status, item.row.source);
        return (
          <EpfContributionRow
            month={item.row.month}
            monthLabel={monthLabel(item.row.month)}
            employeeShare={item.row.employeeShare}
            employerShare={item.row.employerShare}
            epsShare={item.row.epsShare}
            epfCredit={item.row.epfCredit}
            statusLabel={meta.label}
            statusTone={meta.tone}
            overridden={item.row.overridden === true}
            partialMonth={item.row.partialMonth === true}
            recorded
            hasIssue={false}
            formatAmount={money}
            onPress={onAddMonths}
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 16 },
  listContent: { padding: 16, paddingBottom: 24 },
  totalLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },
  totalValue: { fontSize: 24, fontWeight: "700", marginTop: 4 },
  totalBreakdown: { fontSize: 12, marginTop: 6, lineHeight: 18 },
  fyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  fyTitle: { fontSize: 14, fontWeight: "700" },
  fyMeta: { fontSize: 12 },
});

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, BadgeCheck, Percent } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { EpfReconcileSheet } from "@/components/epf/EpfReconcileSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfContributions } from "@/hooks/useEpfContributions";
import { useEpfInterest } from "@/hooks/useEpfInterest";
import { useEpfTransfers } from "@/hooks/useEpfTransfers";
import { epfCurrentMonth } from "@/shared/features/epf/utils/epfClock";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import {
  interestSchedule,
  summariseInterest,
} from "@/shared/features/epf/utils/interest";
import { reconciliationHistory } from "@/shared/features/epf/utils/reconciliation";
import { establishmentBalanceBreakdown } from "@/shared/features/epf/utils/transfers";
import { financialYearLabel, financialYearOfMonth } from "@/shared/utils/financialYear";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { combineEpfLoad } from "@/shared/features/epf/utils/loadState";

/**
 * Balance, interest and reconciliation for one establishment — KAN-70.
 *
 * One tab that answers "why is my balance this number?" — the breakdown, the
 * interest each financial year earned and under which rule, and how it compares
 * with what EPFO actually shows.
 */
export function EpfBalanceTab({ establishment }: { establishment: EpfEstablishment }) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();

  const { contributions, contributionsLoading, contributionsError, retryContributions } =
    useEpfContributions(establishment.id);
  const { transfers, transfersLoading, transfersError, retryTransfers } = useEpfTransfers();
  const {
    interestEntries,
    reconciliations,
    interestLoading,
    interestError,
    retryInterest,
    recomputeInterest,
    recordReconciliation,
  } = useEpfInterest();

  const [reconcileOpen, setReconcileOpen] = useState(false);
  const money = useCallback((value: number) => formatAmount(value, currency), [currency]);

  // Every source, not a subset. Transfers were previously omitted from the
  // error channel, so a failed transfers listener rendered a balance silently
  // missing every transfer (KAN-73).
  const load = combineEpfLoad([
    { loading: contributionsLoading, error: contributionsError, retry: retryContributions },
    { loading: transfersLoading, error: transfersError, retry: retryTransfers },
    { loading: interestLoading, error: interestError, retry: retryInterest },
  ]);
  const loading = load.loading;

  const schedule = useMemo(
    () =>
      interestSchedule({
        contributions,
        transfers,
        adjustments: reconciliations,
        establishmentId: establishment.id,
        throughFinancialYear: financialYearOfMonth(epfCurrentMonth()),
      }),
    [contributions, transfers, reconciliations, establishment.id]
  );

  const interestSummary = useMemo(() => summariseInterest(schedule), [schedule]);

  const breakdown = useMemo(
    () =>
      establishmentBalanceBreakdown({
        contributions,
        transfers,
        establishmentId: establishment.id,
        interestEntries,
        adjustments: reconciliations,
      }),
    [contributions, transfers, establishment.id, interestEntries, reconciliations]
  );

  const history = useMemo(
    () => reconciliationHistory(reconciliations, establishment.id),
    [reconciliations, establishment.id]
  );

  // Recompute once per mount, after the data has loaded. The deterministic id
  // makes a redundant run a no-op write, so this cannot accumulate entries.
  const recomputed = useRef(false);
  useEffect(() => {
    if (loading || recomputed.current || contributions.length === 0) return;
    recomputed.current = true;
    void recomputeInterest({
      establishmentId: establishment.id,
      contributions,
      transfers,
    });
  }, [loading, contributions, transfers, establishment.id, recomputeInterest]);

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (load.error) {
    return (
      <ErrorState
        title="Couldn't load balance"
        description={load.error.message}
        onRetry={load.retryAll}
      />
    );
  }

  const row = (label: string, value: number, negative = false) => (
    <View style={styles.breakdownRow} key={label}>
      <Text style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.breakdownValue, { color: theme.colors.foreground }]}>
        {negative && value > 0 ? "−" : ""}
        {money(value)}
      </Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <Text style={[styles.totalLabel, { color: theme.colors.mutedForeground }]}>
          Balance at {establishment.employerName}
        </Text>
        <Text style={[styles.totalValue, { color: theme.colors.foreground }]}>
          {money(breakdown.total)}
        </Text>

        <View style={[styles.breakdown, { borderTopColor: theme.colors.border }]}>
          {row("Contributions", breakdown.contributions)}
          {row("Interest", breakdown.interest)}
          {breakdown.transfersIn > 0 ? row("Transferred in", breakdown.transfersIn) : null}
          {breakdown.transfersOut > 0
            ? row("Transferred out", breakdown.transfersOut, true)
            : null}
          {breakdown.adjustments !== 0 ? row("Adjustments", breakdown.adjustments) : null}
        </View>
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Percent size={theme.iconSize.sm} color={theme.colors.primary} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Interest by financial year
          </Text>
        </View>

        {schedule.length === 0 ? (
          <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
            Interest appears once a financial year has contributions in it.
          </Text>
        ) : (
          schedule.map((year) => (
            <View key={year.financialYear} style={styles.yearRow}>
              <View style={styles.yearText}>
                <Text style={[styles.yearLabel, { color: theme.colors.foreground }]}>
                  {financialYearLabel(year.financialYear)}
                </Text>
                <Text style={[styles.yearMeta, { color: theme.colors.mutedForeground }]}>
                  {year.rateMissing
                    ? "Rate not declared yet"
                    : `${((year.rate ?? 0) * 100).toFixed(2)}% on monthly balance`}
                </Text>
              </View>
              <Text
                style={[
                  styles.yearValue,
                  {
                    color: year.rateMissing
                      ? theme.colors.mutedForeground
                      : theme.colors.foreground,
                  },
                ]}
              >
                {year.rateMissing ? "—" : money(year.interest)}
              </Text>
            </View>
          ))
        )}

        {interestSummary.missingRateYears.length > 0 ? (
          <View style={styles.noticeRow}>
            <AlertTriangle size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
            <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
              EPFO has not declared a rate for{" "}
              {interestSummary.missingRateYears.join(", ")} yet. Interest for those years
              will appear once it does.
            </Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <BadgeCheck size={theme.iconSize.sm} color={theme.colors.primary} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Compare with EPFO
          </Text>
        </View>

        <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
          {history.length === 0
            ? "Everything above is simulated from what you have recorded. Check it against your passbook and record the real figure."
            : `Last reconciled ${history[0].date}${
                history[0].adjustmentAmount === 0
                  ? " — they agreed."
                  : ` — adjusted by ${money(history[0].adjustmentAmount)}.`
              }`}
        </Text>

        <Button
          variant="secondary"
          size="sm"
          onPress={() => setReconcileOpen(true)}
          style={styles.reconcileButton}
        >
          Record EPFO balance
        </Button>

        {history.length > 0 ? (
          <View style={[styles.history, { borderTopColor: theme.colors.border }]}>
            {history.map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <View style={styles.yearText}>
                  <Text style={[styles.yearLabel, { color: theme.colors.foreground }]}>
                    {item.date}
                  </Text>
                  <Text style={[styles.yearMeta, { color: theme.colors.mutedForeground }]}>
                    EPFO {money(item.actualBalance)} · Spendly{" "}
                    {money(item.calculatedBalance)}
                    {item.reference ? ` · ${item.reference}` : ""}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.yearValue,
                    {
                      color:
                        item.adjustmentAmount === 0
                          ? theme.colors.mutedForeground
                          : item.adjustmentAmount > 0
                            ? theme.colors.success
                            : theme.colors.destructive,
                    },
                  ]}
                >
                  {item.adjustmentAmount > 0 ? "+" : ""}
                  {money(item.adjustmentAmount)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <EpfReconcileSheet
        isOpen={reconcileOpen}
        onClose={() => setReconcileOpen(false)}
        establishment={establishment}
        calculatedBalance={breakdown.total}
        currency={currency}
        onSubmit={recordReconciliation}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 16 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  totalLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  totalValue: { fontSize: 28, fontWeight: "700", marginTop: 4 },
  breakdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownLabel: { fontSize: 13 },
  breakdownValue: { fontSize: 13, fontWeight: "600" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "700" },
  hint: { fontSize: 12, lineHeight: 18, flex: 1 },
  noticeRow: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "flex-start" },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 12,
  },
  yearText: { flex: 1, gap: 2 },
  yearLabel: { fontSize: 13, fontWeight: "600" },
  yearMeta: { fontSize: 12 },
  yearValue: { fontSize: 14, fontWeight: "700" },
  reconcileButton: { marginTop: 12 },
  history: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 12,
  },
});

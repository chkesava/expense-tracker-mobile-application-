import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { AlertTriangle } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { EpfContributionRow } from "@/components/epf/EpfContributionRow";
import { EpfCreditSheet } from "@/components/epf/EpfCreditSheet";
import { Card } from "@/components/ui/Card";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfContributions } from "@/hooks/useEpfContributions";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import { contributionStatusMeta } from "@/shared/features/epf/utils/contributions";
import {
  isReconciled,
  projectionBlocker,
  summariseLifecycle,
} from "@/shared/features/epf/utils/lifecycle";
import { wageForProjection } from "@/shared/features/epf/utils/schedule";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { monthLabel } from "@/shared/utils/monthLabel";

/** Recent months shown on the Current tab. Older months live under History. */
const RECENT_MONTHS = 18;

/**
 * Current-employment contribution lifecycle — KAN-68.
 *
 * Recent months newest first, each tappable to record what actually happened.
 */
export function EpfCurrentContributions({
  establishment,
}: {
  establishment: EpfEstablishment;
}) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  const {
    contributions,
    contributionsLoading,
    contributionsError,
    retryContributions,
    recordCredit,
    markMissed,
    markReversed,
  } = useEpfContributions(establishment.id);

  const [editingMonth, setEditingMonth] = useState<string | null>(null);

  const money = useCallback((value: number) => formatAmount(value, currency), [currency]);

  const recent = useMemo(
    () => [...contributions].reverse().slice(0, RECENT_MONTHS),
    [contributions]
  );
  const summary = useMemo(() => summariseLifecycle(contributions), [contributions]);
  const latestWage = useMemo(() => wageForProjection(contributions), [contributions]);
  const blocker = projectionBlocker({ hasCurrentEmployment: true, latestWage });

  const editingRow = useMemo(
    () => contributions.find((row) => row.month === editingMonth) ?? null,
    [contributions, editingMonth]
  );

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

  if (recent.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Nothing yet for this employer"
          description={
            blocker === "no_wage"
              ? "Record one month with a wage under Backfill, and future months will be projected automatically."
              : "Months appear here as they are generated."
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlashList
        data={recent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        extraData={`${contributions.length}-${summary.unreconciled}`}
        ListHeaderComponent={
          <View style={styles.header}>
            <Card>
              <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
                Credited to EPF
              </Text>
              <Text style={[styles.summaryValue, { color: theme.colors.foreground }]}>
                {money(summary.creditedTotal)}
              </Text>
              <Text style={[styles.summaryHint, { color: theme.colors.mutedForeground }]}>
                {summary.expected} expected · {summary.credited} credited ·{" "}
                {summary.partial} partial · {summary.missed} missed
              </Text>
            </Card>

            {summary.unreconciled > 0 ? (
              <View style={[styles.notice, { borderColor: theme.colors.border }]}>
                <AlertTriangle size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
                <Text style={[styles.noticeText, { color: theme.colors.mutedForeground }]}>
                  {summary.unreconciled} month{summary.unreconciled === 1 ? "" : "s"} credited
                  from projection only. Tap one to confirm it against your passbook.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const meta = contributionStatusMeta(item.status, item.source, isReconciled(item));
          return (
            <EpfContributionRow
              month={item.month}
              monthLabel={monthLabel(item.month)}
              employeeShare={item.employeeShare}
              employerShare={item.employerShare}
              epsShare={item.epsShare}
              epfCredit={item.creditedAmount ?? item.epfCredit}
              statusLabel={meta.label}
              statusTone={meta.tone}
              overridden={item.overridden === true}
              partialMonth={item.partialMonth === true}
              recorded
              hasIssue={item.status === "missed"}
              formatAmount={money}
              onPress={setEditingMonth}
            />
          );
        }}
      />

      <EpfCreditSheet
        isOpen={editingMonth !== null}
        onClose={() => setEditingMonth(null)}
        row={editingRow}
        monthLabel={editingMonth ? monthLabel(editingMonth) : ""}
        currency={currency}
        onRecordCredit={recordCredit}
        onMarkMissed={markMissed}
        onMarkReversed={markReversed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { gap: 12, padding: 16 },
  listContent: { padding: 16, paddingBottom: 24 },
  header: { gap: 12, marginBottom: 12 },
  summaryLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  summaryValue: { fontSize: 24, fontWeight: "700", marginTop: 4 },
  summaryHint: { fontSize: 12, marginTop: 6, lineHeight: 18 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
});

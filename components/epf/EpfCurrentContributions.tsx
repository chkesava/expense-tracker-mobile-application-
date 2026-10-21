import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { AlertTriangle, Pencil } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { EpfContributionRow } from "@/components/epf/EpfContributionRow";
import { EpfCreditSheet } from "@/components/epf/EpfCreditSheet";
import { EpfWageChangeSheet } from "@/components/epf/EpfWageChangeSheet";
import { useSpendlyBottomClearance } from "@/components/layout/useSpendlyBottomClearance";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfContributions } from "@/hooks/useEpfContributions";
import { useEpfWageHistory } from "@/hooks/useEpfWageHistory";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import { contributionStatusMeta } from "@/shared/features/epf/utils/contributions";
import { epfCurrentMonth, epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import { isReconciled, projectionBlocker } from "@/shared/features/epf/utils/lifecycle";
import {
  deriveMonthState,
  dueDateFor,
  dueDateLabel,
  isAwaitingCredit,
  summariseLifecycle,
} from "@/shared/features/epf/utils/monthState";
import { wageForProjection, simulatedMonthsNeedingReview } from "@/shared/features/epf/utils/schedule";
import { useTheme } from "@/theme/ThemeProvider";
import { monthLabel } from "@/shared/utils/monthLabel";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { Section } from "@/components/dashboard/primitives";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";

/** Recent months shown on the Current tab. Older months live under History. */
const RECENT_MONTHS = 18;

/**
 * Current-employment contribution lifecycle — KAN-68, reworked by SPENDLY-72.
 *
 * Recent months newest first, each tappable to record what actually happened.
 *
 * Nothing here decides anything: the clock goes in, `deriveMonthState` and
 * `summariseLifecycle` do the reading, and this renders the answer. That is
 * load bearing — `vitest.config.ts` never collects `components/**`, so a
 * branch written here would be a branch nobody tests, which is how the header
 * came to total a different set of months than the rows beneath it.
 */
export function EpfCurrentContributions({
  establishment,
}: {
  establishment: EpfEstablishment;
}) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  const bottomClearance = useSpendlyBottomClearance({ withFab: true });
  const {
    contributions,
    contributionsLoading,
    contributionsError,
    retryContributions,
    recordCredit,
    markMissed,
    markReversed,
  } = useEpfContributions(establishment.id);

  const { history: wageHistory, addWageChange } = useEpfWageHistory(establishment.id);

  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [changingWage, setChangingWage] = useState(false);

  // SPENDLY-544: ghost-aware; EPF ignored ghost mode almost everywhere.
  const money = useGhostMoney(currency);

  // One clock reading per render, shared by the header and every row, so a
  // month can never be summarised against a different day than it is drawn on.
  const todayKey = epfTodayKey();
  const currentMonth = epfCurrentMonth();

  const recent = useMemo(
    () => [...contributions].reverse().slice(0, RECENT_MONTHS),
    [contributions]
  );
  const summary = useMemo(
    () => summariseLifecycle(contributions, todayKey, currentMonth),
    [contributions, todayKey, currentMonth]
  );
  const latestWage = useMemo(() => wageForProjection(contributions), [contributions]);
  const blocker = projectionBlocker({ hasCurrentEmployment: true, latestWage });
  const reviewMonths = useMemo(
    () => simulatedMonthsNeedingReview(contributions, currentMonth),
    [contributions, currentMonth]
  );

  const editingRow = useMemo(
    () => contributions.find((row) => row.month === editingMonth) ?? null,
    [contributions, editingMonth]
  );

  if (contributionsLoading) {
    return (
      <View style={styles.container}>
        <DashboardSkeleton variant="section" rows={3} />
        <DashboardSkeleton variant="section" rows={2} />
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
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomClearance }]}
        extraData={`${contributions.length}-${summary.unreconciled}`}
        ListHeaderComponent={
          <View style={styles.header}>
            <Section>
              <View style={styles.summaryHeaderRow}>
                <View style={styles.summaryValueCol}>
                  <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
                    Credited to EPF
                  </Text>
                  <Text style={[styles.summaryValue, { color: theme.colors.foreground }]} numberOfLines={1}>
                    {money(summary.creditedTotal)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setChangingWage(true)}
                  style={[styles.wageChangeButton, { borderColor: theme.colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Change EPF wage"
                >
                  <Pencil size={theme.iconSize.sm} color={theme.colors.primary} />
                  <Text style={[styles.wageChangeText, { color: theme.colors.primary }]}>
                    Change wage
                  </Text>
                </Pressable>
              </View>
              <Text style={[styles.summaryHint, { color: theme.colors.mutedForeground }]}>
                {summary.credited + summary.confirmed} credited · {summary.partial} partial
                · {summary.awaiting} awaiting · {summary.overdue} overdue ·{" "}
                {summary.missed} missed
              </Text>
              {summary.awaitedTotal > 0 ? (
                <Text style={[styles.summaryHint, { color: theme.colors.mutedForeground }]}>
                  {money(summary.awaitedTotal)} still expected — not counted above until it
                  lands.
                </Text>
              ) : null}
            </Section>

            {reviewMonths.length > 0 ? (
              <View style={[styles.notice, { borderColor: theme.colors.border }]}>
                <AlertTriangle size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
                <Text style={[styles.noticeText, { color: theme.colors.mutedForeground }]}>
                  {reviewMonths.length} simulated month
                  {reviewMonths.length === 1 ? "" : "s"} were generated before your first
                  recorded month. Open Backfill to replace them with passbook figures.
                  Spendly will not delete them.
                </Text>
              </View>
            ) : null}

            {summary.overdue > 0 ? (
              <View style={[styles.notice, { borderColor: theme.colors.border }]}>
                <AlertTriangle size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
                <Text style={[styles.noticeText, { color: theme.colors.mutedForeground }]}>
                  {summary.overdue} month{summary.overdue === 1 ? "" : "s"} past the due date
                  with nothing recorded. Tap one to record the credit, or mark it missed.
                </Text>
              </View>
            ) : null}

            {summary.unreconciled > 0 ? (
              <View style={[styles.notice, { borderColor: theme.colors.border }]}>
                <AlertTriangle size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
                <Text style={[styles.noticeText, { color: theme.colors.mutedForeground }]}>
                  {summary.unreconciled} month{summary.unreconciled === 1 ? "" : "s"} credited
                  without a confirmed amount. Tap one to check it against your passbook.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const state = deriveMonthState(item, todayKey, currentMonth);
          const meta = contributionStatusMeta(state, item.source, {
            reconciled: isReconciled(item),
            dueDate: isAwaitingCredit(state) ? dueDateLabel(dueDateFor(item)) : undefined,
          });
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
              suggested={false}
              hasIssue={state === "missed" || state === "overdue"}
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

      <EpfWageChangeSheet
        isOpen={changingWage}
        onClose={() => setChangingWage(false)}
        establishment={establishment}
        currentMonth={currentMonth}
        currency={currency}
        history={wageHistory}
        fallbackWage={latestWage}
        contributions={contributions}
        onSave={addWageChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { gap: 12, padding: 16 },
  listContent: { padding: 16 },
  header: { gap: 12, marginBottom: 12 },
  // SPENDLY-544: on 320 dp the button squeezed the total into two lines; it
  // now wraps below instead.
  summaryHeaderRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 12, rowGap: 10 },
  summaryValueCol: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 0,
  },
  summaryLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  summaryValue: { fontSize: 24, fontWeight: "700", marginTop: 4 },
  summaryHint: { fontSize: 12, marginTop: 6, lineHeight: 18 },
  wageChangeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  wageChangeText: { fontSize: 12, fontWeight: "600" },
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

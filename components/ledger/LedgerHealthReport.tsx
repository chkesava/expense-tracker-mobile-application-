/**
 * SPENDLY-112 — the Journal's integrity report.
 *
 * The Trail sub-tab answers "what changed"; this answers "what is wrong now".
 *
 * Four states, not three. The acceptance criteria ask for checking / healthy /
 * issue-found, but a truncated ledger is none of those: nothing failed, nothing
 * was searched, and — critically — nothing was checked, so it cannot be shown
 * as healthy. `unavailable` gets its own panel, borrowing the wording of the
 * Journal's own "still loading your full history" notice so the two can never
 * contradict each other on the same screen.
 *
 * Every figure comes from `runLedgerAudit`, which refuses to diagnose a staged
 * ledger at all. This component adds no rule of its own — and offers no action
 * that writes, only navigation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Check, TriangleAlert } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { ErrorState } from "@/components/common/ErrorState";
import { Skeleton } from "@/components/common/Skeleton";
import {
  ACCOUNT_RED,
  accountAccent,
  accountAccentBorder,
} from "@/components/accounts/accountScreenTheme";
import { useAccountsContext } from "@/providers/FinanceDataProvider";
import { useCreditCardBillsContext } from "@/providers/CreditCardBillsProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";
import {
  runLedgerAudit,
  type LedgerAuditCheckResult,
  type LedgerAuditFinding,
  type LedgerAuditReport,
  type LedgerAuditSubject,
} from "@/shared/utils/ledgerAudit";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/** Rows past this are summarised rather than listed. */
const MAX_SUBJECTS = 6;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function LedgerHealthReport({
  onShowInJournal,
}: {
  /** Navigate to a record. The only action this screen offers. */
  onShowInJournal: (subject: LedgerAuditSubject) => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const currency = useDisplayCurrency();

  const { expenses, complete: expensesComplete, error, retry, isFromCache } =
    useExpenses();
  const { incomes, complete: incomesComplete } = useIncomes();
  const { accounts, accountsLoading, accountTypes } = useAccountsContext();
  const { bills, billsLoading } = useCreditCardBillsContext();
  const { subscriptions, subscriptionsLoading, spaces, spacesLoading } =
    useExpenseReferenceData();

  const input = useMemo(
    () => ({
      expenses,
      incomes,
      accounts,
      accountTypes,
      bills,
      subscriptions,
      spaces,
      readiness: {
        expensesComplete,
        incomesComplete,
        accountsLoaded: !accountsLoading,
        billsLoaded: !billsLoading,
        subscriptionsLoaded: !subscriptionsLoading,
        spacesLoaded: !spacesLoading,
        // No provider loads trips or splits on this screen; their checks report
        // "not checked" rather than a verdict. SPENDLY-112b.
        tripsLoaded: false,
        splitsLoaded: false,
        fromCache: isFromCache,
      },
    }),
    [
      expenses,
      incomes,
      accounts,
      accountTypes,
      bills,
      subscriptions,
      spaces,
      expensesComplete,
      incomesComplete,
      accountsLoading,
      billsLoading,
      subscriptionsLoading,
      spacesLoading,
      isFromCache,
    ]
  );

  // Deferred rather than a plain `useMemo`, for two reasons: the checking state
  // the acceptance criteria ask for would otherwise never render, and a
  // multi-thousand-row scan on the render pass would drop frames on the tab
  // switch. `undefined` *is* the checking state.
  const [report, setReport] = useState<LedgerAuditReport | undefined>(undefined);

  useEffect(() => {
    setReport(undefined);
    return scheduleIdleWork(() => setReport(runLedgerAudit(input)), {
      fallbackDelayMs: 120,
    });
  }, [input]);

  const renderFinding = useCallback(
    ({ item }: { item: LedgerAuditFinding }) => (
      <FindingCard
        finding={item}
        currency={currency}
        onShowInJournal={onShowInJournal}
      />
    ),
    [currency, onShowInJournal]
  );

  if (error) {
    return (
      <ErrorState
        title="Couldn't check your ledger"
        description={error.message}
        onRetry={retry}
      />
    );
  }

  if (!report) {
    return (
      <View style={styles.pending}>
        <Text style={[styles.pendingLabel, { color: theme.colors.mutedForeground }]}>
          Checking {expenses.length + incomes.length} transactions…
        </Text>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} height={72} borderRadius={theme.radius.lg} />
        ))}
      </View>
    );
  }

  if (report.status === "unavailable") {
    return (
      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.warning,
          },
        ]}
      >
        <Text style={[styles.panelTitle, { color: theme.colors.foreground }]}>
          Checks paused
        </Text>
        <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
          Still loading your full history. Integrity checks stay paused until it
          is all here — a check run over part of your ledger would report
          problems that are not real.
        </Text>
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <Verdict report={report} isDark={isDark} />
      {report.status === "issues" ? (
        <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
          Nothing here has been changed. These are findings to review, not
          repairs that were applied.
        </Text>
      ) : null}
    </View>
  );

  const footer = <CheckList checks={report.checks} />;

  if (report.findings.length === 0) {
    return (
      <View style={styles.staticBody}>
        {header}
        {footer}
      </View>
    );
  }

  return (
    <FlashList
      style={styles.list}
      data={report.findings}
      keyExtractor={(item, index) =>
        `${item.code}-${item.subjects[0]?.id ?? index}`
      }
      renderItem={renderFinding}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      showsVerticalScrollIndicator={false}
      extraData={isDark}
    />
  );
}

/** The balanced / variance language the account reconciliation already uses. */
function Verdict({
  report,
  isDark,
}: {
  report: LedgerAuditReport;
  isDark: boolean;
}) {
  const { theme } = useTheme();
  const healthy = report.status === "healthy";
  const accent = healthy ? accountAccent(isDark) : ACCOUNT_RED;
  const ran = report.checks.filter((check) => check.status !== "skipped").length;
  const scanned = report.coverage.expensesScanned + report.coverage.incomesScanned;
  const issues = report.counts.error + report.counts.warning;

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: healthy
            ? isDark
              ? "rgba(74,222,128,0.12)"
              : "rgba(22,163,74,0.08)"
            : isDark
              ? "rgba(248,113,113,0.12)"
              : "rgba(239,68,68,0.08)",
          borderColor: healthy ? accountAccentBorder(isDark) : ACCOUNT_RED,
        },
      ]}
    >
      <View style={styles.panelHead}>
        {healthy ? (
          <Check size={16} color={accent} />
        ) : (
          <TriangleAlert size={16} color={accent} />
        )}
        <Text style={[styles.panelTitle, { color: accent }]}>
          {healthy
            ? "Everything checks out"
            : `${issues} ${plural(issues, "issue", "issues")} found`}
        </Text>
      </View>
      <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
        {ran} {plural(ran, "check", "checks")} run across {scanned}{" "}
        {plural(scanned, "transaction", "transactions")}
        {report.counts.skippedChecks > 0
          ? `, ${report.counts.skippedChecks} not run.`
          : "."}
      </Text>
    </View>
  );
}

/**
 * Every check, including the clean ones. "Eleven checks passed" is evidence;
 * "we found nothing" is a claim, and the two read very differently to someone
 * whose ledger was truncated a second ago.
 */
function CheckList({ checks }: { checks: LedgerAuditCheckResult[] }) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <View style={styles.checkList}>
      <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
        CHECKS
      </Text>
      {checks.map((check) => {
        const tone =
          check.status === "issues"
            ? ACCOUNT_RED
            : check.status === "skipped"
              ? theme.colors.mutedForeground
              : accountAccent(isDark);
        return (
          <View key={check.id} style={styles.checkRow}>
            <Text style={[styles.checkMark, { color: tone }]}>
              {check.status === "issues"
                ? "!"
                : check.status === "skipped"
                  ? "–"
                  : "✓"}
            </Text>
            <Text
              style={[styles.checkLabel, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {check.label}
            </Text>
            <Text style={[styles.checkStatus, { color: tone }]}>
              {check.status === "issues"
                ? `${check.findings.length}`
                : check.status === "skipped"
                  ? check.skippedReason === "offline_cache"
                    ? "offline"
                    : "not loaded"
                  : "clean"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function FindingCard({
  finding,
  currency,
  onShowInJournal,
}: {
  finding: LedgerAuditFinding;
  currency: string;
  onShowInJournal: (subject: LedgerAuditSubject) => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const chipColor =
    finding.severity === "error" ? ACCOUNT_RED : theme.colors.warning;
  const visible = finding.subjects.slice(0, MAX_SUBJECTS);
  const hidden = finding.subjects.length - visible.length;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.chip, { backgroundColor: `${chipColor}22` }]}>
          <Text style={[styles.chipText, { color: chipColor }]}>
            {finding.severity === "error" ? "Error" : "Check"}
          </Text>
        </View>
        {finding.field ? (
          <Text style={[styles.field, { color: theme.colors.mutedForeground }]}>
            {finding.field}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.message, { color: theme.colors.foreground }]}>
        {finding.message}
      </Text>

      {visible.map((subject) => (
        <Pressable
          key={`${subject.kind}-${subject.id}`}
          onPress={() => onShowInJournal(subject)}
          accessibilityRole="button"
          accessibilityLabel={`Show ${subject.label} in the Journal`}
          style={[
            styles.subject,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.03)"
                : "rgba(0,0,0,0.02)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.subjectText}>
            <Text
              style={[styles.subjectLabel, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {subject.label}
            </Text>
            {subject.date ? (
              <Text
                style={[styles.subjectDate, { color: theme.colors.mutedForeground }]}
              >
                {subject.date}
              </Text>
            ) : null}
          </View>
          {subject.amount !== undefined ? (
            <Amount
              value={subject.amount}
              currency={currency}
              ghostable
              style={[styles.subjectAmount, { color: theme.colors.foreground }]}
            />
          ) : null}
          <Text style={[styles.subjectLink, { color: theme.colors.primary }]}>
            Show
          </Text>
        </Pressable>
      ))}

      {hidden > 0 ? (
        <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
          and {hidden} more.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  staticBody: {
    gap: 12,
  },
  header: {
    gap: 8,
    marginBottom: 12,
  },
  pending: {
    gap: 8,
    marginTop: 8,
  },
  pendingLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  panel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  note: {
    fontSize: 11,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  checkList: {
    gap: 6,
    marginTop: 12,
    marginBottom: 24,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkMark: {
    fontSize: 12,
    fontWeight: "800",
    width: 12,
    textAlign: "center",
  },
  checkLabel: {
    flex: 1,
    fontSize: 12,
  },
  checkStatus: {
    fontSize: 11,
    fontWeight: "700",
  },
  card: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    gap: 8,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  field: {
    fontSize: 11,
    fontWeight: "600",
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
  },
  subject: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  subjectText: {
    flex: 1,
    gap: 2,
  },
  subjectLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  subjectDate: {
    fontSize: 11,
  },
  subjectAmount: {
    fontSize: 13,
    fontWeight: "700",
  },
  subjectLink: {
    fontSize: 11,
    fontWeight: "700",
  },
});

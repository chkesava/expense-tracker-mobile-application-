import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Calendar, Download, Wallet } from "lucide-react-native";

import { AccountsList } from "@/components/accounts/AccountsList";
import { CardsList } from "@/components/accounts/CardsList";
import { CreditCardBillsList } from "@/components/creditCardBills/CreditCardBillsList";
import { BorrowingsList } from "@/components/borrowings/BorrowingsList";
import { ReceivablesList } from "@/components/receivables/ReceivablesList";
import { SubscriptionsList } from "@/components/subscriptions/SubscriptionsList";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Skeleton } from "@/components/common/Skeleton";
import { AccountActivityFilterModal } from "@/components/accounts/AccountActivityFilterModal";
import {
  TransactionFilters,
  type ActivityFilter,
  type AccountActivityFilterField,
} from "@/components/accounts/TransactionFilters";
import { ExpenseList } from "@/components/ExpenseList";
import { JournalPeriodSummary } from "@/components/ledger/JournalPeriodSummary";
import { LedgerAuditList } from "@/components/ledger/LedgerAuditList";
import { LedgerHealthReport } from "@/components/ledger/LedgerHealthReport";
import {
  JournalReportWorkspace,
  type JournalExportFormat,
} from "@/components/ledger/JournalReportWorkspace";
import { AllSectionsSheet } from "@/components/ledger/AllSectionsSheet";
import { LedgerSectionTabs } from "@/components/ledger/LedgerSectionTabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useLedgerState, type LedgerTab } from "@/providers/LedgerStateProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  LEDGER_HUB_TAB_IDS,
  resolveLegacyLedgerTabRoute,
} from "@/shared/config/navigation";
import { currentMonthKey } from "@/shared/utils/dates";
import {
  createEmptyAccountActivityFilters,
  type AccountActivityFilters,
} from "@/shared/utils/accountActivityFilters";
import { applyAccountActivityFilters } from "@/shared/utils/accountActivityFilters";
import { searchAccountActivities } from "@/shared/utils/accountActivitySearch";
import { buildJournalRecords, type JournalScope } from "@/shared/utils/journalActivities";
import { resolveJournalDateScope } from "@/shared/utils/journalDateScope";
import {
  runJournalFilterPipeline,
  withJournalDateScope,
} from "@/shared/utils/journalFilterPipeline";
import type { JournalPeriodGranularity } from "@/shared/utils/journalPeriodSummary";
import { journalCashFlowById } from "@/shared/utils/journalRunningBalance";
import type { LedgerAuditSubject } from "@/shared/utils/ledgerAudit";
import { describeAccountActivityFilters } from "@/shared/utils/accountActivityFilterLabels";
import { buildJournalReport } from "@/shared/utils/journalReport";
import {
  exportJournalReportCsv,
  exportJournalReportPdf,
} from "@/services/ledger/journalReportDelivery";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { appDialog } from "@/lib/appDialog";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/**
 * SPENDLY-112 — the Audit sub-tab holds two different questions. The trail
 * answers "what changed"; the checks answer "what is wrong now".
 */
/** Above this many rows, laying out a PDF is slow enough to ask first. */
const LARGE_PDF_ROWS = 5000;

const AUDIT_VIEWS = [
  { id: "checks", label: "Checks" },
  { id: "trail", label: "Trail" },
] as const;

export default function LedgerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings } = useSettings();
  const {
    setIsAddExpenseOpen,
    globalMonth,
    setIsMonthDrawerOpen,
    setEditingExpense,
    setEditingIncome,
  } = useModals();
  const {
    ledgerTab,
    setLedgerTab,
    expensesTab,
    setExpensesTab,
    query,
    setQuery,
    journalFilters,
    setJournalFilters,
    showFilters,
    setShowFilters,
  } = useLedgerState();

  const {
    expenses,
    loading: expensesLoading,
    complete: expensesComplete,
    error: expensesError,
    retry: retryExpenses,
  } = useExpenses();
  const {
    incomes,
    loading: incomesLoading,
    complete: incomesComplete,
    error: incomesError,
    retry: retryIncomes,
  } = useIncomes();
  const { accounts } = useAccounts();
  // SPENDLY-111: the type name is what tells a credit card from a bank, so a
  // card purchase is never counted as cash leaving an account.
  const { accountTypes } = useAccountTypes();
  const displayCurrency = useDisplayCurrency();
  const { settings: systemSettings } = useSystemSettings();

  useEffect(() => {
    const remapped = resolveLegacyLedgerTabRoute(params.tab);
    if (remapped) {
      router.replace(remapped as never);
      return;
    }
    if (
      params.tab &&
      (LEDGER_HUB_TAB_IDS as readonly string[]).includes(params.tab)
    ) {
      setLedgerTab(params.tab as LedgerTab);
    }
  }, [params.tab, router, setLedgerTab]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    retryExpenses();
  };

  useEffect(() => {
    if (!expensesLoading && !incomesLoading) {
      setRefreshing(false);
    }
  }, [expensesLoading, incomesLoading]);

  const activeMonth = globalMonth || currentMonthKey(settings.timezone);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timeoutId);
  }, [query]);

  // Which canonical rows this sub-tab shows. `audit` and `data` are untouched
  // by SPENDLY-109 — the audit workspace belongs to SPENDLY-112.
  const journalScope: JournalScope =
    expensesTab === "income" ? "incomes" : "all";

  // The Journal contains no transfer rows by construction (one record per
  // expense and per income, nothing else), so offering a Transfers chip that
  // can only ever read zero would be misleading.
  const availableKinds: ActivityFilter[] = useMemo(
    () =>
      expensesTab === "income"
        ? []
        : (["all", "income", "expense"] as ActivityFilter[]),
    [expensesTab]
  );

  const [periodGranularity, setPeriodGranularity] =
    useState<JournalPeriodGranularity>("month");

  // SPENDLY-112 — which half of the Audit workspace is showing. Local to the
  // screen rather than the provider: unlike the sub-tab itself, there is
  // nothing here worth preserving across a hop to another hub tab.
  const [auditView, setAuditView] = useState<"checks" | "trail">("checks");

  const [showAllSections, setShowAllSections] = useState(false);

  /**
   * SPENDLY-112 — take the user from a finding to the transaction it is about.
   *
   * The Journal's search already matches raw document ids
   * (`accountActivitySearch.ts`), so this needs no change to `ExpenseList`.
   * The date range is not optional: without it the month pill would hide any
   * finding outside the selected month, which is most of them. A range
   * overrides the month by design (`resolveJournalDateScope`).
   */
  const handleShowInJournal = useCallback(
    (subject: LedgerAuditSubject) => {
      setJournalFilters({
        ...createEmptyAccountActivityFilters(),
        fromDate: subject.date ?? "",
        toDate: subject.date ?? "",
      });
      setQuery(subject.id);
      setExpensesTab("history");
    },
    [setJournalFilters, setQuery, setExpensesTab]
  );

  // One memo over the pure pipeline, so what ships is what the tests cover.
  const journal = useMemo(
    () =>
      runJournalFilterPipeline({
        expenses,
        incomes,
        accounts,
        accountTypes,
        query: debouncedQuery,
        filters: journalFilters,
        monthKey: activeMonth,
        scope: journalScope,
        granularity: periodGranularity,
        firstDayOfWeek: settings.firstDayOfWeek,
      }),
    [
      expenses,
      incomes,
      accounts,
      accountTypes,
      debouncedQuery,
      journalFilters,
      activeMonth,
      journalScope,
      periodGranularity,
      settings.firstDayOfWeek,
    ]
  );

  const filteredExpenses = journal.rows.expenses;
  const filteredIncomes = journal.rows.incomes;

  // The income sub-tab reads only incomes, so it must not wait on expenses.
  const ledgerComplete =
    expensesTab === "income"
      ? incomesComplete
      : expensesComplete && incomesComplete;

  const hasNarrowedView =
    journal.activeFilterCount > 0 || debouncedQuery.trim().length > 0;

  // SPENDLY-111: ExpenseList's own Spent/Income/Net card is superseded by
  // JournalPeriodSummary, which is rounded, scoped to the rows actually in
  // view, and refuses to render at all while the ledger is truncated. Showing
  // both would put two different Spent figures on one screen.
  const cashFlowById = useMemo(
    () => journalCashFlowById(journal.runningBalance),
    [journal.runningBalance]
  );

  // A kind carried over from another sub-tab can leave the list permanently
  // empty with no visible cause, so drop it when it is no longer offered.
  useEffect(() => {
    if (
      journalFilters.kind !== "all" &&
      !availableKinds.includes(journalFilters.kind)
    ) {
      setJournalFilters((previous) => ({ ...previous, kind: "all" }));
    }
  }, [availableKinds, journalFilters.kind, setJournalFilters]);

  const handleRemoveFilter = useCallback(
    (field: AccountActivityFilterField, value?: string) => {
      setJournalFilters((previous) => {
        switch (field) {
          case "kind":
            return { ...previous, kind: "all" };
          case "fromDate":
            return { ...previous, fromDate: "" };
          case "toDate":
            return { ...previous, toDate: "" };
          case "minAmount":
            return { ...previous, minAmount: "" };
          case "maxAmount":
            return { ...previous, maxAmount: "" };
          default:
            if (value === undefined) return previous;
            return {
              ...previous,
              [field]: (previous[field] as string[]).filter(
                (entry) => entry !== value
              ),
            };
        }
      });
    },
    [setJournalFilters]
  );

  const clearJournalFilters = useCallback(() => {
    setJournalFilters(createEmptyAccountActivityFilters());
    setQuery("");
  }, [setJournalFilters, setQuery]);

  /* ---- SPENDLY-113: reports and export ------------------------------- */

  const [exportBusy, setExportBusy] = useState<JournalExportFormat | null>(null);

  /**
   * A stamp captured on arrival so the memo below stays pure. The file gets a
   * fresh one at the moment of export, not the moment the tab was opened.
   */
  const [reportStamp, setReportStamp] = useState(() => new Date().toISOString());
  useEffect(() => {
    if (expensesTab === "data") setReportStamp(new Date().toISOString());
  }, [expensesTab]);

  // Gated on the tab so a multi-thousand-row build does not run on every
  // keystroke over on History.
  const reportResult = useMemo(
    () =>
      expensesTab === "data"
        ? buildJournalReport({
            runningBalance: journal.runningBalance,
            totals: journal.totals,
            periods: journal.periods,
            dateScope: journal.dateScope,
            // The *raw* filters, not `effectiveFilters`: the latter has the
            // resolved month range injected, so the header would list the
            // period twice and disagree with the chips on the History tab.
            filters: journalFilters,
            query: debouncedQuery,
            scope: journalScope,
            currency: displayCurrency,
            timezone: settings.timezone,
            generatedAt: reportStamp,
            readiness: { expensesComplete, incomesComplete },
          })
        : undefined,
    [
      expensesTab,
      journal,
      journalFilters,
      debouncedQuery,
      journalScope,
      displayCurrency,
      settings.timezone,
      reportStamp,
      expensesComplete,
      incomesComplete,
    ]
  );

  const reportFilterChips = useMemo(
    () => describeAccountActivityFilters(journalFilters),
    [journalFilters]
  );

  const handleExport = useCallback(
    async (format: JournalExportFormat) => {
      if (!systemSettings.allowDataExport) {
        appDialog.alert(
          "Export is turned off",
          "Data export is disabled for this account."
        );
        return;
      }

      // Rebuilt rather than reused, so the file's stamp is the moment of
      // export. It also re-runs the readiness gate against the latest flags.
      const fresh = buildJournalReport({
        runningBalance: journal.runningBalance,
        totals: journal.totals,
        periods: journal.periods,
        dateScope: journal.dateScope,
        filters: journalFilters,
        query: debouncedQuery,
        scope: journalScope,
        currency: displayCurrency,
        timezone: settings.timezone,
        generatedAt: new Date().toISOString(),
        readiness: { expensesComplete, incomesComplete },
      });

      if (fresh.status !== "ready") {
        appDialog.alert(
          "Still loading your full history",
          "Exports stay paused until the rest of your transactions load, so a file can never be missing rows."
        );
        return;
      }

      const run = async () => {
        setExportBusy(format);
        try {
          if (format === "csv") await exportJournalReportCsv(fresh.report);
          else await exportJournalReportPdf(fresh.report);
        } catch (error) {
          logError("journalReport.export", error, {
            format,
            rowCount: fresh.report.rowCount,
          });
          toast.error(friendlyErrorMessage(error));
        } finally {
          setExportBusy(null);
        }
        // No success toast: the share sheet resolving does not mean the user
        // saved anything.
      };

      // Laying out a very large PDF is the one path that can stall for seconds
      // with no way to cancel, so it asks first.
      if (format === "pdf" && fresh.report.rowCount > LARGE_PDF_ROWS) {
        appDialog.alert(
          "Large report",
          `This will lay out ${fresh.report.rowCount} transactions and may take a few seconds.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Continue", onPress: () => void run() },
          ]
        );
        return;
      }

      await run();
    },
    [
      systemSettings.allowDataExport,
      journal,
      journalFilters,
      debouncedQuery,
      journalScope,
      displayCurrency,
      settings.timezone,
      expensesComplete,
      incomesComplete,
    ]
  );

  // The sheet's live count must re-resolve the scope from the *draft*, because
  // the draft's own dates decide whether the month is still in force.
  const getFilterResultCount = useCallback(
    (draft: AccountActivityFilters) => {
      const records = buildJournalRecords(expenses, incomes, accounts, {
        scope: journalScope,
      });
      const searched = searchAccountActivities(records, debouncedQuery);
      const scope = resolveJournalDateScope(activeMonth, draft);
      return applyAccountActivityFilters(
        searched,
        withJournalDateScope(draft, scope)
      ).length;
    },
    [expenses, incomes, accounts, debouncedQuery, activeMonth, journalScope]
  );

  const sectionCounts = useMemo(
    () => ({
      expenses: journal.records.length,
      accounts: accounts.length,
    }),
    [journal.records.length, accounts.length]
  );

  // Keep `?tab=` honest so a shared or restored link reopens the same section.
  const selectSection = useCallback(
    (next: LedgerTab) => {
      if (next === ledgerTab) return;
      setLedgerTab(next);
      router.setParams({ tab: next });
    },
    [ledgerTab, setLedgerTab, router]
  );

  // Search/filters belong to the two transaction lists only. `audit` is
  // SPENDLY-112's workspace and `data` is unrelated.
  const isFilterableTab =
    ledgerTab === "expenses" &&
    (expensesTab === "history" || expensesTab === "income");

  const isExpenseListTab =
    ledgerTab === "expenses" &&
    (expensesTab === "history" || expensesTab === "income" || expensesTab === "audit");
  const isBorrowingsTab = ledgerTab === "borrowings";

  const pageHeader = (
      <PageHeader
        title="Money"
        subtitle="Activity, accounts & bills"
        icon={<Wallet size={22} color={isDark ? "#FFFFFF" : theme.colors.success} />}
      />
  );

  // A fixed-height sibling of the header, never inside a list: six of the seven
  // sections hand scrolling to an inner FlashList, so a nav that grew vertically
  // or lived in a ScrollView would unbound those lists.
  const sectionNav = (
    <LedgerSectionTabs
      section={ledgerTab}
      onSelect={selectSection}
      onOpenAllSections={() => setShowAllSections(true)}
      counts={sectionCounts}
    />
  );

  return (
    <PageShell
      scrollable={!isExpenseListTab && !isBorrowingsTab}
      listOwnsBottomInset
      contentContainerStyle={styles.container}
    >
      {isBorrowingsTab ? (
        // Borrowings injects the chrome as its list header, so the nav has to
        // travel with it or it would vanish on this tab alone.
        <BorrowingsList
          listHeader={
            <>
              {pageHeader}
              {sectionNav}
            </>
          }
        />
      ) : (
        <>
      {pageHeader}
      {sectionNav}

      {/* Tab: Expenses (Journal) */}
      {ledgerTab === "expenses" && (
        <View style={[styles.sectionContainer, isExpenseListTab && { flex: 1 }]}>
          {/* Sub-tab pills */}
          <View style={styles.subTabsRow}>
            {(["history", "income", "audit", "data"] as const).map((sub) => {
              const isActive = expensesTab === sub;
              return (
                <Pressable
                  key={sub}
                  onPress={() => setExpensesTab(sub)}
                  style={[
                    styles.subTabPill,
                    {
                      backgroundColor: isActive
                        ? theme.colors.primary
                        : isDark
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(0,0,0,0.04)",
                      borderColor: isActive
                        ? theme.colors.primary
                        : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.subTabText,
                      {
                        color: isActive
                          ? theme.colors.primaryForeground
                          : theme.colors.mutedForeground,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {sub.charAt(0).toUpperCase() + sub.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Search, filters & active month pill */}
          {isFilterableTab ? (
            <>
              <TransactionFilters
                title="Journal"
                filters={journalFilters}
                searchQuery={query}
                onSearchChange={setQuery}
                totalCount={journal.records.length}
                allCount={journal.kindCounts.all}
                incomeCount={journal.kindCounts.income}
                expenseCount={journal.kindCounts.expense}
                transferCount={journal.kindCounts.transfers}
                filteredCount={journal.filtered.length}
                activeFilterCount={journal.activeFilterCount}
                availableKinds={availableKinds}
                compact
                scopeLabel={
                  !ledgerComplete
                    ? "loaded so far"
                    : journal.dateScope.monthOverridden
                      ? "custom range"
                      : activeMonth
                }
                onKindChange={(kind) =>
                  setJournalFilters((previous) => ({ ...previous, kind }))
                }
                onOpenAdvanced={() => setShowFilters(true)}
                onRemoveFilter={handleRemoveFilter}
                onClearAll={clearJournalFilters}
                action={{
                  accessibilityLabel: "Export these transactions",
                  icon: (
                    <Download size={16} color={theme.colors.mutedForeground} />
                  ),
                  onPress: () => setExpensesTab("data"),
                }}
              />

              <Pressable
                onPress={() => {
                  // While a range is in force the pill's job is to get you back
                  // to month scope, not to open the month drawer.
                  if (journal.dateScope.monthOverridden) {
                    setJournalFilters((previous) => ({
                      ...previous,
                      fromDate: "",
                      toDate: "",
                    }));
                    return;
                  }
                  setIsMonthDrawerOpen(true);
                }}
                style={[
                  styles.monthPickerButton,
                  {
                    alignSelf: "flex-start",
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.04)",
                    borderColor: theme.colors.border,
                    opacity: journal.dateScope.monthOverridden ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  journal.dateScope.monthOverridden
                    ? `Month ${activeMonth} overridden by a date range. Tap to clear the range.`
                    : `Change month, currently ${activeMonth}`
                }
              >
                <Calendar size={16} color={theme.colors.primary} />
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    fontWeight: "700",
                    color: theme.colors.foreground,
                  }}
                >
                  {journal.dateScope.monthOverridden
                    ? `${activeMonth} · overridden`
                    : activeMonth}
                </Text>
              </Pressable>

              {journal.validationError ? (
                <Text
                  style={[
                    styles.noticeBody,
                    { color: theme.colors.destructive },
                  ]}
                >
                  {journal.validationError}
                </Text>
              ) : null}

              {/* Distinct from loading and from no-results: rows are shown, but
                  the ledger behind them is still a page. */}
              {!ledgerComplete && !expensesLoading && !incomesLoading ? (
                <View
                  style={[
                    styles.notice,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.warning,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.noticeTitle,
                      { color: theme.colors.foreground },
                    ]}
                  >
                    Still loading your full history
                  </Text>
                  <Text
                    style={[
                      styles.noticeBody,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    Showing your most recent transactions. Results may be
                    incomplete, and totals stay hidden, until the rest loads.
                  </Text>
                </View>
              ) : null}
              <JournalPeriodSummary
                totals={journal.totals}
                periods={journal.periods}
                granularity={periodGranularity}
                onGranularityChange={setPeriodGranularity}
                netCashFlow={journal.runningBalance.netCashFlow}
                complete={ledgerComplete}
              />
            </>
          ) : null}

          {expensesTab === "history" && (
            <View style={{ flex: 1 }}>
              {expensesLoading && filteredExpenses.length === 0 ? (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} height={64} borderRadius={theme.radius.lg} />
                  ))}
                </View>
              ) : expensesError && expenses.length === 0 ? (
                <PageListStateScroll>
                  <ErrorState
                    title="Couldn't load your transactions"
                    description={expensesError.message}
                    onRetry={expensesError.retryable ? retryExpenses : undefined}
                  />
                </PageListStateScroll>
              ) : hasNarrowedView && journal.filtered.length === 0 ? (
                <PageListStateScroll>
                  <EmptyState
                    illustration="general"
                    title={
                      ledgerComplete
                        ? "No transactions match"
                        : "No matches loaded yet"
                    }
                    description={
                      ledgerComplete
                        ? "Nothing in this view matches your search and filters. Try widening the date or amount range."
                        : "No matches in the transactions loaded so far — the rest of your history is still loading."
                    }
                    primaryAction={{
                      label: "Clear filters",
                      onPress: clearJournalFilters,
                    }}
                  />
                </PageListStateScroll>
              ) : (
                <ExpenseList
                  expenses={filteredExpenses}
                  incomes={filteredIncomes}
                  accounts={accounts}
                  showMonthSummary={false}
                  cashFlowById={ledgerComplete ? cashFlowById : undefined}
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  onEditExpense={(exp) => {
                    setEditingExpense(exp);
                    setIsAddExpenseOpen(true);
                  }}
                  onEditIncome={(inc) => {
                    setEditingIncome(inc);
                    setIsAddExpenseOpen(true);
                  }}
                />
              )}
            </View>
          )}

          {expensesTab === "income" && (
            <View style={{ flex: 1 }}>
              {incomesLoading && filteredIncomes.length === 0 ? (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} height={64} borderRadius={theme.radius.lg} />
                  ))}
                </View>
              ) : incomesError && incomes.length === 0 ? (
                <PageListStateScroll>
                  <ErrorState
                    title="Couldn't load your transactions"
                    description={incomesError.message}
                    onRetry={incomesError.retryable ? retryIncomes : undefined}
                  />
                </PageListStateScroll>
              ) : hasNarrowedView && journal.filtered.length === 0 ? (
                <PageListStateScroll>
                  <EmptyState
                    illustration="general"
                    title={
                      ledgerComplete
                        ? "No transactions match"
                        : "No matches loaded yet"
                    }
                    description={
                      ledgerComplete
                        ? "Nothing in this view matches your search and filters. Try widening the date or amount range."
                        : "No matches in the transactions loaded so far — the rest of your history is still loading."
                    }
                    primaryAction={{
                      label: "Clear filters",
                      onPress: clearJournalFilters,
                    }}
                  />
                </PageListStateScroll>
              ) : (
                <ExpenseList
                  expenses={[]}
                  incomes={filteredIncomes}
                  accounts={accounts}
                  showMonthSummary={false}
                  cashFlowById={ledgerComplete ? cashFlowById : undefined}
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  onEditIncome={(inc) => {
                    setEditingIncome(inc);
                    setIsAddExpenseOpen(true);
                  }}
                />
              )}
            </View>
          )}

          {expensesTab === "audit" ? (
            <View style={{ flex: 1, gap: 12 }}>
              <View style={styles.auditViewRow}>
                {AUDIT_VIEWS.map((view) => {
                  const isActive = auditView === view.id;
                  return (
                    <Pressable
                      key={view.id}
                      onPress={() => setAuditView(view.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      style={[
                        styles.auditViewChip,
                        {
                          backgroundColor: isActive
                            ? theme.colors.primary
                            : isDark
                              ? "rgba(255,255,255,0.05)"
                              : "rgba(0,0,0,0.04)",
                          borderColor: isActive
                            ? theme.colors.primary
                            : theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.auditViewText,
                          {
                            color: isActive
                              ? theme.colors.primaryForeground
                              : theme.colors.mutedForeground,
                          },
                        ]}
                      >
                        {view.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flex: 1 }}>
                {auditView === "checks" ? (
                  <LedgerHealthReport onShowInJournal={handleShowInJournal} />
                ) : (
                  <LedgerAuditList />
                )}
              </View>
            </View>
          ) : null}

          {expensesTab === "data" && (
            <JournalReportWorkspace
              report={
                reportResult?.status === "ready" ? reportResult.report : undefined
              }
              filterChips={reportFilterChips}
              searchQuery={debouncedQuery.trim()}
              exportAllowed={systemSettings.allowDataExport}
              busy={exportBusy}
              onExport={(format) => void handleExport(format)}
              onEditFilters={() => setExpensesTab("history")}
              onClearFilters={clearJournalFilters}
            />
          )}
        </View>
      )}

      {/* Tab: Accounts */}
      {ledgerTab === "accounts" && <AccountsList />}

      {/* Tab: Cards */}
      {ledgerTab === "cards" && <CardsList />}

      {/* Tab: Credit Card Bills */}
      {ledgerTab === "ccBills" && <CreditCardBillsList />}

      {/* Tab: Receivables */}
      {ledgerTab === "receivables" && <ReceivablesList />}

      {/* Tab: Subscriptions */}
      {ledgerTab === "subscriptions" && <SubscriptionsList />}
        </>
      )}

      <AccountActivityFilterModal
        visible={isFilterableTab && showFilters}
        filters={journalFilters}
        options={journal.filterOptions}
        onClose={() => setShowFilters(false)}
        onApply={(next) => {
          setJournalFilters(next);
          setShowFilters(false);
        }}
        getResultCount={getFilterResultCount}
      />

      <AllSectionsSheet
        isOpen={showAllSections}
        onClose={() => setShowAllSections(false)}
        section={ledgerTab}
        onSelect={selectSection}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 40,
  },
  sectionContainer: {
    gap: 16,
  },
  subTabsRow: {
    flexDirection: "row",
    gap: 8,
  },
  subTabPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  subTabText: {
    fontSize: 12,
  },
  auditViewRow: {
    flexDirection: "row",
    gap: 6,
  },
  auditViewChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  auditViewText: {
    fontSize: 11,
    fontWeight: "700",
  },
  itemList: {
    gap: 8,
  },
  searchAndMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notice: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  noticeBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  monthPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
    gap: 2,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 4,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  itemSubtitle: {
    fontSize: 11,
  },
});

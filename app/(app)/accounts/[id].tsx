import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Download, Scale as ScaleIcon } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountBalanceCard } from "@/components/accounts/AccountBalanceCard";
import { AccountActivityFilterModal } from "@/components/accounts/AccountActivityFilterModal";
import { AccountCreditHero } from "@/components/accounts/AccountCreditHero";
import { AccountHeader } from "@/components/accounts/AccountHeader";
import { AddAccountEntryModal } from "@/components/accounts/AddAccountEntryModal";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { PastBillingCycles } from "@/components/accounts/PastBillingCycles";
import { MonthlyStatementSummary } from "@/components/accounts/MonthlyStatementSummary";
import { AccountHealthCard } from "@/components/accounts/AccountHealthCard";
import { SpendingInsightsCard } from "@/components/accounts/SpendingInsightsCard";
import { BalanceTrendCard } from "@/components/accounts/BalanceTrendCard";
import { ActivityStatisticsCard } from "@/components/accounts/ActivityStatisticsCard";
import { DownloadStatementModal } from "@/components/accounts/DownloadStatementModal";
import { ReconcileAccountModal } from "@/components/accounts/ReconcileAccountModal";
import { appDialog } from "@/lib/appDialog";
import { friendlyErrorMessage, logWarning } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { RecordCashbackModal } from "@/components/accounts/RecordCashbackModal";
import { CreditStatementCard } from "@/components/accounts/CreditStatementCard";
import { SmsMatchingUnconfiguredText } from "@/components/accounts/SmsMatchingUnconfiguredText";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import {
  TransactionColumnHeaders,
  TransactionFilters,
  type AccountActivityFilterField,
  type ActivityFilter,
} from "@/components/accounts/TransactionFilters";
import { TransactionRow } from "@/components/accounts/TransactionRow";
import { ErrorState } from "@/components/common/ErrorState";
import { CreateCreditCardBillModal } from "@/components/creditCardBills/CreateCreditCardBillModal";
import { ReconcileStatementModal } from "@/components/creditCardBills/ReconcileStatementModal";
import {
  BOTTOM_NAV_BAR_HEIGHT,
  BOTTOM_NAV_FAB_GAP,
  BOTTOM_NAV_FAB_SIZE,
} from "@/components/layout/chrome";
import { haptic } from "@/lib/haptics";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAuth } from "@/providers/AuthProvider";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useReceivables } from "@/hooks/useReceivables";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { OPEN_BILL_STATUSES } from "@/shared/types/creditCardBill";
import type { AccountActivity, Expense, Income } from "@/shared/types/expense";
import {
  buildAccountActivities,
  computeBankBalance,
  computeOutstandingCredit,
  getCreditBillHistory,
} from "@/shared/utils/accountBalance";
import {
  formatCreditCardHeaderLine,
  smsMatchingUnconfiguredLabel,
} from "@/shared/utils/accountIdentity";
import {
  applyAccountActivityFilters,
  countActiveAccountActivityFilters,
  createEmptyAccountActivityFilters,
  enrichAccountActivities,
  getAccountActivityFilterOptions,
  type AccountActivityFilters,
} from "@/shared/utils/accountActivityFilters";
import { searchAccountActivities } from "@/shared/utils/accountActivitySearch";
import { computeAccountSpendingInsights } from "@/shared/utils/accountSpendingInsights";
import { computeAccountActivityStats } from "@/shared/utils/accountActivityStats";
import {
  buildAccountStatement,
  type AccountStatement,
  type AccountStatementMeta,
  type StatementPeriod,
} from "@/shared/utils/accountStatement";
import {
  exportStatementCsv,
  exportStatementPdf,
} from "@/services/accounts/accountStatementDelivery";
import { saveAccountReconciliation } from "@/services/accounts/accountReconciliationStore";
import type { AccountReconciliationResult } from "@/shared/utils/accountReconciliation";
import {
  buildAccountBalanceTrend,
  DEFAULT_BALANCE_TREND_PERIOD,
  type BalanceTrendPeriod,
} from "@/shared/utils/accountBalanceTrend";
import {
  computeAccountHealthMetrics,
  DEFAULT_ACCOUNT_HISTORY_WINDOW,
  type AccountHistoryWindow,
} from "@/shared/utils/accountHealth";
import {
  accountMonthDateRange,
  listAccountActivityMonths,
  summarizeAccountMonth,
} from "@/shared/utils/accountMonthSummary";
import { effectiveBalanceAsOfDate } from "@/shared/utils/accountBaseline";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  accountKindSubtitle,
  activitySubtypeLabel,
  activityTitle,
  formatActivityDateLabel,
} from "@/shared/utils/activityDisplay";
import { currentMonthKey, todayDateKey, toLocalDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

const WIDE_ROW_BREAKPOINT = 420;

function ActivitySeparator() {
  return <View style={styles.separator} />;
}

export default function AccountDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < WIDE_ROW_BREAKPOINT;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const { settings } = useSettings();
  const { settings: systemSettings } = useSystemSettings();
  const { user } = useAuth();
  const today = todayDateKey(settings.timezone);
  const { setEditingExpense, setEditingIncome } = useModals();

  const { accounts, loading: accountsLoading, error: accountsError, retry: retryAccounts } =
    useAccounts();
  const { accountTypes } = useAccountTypes();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { entries, addEntry } = useAccountEntries();
  const { payments } = useAccountPayments();
  const { transfers } = useAccountTransfers();
  const { borrowings, repayments: borrowingRepayments } = useBorrowings();
  const { bills } = useCreditCardBills();
  const { receivables, repayments: receivableRepayments } = useReceivables();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isCreateBillOpen, setIsCreateBillOpen] = useState(false);
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);
  const [isCashbackOpen, setIsCashbackOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isReconcileAccountOpen, setIsReconcileAccountOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activityFilters, setActivityFilters] = useState<AccountActivityFilters>(
    createEmptyAccountActivityFilters
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [historyWindow, setHistoryWindow] = useState<AccountHistoryWindow>(
    DEFAULT_ACCOUNT_HISTORY_WINDOW
  );
  const [trendPeriod, setTrendPeriod] = useState<BalanceTrendPeriod>(
    DEFAULT_BALANCE_TREND_PERIOD
  );
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  useEffect(() => {
    setActivityFilters(createEmptyAccountActivityFilters());
    setIsFilterModalOpen(false);
    setIsStatementOpen(false);
    setIsReconcileAccountOpen(false);
    setSearchQuery("");
    setSelectedMonth(null);
    setHistoryWindow(DEFAULT_ACCOUNT_HISTORY_WINDOW);
    setTrendPeriod(DEFAULT_BALANCE_TREND_PERIOD);
  }, [id]);

  // Same debounce the ledger screen uses: keep typing responsive without
  // re-filtering the whole activity list on every keystroke.
  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedSearchQuery(searchQuery), 150);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const account = useMemo(() => accounts.find((a) => a.id === id), [accounts, id]);

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  const accountNameById = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((a) => {
      map[a.id] = a.name;
    });
    return map;
  }, [accounts]);

  const typeName = useMemo(() => {
    if (!account) return "";
    return typeMap.get(account.typeId) || "Account";
  }, [account, typeMap]);

  const isCreditCard = getAccountKind(typeName) === "credit";
  const currency = displayCurrency;

  const bankBalance = useMemo(() => {
    if (!account || isCreditCard) return 0;
    return computeBankBalance(
      account,
      expenses,
      incomes,
      payments,
      entries,
      transfers,
      borrowings,
      borrowingRepayments,
      receivables,
      receivableRepayments,
      today
    );
  }, [
    account,
    isCreditCard,
    expenses,
    incomes,
    payments,
    entries,
    transfers,
    borrowings,
    borrowingRepayments,
    receivables,
    receivableRepayments,
    today,
  ]);

  const creditUsage = useMemo(() => {
    if (!account || !isCreditCard) return null;
    return computeOutstandingCredit(account, expenses, payments, bills, today);
  }, [account, isCreditCard, expenses, payments, bills, today]);

  const creditBillHistory = useMemo(() => {
    if (!account || !isCreditCard) return [];
    return getCreditBillHistory(account, expenses, payments, 4, bills, today);
  }, [account, isCreditCard, expenses, payments, bills, today]);

  const openStatementBill = useMemo(() => {
    if (!account || !isCreditCard) return null;
    return (
      bills
        .filter(
          (b) =>
            b.accountId === account.id && OPEN_BILL_STATUSES.includes(b.status)
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null
    );
  }, [account, isCreditCard, bills]);

  const allActivities = useMemo(() => {
    if (!account) return [];
    return buildAccountActivities(
      account,
      typeName,
      expenses,
      incomes,
      payments,
      entries,
      transfers,
      accountNameById,
      { borrowings, borrowingRepayments },
      { receivables, receivableRepayments }
    );
  }, [
    account,
    typeName,
    expenses,
    incomes,
    payments,
    entries,
    transfers,
    accountNameById,
    borrowings,
    borrowingRepayments,
    receivables,
    receivableRepayments,
  ]);

  // Past cycles get their own "Past Billing Cycles" section, so this list is
  // scoped to the open cycle for credit cards — otherwise it silently mixes
  // in every prior cycle's spend, which never reconciles with the "unbilled
  // this cycle" figure shown above it.
  const activities = useMemo(() => {
    if (isCreditCard && creditUsage) {
      return allActivities.filter((a) => a.date >= creditUsage.openCycleStart);
    }
    return allActivities;
  }, [allActivities, isCreditCard, creditUsage]);

  const filterableActivities = useMemo(
    () => enrichAccountActivities(activities, expenses, incomes, entries),
    [activities, entries, expenses, incomes]
  );

  const filterOptions = useMemo(
    () => getAccountActivityFilterOptions(filterableActivities),
    [filterableActivities]
  );

  // Search runs before the filters so the chip counts and the filter modal's
  // live result count describe the rows actually on screen. Filter *options*
  // still come from the full set above, so a search can never leave the modal
  // with empty pickers.
  const searchedActivities = useMemo(
    () => searchAccountActivities(filterableActivities, debouncedSearchQuery),
    [debouncedSearchQuery, filterableActivities]
  );

  const kindScopedActivities = useMemo(
    () =>
      applyAccountActivityFilters(searchedActivities, {
        ...activityFilters,
        kind: "all",
      }),
    [activityFilters, searchedActivities]
  );

  const activityKindCounts = useMemo(
    () =>
      kindScopedActivities.reduce(
        (counts, record) => {
          if (record.kind !== "other") counts[record.kind] += 1;
          return counts;
        },
        { income: 0, expense: 0, transfers: 0 }
      ),
    [kindScopedActivities]
  );

  const filteredActivities = useMemo(
    () =>
      applyAccountActivityFilters(searchedActivities, activityFilters).map(
        (record) => record.activity
      ),
    [activityFilters, searchedActivities]
  );

  // Health looks across the account's whole history, so unlike the statement
  // it must not use the card's cycle-scoped list — a 6-month window over one
  // billing cycle would be meaningless.
  const healthRecords = useMemo(
    () =>
      isCreditCard
        ? enrichAccountActivities(allActivities, expenses, incomes, entries)
        : filterableActivities,
    [allActivities, entries, expenses, filterableActivities, incomes, isCreditCard]
  );

  const healthMetrics = useMemo(
    () =>
      computeAccountHealthMetrics(healthRecords, historyWindow, {
        supportsRunningBalance: !isCreditCard,
      }),
    [healthRecords, historyWindow, isCreditCard]
  );

  const balanceTrend = useMemo(
    () =>
      buildAccountBalanceTrend(healthRecords, trendPeriod, {
        supportsRunningBalance: !isCreditCard,
        today,
      }),
    [healthRecords, isCreditCard, today, trendPeriod]
  );

  // Shares the health window and the same full-history records: the
  // previous-period comparison needs real months behind it.
  const spendingInsights = useMemo(
    () => computeAccountSpendingInsights(healthRecords, historyWindow),
    [healthRecords, historyWindow]
  );

  // Shares the health window and the same full-history records, so the counts
  // describe the same period as the metrics above them.
  const activityStats = useMemo(
    () => computeAccountActivityStats(healthRecords, historyWindow),
    [healthRecords, historyWindow]
  );

  const statementAccount = useMemo<AccountStatementMeta>(
    () => ({
      name: account?.displayName?.trim() || account?.name || "Account",
      institution: account?.institutionName?.trim() || undefined,
      last4: account?.last4?.trim() || undefined,
      typeLabel: accountKindSubtitle(isCreditCard, typeName),
      currency,
      timezone: settings.timezone || undefined,
    }),
    [account, currency, isCreditCard, settings.timezone, typeName]
  );

  // The statement covers the account's whole history, not the card's
  // cycle-scoped list: a statement for "last 3 months" over one billing cycle
  // would be missing most of what it claims to cover.
  const buildStatementForPeriod = useCallback(
    (period: StatementPeriod) =>
      buildAccountStatement(healthRecords, statementAccount, period, {
        supportsRunningBalance: !isCreditCard,
        generatedAt: today,
      }),
    [healthRecords, isCreditCard, statementAccount, today]
  );

  const onExportStatement = useCallback(
    async (statement: AccountStatement, format: "pdf" | "csv") => {
      try {
        if (format === "csv") await exportStatementCsv(statement);
        else await exportStatementPdf(statement);
      } catch (error) {
        logWarning("accountDetail.exportStatement", error, { format });
        appDialog.alert(
          "Couldn't create the statement",
          friendlyErrorMessage(error)
        );
      }
    },
    []
  );

  // Saving a reconciliation records what was found. It writes one audit
  // document and nothing else -- no balance moves, because reconciling is an
  // act of checking, not of correcting.
  const onSaveReconciliation = useCallback(
    async (result: AccountReconciliationResult, note: string) => {
      if (!account || !user?.uid || result.variance === undefined) return false;
      if (
        result.ledgerClosingBalance === undefined ||
        result.statementClosingBalance === undefined
      ) {
        return false;
      }
      try {
        await saveAccountReconciliation(user.uid, {
          accountId: account.id,
          fromDate: result.period.fromDate,
          toDate: result.period.toDate,
          statementClosingBalance: result.statementClosingBalance,
          ledgerClosingBalance: result.ledgerClosingBalance,
          variance: result.variance,
          status: result.status,
          matchedCount: result.matched.length,
          missingCount: result.missingInApp.length,
          extraCount: result.extraInApp.length,
          note,
        });
        toast.success("Reconciliation saved");
        return true;
      } catch (error) {
        logWarning("accountDetail.saveReconciliation", error);
        appDialog.alert(
          "Couldn't save the reconciliation",
          friendlyErrorMessage(error)
        );
        return false;
      }
    },
    [account, user?.uid]
  );

  // The correction is an ordinary account entry with the user's own reason on
  // it, recorded through the same path as any manual adjustment -- so it shows
  // up in the ledger as something a person did, and can be undone like one.
  const onRecordReconciliationAdjustment = useCallback(
    async (
      direction: "credit" | "debit",
      amount: number,
      date: string,
      note: string
    ) => {
      if (!account) return false;
      return addEntry(account.id, amount, direction, date, note);
    },
    [account, addEntry]
  );

  const selectedInsightCategory =
    activityFilters.categories.length === 1
      ? activityFilters.categories[0]
      : undefined;

  // Tapping a category drives the SPENDLY-82 category filter rather than a
  // second scoping mechanism, so the active-filter chips stay truthful.
  const onSelectInsightCategory = useCallback((category: string) => {
    setActivityFilters((previous) =>
      previous.categories.length === 1 && previous.categories[0] === category
        ? { ...previous, categories: [] }
        : { ...previous, categories: [category] }
    );
  }, []);

  // Built from the same (cycle-scoped, for cards) list the transactions below
  // come from, so the statement and the list always reconcile and every month
  // offered here can actually be drilled into.
  const statementMonths = useMemo(
    () => listAccountActivityMonths(filterableActivities),
    [filterableActivities]
  );

  const activeMonth = useMemo(() => {
    if (selectedMonth && statementMonths.includes(selectedMonth)) {
      return selectedMonth;
    }
    return statementMonths[0] ?? currentMonthKey();
  }, [selectedMonth, statementMonths]);

  const monthSummary = useMemo(
    () =>
      summarizeAccountMonth(filterableActivities, activeMonth, {
        // A card's outstanding is a liability, never a bank balance.
        supportsRunningBalance: !isCreditCard,
      }),
    [activeMonth, filterableActivities, isCreditCard]
  );

  const monthIndex = statementMonths.indexOf(activeMonth);
  const monthRange = useMemo(
    () => accountMonthDateRange(activeMonth),
    [activeMonth]
  );
  const isMonthDrilledDown =
    activityFilters.fromDate === monthRange.fromDate &&
    activityFilters.toDate === monthRange.toDate;

  const onSelectAdjacentMonth = useCallback(
    (delta: number) => {
      setSelectedMonth((previous) => {
        const current = previous ?? statementMonths[0];
        const index = statementMonths.indexOf(current ?? "");
        const next = statementMonths[index + delta];
        return next ?? previous ?? null;
      });
    },
    [statementMonths]
  );

  // Drill-down reuses the SPENDLY-82 date filters rather than adding a second
  // way to scope the list, so the active-filter chips stay truthful.
  const onToggleMonthDrillDown = useCallback(() => {
    setActivityFilters((previous) =>
      previous.fromDate === monthRange.fromDate &&
      previous.toDate === monthRange.toDate
        ? { ...previous, fromDate: "", toDate: "" }
        : { ...previous, fromDate: monthRange.fromDate, toDate: monthRange.toDate }
    );
  }, [monthRange]);

  const activeFilterCount = countActiveAccountActivityFilters(activityFilters);

  const getFilterResultCount = useCallback(
    (filters: AccountActivityFilters) =>
      applyAccountActivityFilters(searchedActivities, filters).length,
    [searchedActivities]
  );

  const onKindChange = useCallback((kind: ActivityFilter) => {
    setActivityFilters((previous) => ({ ...previous, kind }));
  }, []);

  const onRemoveFilter = useCallback(
    (field: AccountActivityFilterField, value?: string) => {
      setActivityFilters((previous) => {
        if (field === "kind") return { ...previous, kind: "all" };
        if (
          field === "fromDate" ||
          field === "toDate" ||
          field === "minAmount" ||
          field === "maxAmount"
        ) {
          return { ...previous, [field]: "" };
        }
        if (field === "specialKinds") {
          return {
            ...previous,
            specialKinds: previous.specialKinds.filter((item) => item !== value),
          };
        }
        if (field === "categories") {
          return {
            ...previous,
            categories: previous.categories.filter((item) => item !== value),
          };
        }
        if (field === "counterparties") {
          return {
            ...previous,
            counterparties: previous.counterparties.filter(
              (item) => item !== value
            ),
          };
        }
        if (field === "tags") {
          return {
            ...previous,
            tags: previous.tags.filter((item) => item !== value),
          };
        }
        return {
          ...previous,
          statuses: previous.statuses.filter((item) => item !== value),
        };
      });
    },
    []
  );

  const clearActivityFilters = useCallback(() => {
    setActivityFilters(createEmptyAccountActivityFilters());
  }, []);

  const expenseById = useMemo(() => {
    const map = new Map<string, Expense>();
    for (const expense of expenses) {
      if (expense.id) map.set(expense.id, expense);
    }
    return map;
  }, [expenses]);

  const incomeById = useMemo(() => {
    const map = new Map<string, Income>();
    for (const income of incomes) {
      if (income.id) map.set(income.id, income);
    }
    return map;
  }, [incomes]);

  const onPressActivity = useCallback(
    (activityId: string) => {
      const act = activities.find((item) => item.id === activityId);
      if (!act) return;
      if (act.linkedExpenseId) {
        const expense = expenseById.get(act.linkedExpenseId);
        if (expense) setEditingExpense(expense);
        return;
      }
      if (act.linkedIncomeId) {
        const income = incomeById.get(act.linkedIncomeId);
        if (income) setEditingIncome(income);
      }
    },
    [activities, expenseById, incomeById, setEditingExpense, setEditingIncome]
  );

  const renderItem = useCallback(
    ({ item }: { item: AccountActivity }) => (
      <TransactionRow
        id={item.id}
        title={activityTitle(item)}
        subtype={activitySubtypeLabel(item)}
        isCredit={item.type === "credit"}
        dateLabel={formatActivityDateLabel(item.date)}
        timeLabel={item.time}
        amount={item.amount}
        runningBalance={item.runningBalance}
        currency={currency}
        compact={compact}
        showRunningBalance={!isCreditCard}
        onPress={onPressActivity}
      />
    ),
    [compact, currency, isCreditCard, onPressActivity]
  );

  const keyExtractor = useCallback((item: AccountActivity) => item.id, []);

  const pastCycleItems = useMemo(() => {
    if (!account || !isCreditCard) return [];
    const billById = new Map(bills.map((bill) => [bill.id, bill]));
    return creditBillHistory.map((cycle) => {
      const matched = cycle.billId ? billById.get(cycle.billId) : undefined;
      return {
        id: cycle.id,
        rangeLabel: `${toLocalDateKey(cycle.cycleStart)} → ${toLocalDateKey(cycle.cycleEnd)}`,
        billedAmount: cycle.billedAmount,
        paidAmount: cycle.paidAmount,
        remainingAmount: cycle.outstandingAmount,
        paymentDate: matched?.paymentDate,
        status: cycle.status,
        cashbackApplied: cycle.cashbackApplied,
        overdue: matched?.status === "OVERDUE" && cycle.outstandingAmount > 0,
        billId: cycle.billId,
      };
    });
  }, [account, isCreditCard, creditBillHistory, bills]);

  const onRecordBillPayment = useCallback(() => {
    if (openStatementBill) {
      router.push(`/credit-card-bills/${openStatementBill.id}` as never);
      return;
    }
    setIsPayModalOpen(true);
  }, [openStatementBill, router]);

  const onOpenStatementBill = useCallback(() => {
    if (!openStatementBill) return;
    router.push(`/credit-card-bills/${openStatementBill.id}` as never);
  }, [openStatementBill, router]);

  const onOpenBillingCycle = useCallback(
    (billId: string) => {
      void haptic.selection();
      router.push(`/credit-card-bills/${billId}` as never);
    },
    [router]
  );

  const listPaddingBottom =
    insets.bottom + BOTTOM_NAV_BAR_HEIGHT + BOTTOM_NAV_FAB_GAP + BOTTOM_NAV_FAB_SIZE + 20;

  if (!account) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <AccountHeader
          title="Account"
          subtitle=""
          onBack={() => router.back()}
        />
        <View style={styles.missing}>
          {accountsError ? (
            <ErrorState
              title="Couldn't load this account"
              description={accountsError.message}
              onRetry={accountsError.retryable ? retryAccounts : undefined}
            />
          ) : accountsLoading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <Text
                style={{
                  fontSize: theme.typography.lg,
                  color: theme.colors.mutedForeground,
                }}
              >
                Account not found
              </Text>
              <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
                <Text
                  style={{
                    fontSize: theme.typography.sm,
                    fontWeight: "700",
                    color: theme.colors.primary,
                  }}
                >
                  Go Back
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  const listHeader = (
    <View style={styles.headerBlock}>
      {isCreditCard && creditUsage ? (
        <AccountCreditHero
          usedThisCycle={creditUsage.unbilledSpend}
          statementDue={creditUsage.statementDue}
          cancelledSpend={creditUsage.cancelledSpend}
          cashbackThisCycle={creditUsage.cashbackThisCycle}
          totalOutstanding={creditUsage.totalOutstanding}
          availableCredit={creditUsage.availableCredit}
          creditLimit={account.creditLimit || 0}
          daysRemaining={creditUsage.daysRemaining}
          currency={currency}
          payLabel="Record Bill Payment"
          onPay={onRecordBillPayment}
        />
      ) : (
        <AccountBalanceCard
          availableBalance={bankBalance}
          currency={currency}
          openingBalance={account.openingBalance || 0}
          baselineLabel={
            effectiveBalanceAsOfDate(
              account.balanceAsOfDate,
              [],
              today
            ) || "Creation"
          }
          onTransfer={() => setIsTransferModalOpen(true)}
          onAdjust={() => setIsEntryModalOpen(true)}
        />
      )}

      {isCreditCard ? (
        <>
          <CreditStatementCard
            bill={openStatementBill}
            currency={currency}
            onAdd={() => setIsCreateBillOpen(true)}
            onOpen={onOpenStatementBill}
          />
          <View style={styles.cardActionRow}>
            <Pressable
              onPress={() => {
                void haptic.selection();
                setIsReconcileOpen(true);
              }}
              style={({ pressed }) => [
                styles.reconcileBtn,
                styles.cardActionItem,
                {
                  backgroundColor: isDark ? "#10141C" : theme.colors.card,
                  borderColor: isDark
                    ? "rgba(148, 163, 184, 0.12)"
                    : theme.colors.border,
                },
                pressed ? styles.reconcilePressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reconcile statement"
            >
              <Text style={[styles.reconcileLabel, { color: theme.colors.primary }]}>
                Reconcile statement
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void haptic.selection();
                setIsCashbackOpen(true);
              }}
              style={({ pressed }) => [
                styles.reconcileBtn,
                styles.cardActionItem,
                {
                  backgroundColor: isDark ? "#10141C" : theme.colors.card,
                  borderColor: isDark
                    ? "rgba(148, 163, 184, 0.12)"
                    : theme.colors.border,
                },
                pressed ? styles.reconcilePressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Record cashback"
            >
              <Text style={[styles.reconcileLabel, { color: theme.colors.primary }]}>
                Record cashback
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {isCreditCard ? (
        <PastBillingCycles
          cycles={pastCycleItems}
          currency={currency}
          onOpenCycle={onOpenBillingCycle}
        />
      ) : null}

      <AccountHealthCard
        metrics={healthMetrics}
        currency={currency}
        currentBalance={isCreditCard ? undefined : bankBalance}
        currentBalanceLabel={isCreditCard ? "Outstanding" : "Current balance"}
        window={historyWindow}
        onWindowChange={setHistoryWindow}
      />

      <BalanceTrendCard
        trend={balanceTrend}
        currency={currency}
        period={trendPeriod}
        onPeriodChange={setTrendPeriod}
        unavailableReason={
          isCreditCard
            ? "A card's outstanding is a liability, not a running balance, so there is no balance to chart."
            : "No balance history is available for this period yet."
        }
      />

      <SpendingInsightsCard
        insights={spendingInsights}
        currency={currency}
        selectedCategory={selectedInsightCategory}
        onSelectCategory={onSelectInsightCategory}
      />

      <ActivityStatisticsCard stats={activityStats} />

      <View style={styles.cardActionRow}>
      <Pressable
        onPress={() => {
          void haptic.selection();
          setIsStatementOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Download statement"
        style={({ pressed }) => [
          styles.statementBtn,
          {
            backgroundColor: isDark ? "#10141C" : theme.colors.card,
            borderColor: isDark
              ? "rgba(148, 163, 184, 0.12)"
              : theme.colors.border,
          },
          pressed ? styles.reconcilePressed : null,
        ]}
      >
        <Download size={17} color={theme.colors.primary} />
        <Text style={[styles.reconcileLabel, { color: theme.colors.primary }]}>
          Download statement
        </Text>
      </Pressable>

      {isCreditCard ? null : (
        <Pressable
          onPress={() => {
            void haptic.selection();
            setIsReconcileAccountOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Reconcile account"
          style={({ pressed }) => [
            styles.statementBtn,
            {
              backgroundColor: isDark ? "#10141C" : theme.colors.card,
              borderColor: isDark
                ? "rgba(148, 163, 184, 0.12)"
                : theme.colors.border,
            },
            pressed ? styles.reconcilePressed : null,
          ]}
        >
          <ScaleIcon size={17} color={theme.colors.primary} />
          <Text style={[styles.reconcileLabel, { color: theme.colors.primary }]}>
            Reconcile account
          </Text>
        </Pressable>
      )}
      </View>

      {statementMonths.length > 0 ? (
        <MonthlyStatementSummary
          summary={monthSummary}
          currency={currency}
          canGoOlder={monthIndex >= 0 && monthIndex < statementMonths.length - 1}
          canGoNewer={monthIndex > 0}
          onOlder={() => onSelectAdjacentMonth(1)}
          onNewer={() => onSelectAdjacentMonth(-1)}
          onDrillDown={onToggleMonthDrillDown}
          isDrilledDown={isMonthDrilledDown}
        />
      ) : null}

      <TransactionFilters
        filters={activityFilters}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={activities.length}
        allCount={kindScopedActivities.length}
        incomeCount={activityKindCounts.income}
        expenseCount={activityKindCounts.expense}
        transferCount={activityKindCounts.transfers}
        filteredCount={filteredActivities.length}
        activeFilterCount={activeFilterCount}
        compact={compact}
        onKindChange={onKindChange}
        onOpenAdvanced={() => setIsFilterModalOpen(true)}
        onRemoveFilter={onRemoveFilter}
        onClearAll={clearActivityFilters}
        scopeLabel={isCreditCard ? "this cycle" : undefined}
      />
      {compact ? null : (
        <TransactionColumnHeaders showBalanceAfter={!isCreditCard} />
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AccountHeader
        title={account.name}
        subtitle={
          isCreditCard
            ? formatCreditCardHeaderLine(account)
            : accountKindSubtitle(isCreditCard, typeName)
        }
        variant={isCreditCard ? "credit" : "default"}
        accentColor={account.color}
        warning={
          smsMatchingUnconfiguredLabel(account, typeName) ? (
            <SmsMatchingUnconfiguredText account={account} typeName={typeName} />
          ) : undefined
        }
        onBack={() => router.back()}
        onEdit={() => {
          haptic.light().catch(() => undefined);
          setIsEditModalOpen(true);
        }}
      />

      <FlashList
        style={styles.list}
        data={filteredActivities}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.sm,
              }}
            >
              {debouncedSearchQuery.trim()
                ? activeFilterCount > 0
                  ? "No activities match this search and these filters."
                  : "No activities match this search."
                : activeFilterCount > 0
                  ? "No activities match these filters."
                  : "No activities found for this account."}
            </Text>
            {debouncedSearchQuery.trim() ? (
              <Pressable
                onPress={() => {
                  haptic.selection();
                  setSearchQuery("");
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
                style={{ marginTop: 10 }}
              >
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontSize: theme.typography.sm,
                    fontFamily: theme.fontFamily.medium,
                  }}
                >
                  Clear search
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={ActivitySeparator}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: listPaddingBottom,
        }}
        extraData={`${JSON.stringify(activityFilters)}-${debouncedSearchQuery}-${compact}-${isDark}-${openStatementBill?.id ?? ""}-${pastCycleItems.length}`}
      />

      <EditAccountModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        account={account}
      />
      <TransferFundsModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        defaultFromAccountId={account.id}
        accounts={accounts}
      />
      <AddAccountEntryModal
        isOpen={isEntryModalOpen}
        onClose={() => setIsEntryModalOpen(false)}
        defaultAccountId={account.id}
        accounts={accounts}
      />
      <PayCreditBillModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        defaultCreditCardId={account.id}
        accounts={accounts}
        accountTypes={accountTypes}
        defaultAmount={
          creditUsage && creditUsage.oldestOpenRemaining > 0
            ? creditUsage.oldestOpenRemaining
            : openStatementBill?.remainingAmount
        }
        applyToBillId={
          creditUsage?.oldestOpenBillId || openStatementBill?.id
        }
      />
      <CreateCreditCardBillModal
        isOpen={isCreateBillOpen}
        onClose={() => setIsCreateBillOpen(false)}
        accounts={accounts}
        accountTypes={accountTypes}
        defaultAccountId={account.id}
      />
      <RecordCashbackModal
        isOpen={isCashbackOpen}
        onClose={() => setIsCashbackOpen(false)}
        defaultCreditCardId={account.id}
        accounts={accounts}
        accountTypes={accountTypes}
      />
      <ReconcileStatementModal
        visible={isReconcileOpen}
        onClose={() => setIsReconcileOpen(false)}
        accountId={account.id}
        accountName={account.name}
        currency={currency}
        openBill={openStatementBill}
        usedThisCycle={creditUsage?.usedThisCycle ?? 0}
      />
      <AccountActivityFilterModal
        visible={isFilterModalOpen}
        filters={activityFilters}
        options={filterOptions}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={setActivityFilters}
        getResultCount={getFilterResultCount}
      />

      <DownloadStatementModal
        visible={isStatementOpen}
        onClose={() => setIsStatementOpen(false)}
        today={today}
        currency={currency}
        buildStatement={buildStatementForPeriod}
        onExport={onExportStatement}
        exportAllowed={systemSettings.allowDataExport}
      />

      <ReconcileAccountModal
        visible={isReconcileAccountOpen}
        onClose={() => setIsReconcileAccountOpen(false)}
        today={today}
        currency={currency}
        records={healthRecords}
        buildStatement={buildStatementForPeriod}
        onSave={onSaveReconciliation}
        onRecordAdjustment={onRecordReconciliationAdjustment}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  headerBlock: {
    gap: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  separator: {
    height: 8,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
  },
  cardActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  cardActionItem: {
    flex: 1,
  },
  reconcileBtn: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  statementBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
  },
  reconcileLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  reconcilePressed: {
    opacity: 0.86,
  },
});

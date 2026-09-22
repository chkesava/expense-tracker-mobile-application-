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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountBalanceCard } from "@/components/accounts/AccountBalanceCard";
import { AccountActivityFilterModal } from "@/components/accounts/AccountActivityFilterModal";
import { AccountCreditHero } from "@/components/accounts/AccountCreditHero";
import { AccountHeader } from "@/components/accounts/AccountHeader";
import { AddAccountEntryModal } from "@/components/accounts/AddAccountEntryModal";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { PastBillingCycles } from "@/components/accounts/PastBillingCycles";
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
import { effectiveBalanceAsOfDate } from "@/shared/utils/accountBaseline";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  accountKindSubtitle,
  activitySubtypeLabel,
  activityTitle,
  formatActivityDateLabel,
} from "@/shared/utils/activityDisplay";
import { todayDateKey, toLocalDateKey } from "@/shared/utils/dates";
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
  const today = todayDateKey(settings.timezone);
  const { setEditingExpense, setEditingIncome } = useModals();

  const { accounts, loading: accountsLoading, error: accountsError, retry: retryAccounts } =
    useAccounts();
  const { accountTypes } = useAccountTypes();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { entries } = useAccountEntries();
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
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activityFilters, setActivityFilters] = useState<AccountActivityFilters>(
    createEmptyAccountActivityFilters
  );

  useEffect(() => {
    setActivityFilters(createEmptyAccountActivityFilters());
    setIsFilterModalOpen(false);
  }, [id]);

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

  const kindScopedActivities = useMemo(
    () =>
      applyAccountActivityFilters(filterableActivities, {
        ...activityFilters,
        kind: "all",
      }),
    [activityFilters, filterableActivities]
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
      applyAccountActivityFilters(filterableActivities, activityFilters).map(
        (record) => record.activity
      ),
    [activityFilters, filterableActivities]
  );

  const activeFilterCount = countActiveAccountActivityFilters(activityFilters);

  const getFilterResultCount = useCallback(
    (filters: AccountActivityFilters) =>
      applyAccountActivityFilters(filterableActivities, filters).length,
    [filterableActivities]
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

      <TransactionFilters
        filters={activityFilters}
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
              {activeFilterCount > 0
                ? "No activities match these filters."
                : "No activities found for this account."}
            </Text>
          </View>
        }
        ItemSeparatorComponent={ActivitySeparator}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: listPaddingBottom,
        }}
        extraData={`${JSON.stringify(activityFilters)}-${compact}-${isDark}-${openStatementBill?.id ?? ""}-${pastCycleItems.length}`}
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
  reconcileLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  reconcilePressed: {
    opacity: 0.86,
  },
});

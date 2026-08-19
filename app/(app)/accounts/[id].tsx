import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { AccountBalanceCard } from "@/components/accounts/AccountBalanceCard";
import { AccountCreditHero } from "@/components/accounts/AccountCreditHero";
import { AccountHeader } from "@/components/accounts/AccountHeader";
import { AddAccountEntryModal } from "@/components/accounts/AddAccountEntryModal";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { SmsMatchingUnconfiguredText } from "@/components/accounts/SmsMatchingUnconfiguredText";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import {
  TransactionColumnHeaders,
  TransactionFilters,
  type ActivityFilter,
} from "@/components/accounts/TransactionFilters";
import { TransactionRow } from "@/components/accounts/TransactionRow";
import { CreateCreditCardBillModal } from "@/components/creditCardBills/CreateCreditCardBillModal";
import { Amount } from "@/components/common/Amount";
import {
  BOTTOM_NAV_BAR_HEIGHT,
  BOTTOM_NAV_FAB_GAP,
  BOTTOM_NAV_FAB_SIZE,
} from "@/components/layout/chrome";
import { Card } from "@/components/ui/Card";
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
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { OPEN_BILL_STATUSES } from "@/shared/types/creditCardBill";
import type { AccountActivity, Expense, Income } from "@/shared/types/expense";
import {
  buildAccountActivities,
  computeBankBalance,
  computeCreditUsage,
  getCreditBillHistory,
} from "@/shared/utils/accountBalance";
import { smsMatchingUnconfiguredLabel } from "@/shared/utils/accountIdentity";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  accountKindSubtitle,
  activitySubtypeLabel,
  activityTitle,
  formatActivityDateLabel,
} from "@/shared/utils/activityDisplay";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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
  const { settings: system } = useSystemSettings();
  const { setEditingExpense, setEditingIncome } = useModals();

  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { entries } = useAccountEntries();
  const { payments } = useAccountPayments();
  const { transfers } = useAccountTransfers();
  const { borrowings, repayments: borrowingRepayments } = useBorrowings();
  const { bills, applyPaymentToBill } = useCreditCardBills();
  const { receivables, repayments: receivableRepayments } = useReceivables();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isCreateBillOpen, setIsCreateBillOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

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
  const currency = system.defaultCurrency;

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
      receivableRepayments
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
  ]);

  const creditUsage = useMemo(() => {
    if (!account || !isCreditCard) return null;
    return computeCreditUsage(account, expenses, payments);
  }, [account, isCreditCard, expenses, payments]);

  const creditBillHistory = useMemo(() => {
    if (!account || !isCreditCard) return [];
    return getCreditBillHistory(account, expenses, payments, 4);
  }, [account, isCreditCard, expenses, payments]);

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

  const activities = useMemo(() => {
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

  const debitCount = useMemo(
    () => activities.reduce((sum, act) => sum + (act.type === "debit" ? 1 : 0), 0),
    [activities]
  );
  const creditCount = activities.length - debitCount;

  const filteredActivities = useMemo(() => {
    if (activityFilter === "all") return activities;
    return activities.filter((a) => a.type === activityFilter);
  }, [activities, activityFilter]);

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
        </View>
      </View>
    );
  }

  const listHeader = (
    <View style={styles.headerBlock}>
      {isCreditCard && creditUsage ? (
        <AccountCreditHero
          usedThisCycle={creditUsage.usedThisCycle}
          availableCredit={creditUsage.availableCredit}
          creditLimit={account.creditLimit || 0}
          daysRemaining={creditUsage.daysRemaining}
          currency={currency}
          payLabel={openStatementBill ? "Pay Bill" : "Record Bill Payment"}
          onPay={() => {
            if (openStatementBill) {
              router.push(`/credit-card-bills/${openStatementBill.id}` as never);
              return;
            }
            setIsPayModalOpen(true);
          }}
        />
      ) : (
        <AccountBalanceCard
          availableBalance={bankBalance}
          currency={currency}
          openingBalance={account.openingBalance || 0}
          baselineLabel={account.balanceAsOfDate || "Creation"}
          onTransfer={() => setIsTransferModalOpen(true)}
          onAdjust={() => setIsEntryModalOpen(true)}
        />
      )}

      {isCreditCard ? (
        <Card>
          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
                fontWeight: "700",
                textTransform: "uppercase",
              }}
            >
              Statement Bill
            </Text>
            {openStatementBill ? (
              <>
                <View style={styles.billRow}>
                  <Text style={{ color: theme.colors.mutedForeground }}>Statement</Text>
                  <Amount value={openStatementBill.statementAmount} ghostable />
                </View>
                <View style={styles.billRow}>
                  <Text style={{ color: theme.colors.mutedForeground }}>Minimum Due</Text>
                  <Amount value={openStatementBill.minimumDueAmount} ghostable />
                </View>
                <View style={styles.billRow}>
                  <Text style={{ color: theme.colors.mutedForeground }}>Due</Text>
                  <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
                    {openStatementBill.dueDate}
                  </Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={{ color: theme.colors.mutedForeground }}>Status</Text>
                  <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
                    {openStatementBill.status.replaceAll("_", " ")}
                  </Text>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setIsCreateBillOpen(true);
                }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>
                  + Add statement bill for reminders
                </Text>
              </Pressable>
            )}
          </View>
        </Card>
      ) : null}

      {isCreditCard && creditBillHistory.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.xs,
              fontWeight: "800",
              letterSpacing: 0.8,
            }}
          >
            PAST BILLING CYCLES
          </Text>
          {creditBillHistory.map((bill) => (
            <Card
              key={bill.id}
              style={[
                styles.billCard,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    fontWeight: "700",
                    fontSize: theme.typography.sm,
                    color: theme.colors.foreground,
                  }}
                >
                  {formatDateKey(bill.cycleStart)} → {formatDateKey(bill.cycleEnd)}
                </Text>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Billed: {currency} {bill.billedAmount.toLocaleString()} • Paid:{" "}
                  {currency} {bill.paidAmount.toLocaleString()}
                </Text>
              </View>
              <View
                style={[
                  styles.billStatusBadge,
                  {
                    backgroundColor:
                      bill.status === "paid"
                        ? "rgba(34, 197, 94, 0.15)"
                        : "rgba(239, 68, 68, 0.15)",
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    color:
                      bill.status === "paid"
                        ? theme.colors.success
                        : theme.colors.destructive,
                    textTransform: "uppercase",
                  }}
                >
                  {bill.status}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <TransactionFilters
        filter={activityFilter}
        allCount={activities.length}
        debitCount={debitCount}
        creditCount={creditCount}
        compact={compact}
        onChange={setActivityFilter}
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
        subtitle={accountKindSubtitle(isCreditCard, typeName)}
        warning={
          smsMatchingUnconfiguredLabel(account, typeName) ? (
            <SmsMatchingUnconfiguredText account={account} typeName={typeName} />
          ) : undefined
        }
        onBack={() => router.back()}
        onEdit={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
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
              No activities found for this account.
            </Text>
          </View>
        }
        ItemSeparatorComponent={ActivitySeparator}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: listPaddingBottom,
        }}
        extraData={`${activityFilter}-${compact}-${isDark}`}
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
        defaultAmount={openStatementBill?.remainingAmount}
        onPaid={async (amount, paymentDate) => {
          if (openStatementBill) {
            await applyPaymentToBill(openStatementBill.id, amount, paymentDate);
          }
        }}
      />
      <CreateCreditCardBillModal
        isOpen={isCreateBillOpen}
        onClose={() => setIsCreateBillOpen(false)}
        accounts={accounts}
        accountTypes={accountTypes}
        defaultAccountId={account.id}
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
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  billCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  billStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
  },
});

import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  ArrowLeftRight,
  ChevronRight,
  CreditCard,
  Landmark,
  Plus,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react-native";

import { AddAccountEntryModal } from "@/components/accounts/AddAccountEntryModal";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { ManageStockCashModal } from "@/components/portfolio/ManageStockCashModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useReceivables } from "@/hooks/useReceivables";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useUnifiedNetWorth } from "@/hooks/useUnifiedNetWorth";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Account } from "@/shared/types/expense";
import {
  computeBankBalance,
  computeCreditUsage,
} from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { formatAccountIdentityLine } from "@/shared/utils/accountIdentity";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function AccountsList() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { entries } = useAccountEntries();
  const { payments } = useAccountPayments();
  const { transfers } = useAccountTransfers();
  const { borrowings, repayments: borrowingRepayments } = useBorrowings();
  const { receivables, repayments: receivableRepayments } = useReceivables();

  // Unified net worth calculation across bank accounts, credit cards, investments & stocks
  const netWorth = useUnifiedNetWorth();

  // Modals state
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isStockCashModalOpen, setIsStockCashModalOpen] = useState(false);
  const [isPayCreditModalOpen, setIsPayCreditModalOpen] = useState(false);
  const [selectedPayCardId, setSelectedPayCardId] = useState<string | undefined>();

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  // Deposit/bank accounts (non-credit)
  const depositAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) !== "credit";
    });
  }, [accounts, typeMap]);

  // Credit card accounts (liabilities)
  const creditAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) === "credit";
    });
  }, [accounts, typeMap]);

  // Calculate balances per account
  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      const kind = getAccountKind(typeName);
      if (kind === "credit") {
        const usage = computeCreditUsage(a, expenses, payments);
        map.set(a.id, -usage.usedThisCycle);
      } else {
        const bal = computeBankBalance(
          a,
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
        map.set(a.id, bal);
      }
    });
    return map;
  }, [
    accounts,
    typeMap,
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

  // Group deposit accounts by type
  const groupedAccounts = useMemo(() => {
    const groups: { typeId: string; typeName: string; list: Account[] }[] = [];
    accountTypes.forEach((t) => {
      if (getAccountKind(t.name) === "credit") return;
      const list = depositAccounts.filter((a) => a.typeId === t.id);
      if (list.length > 0) {
        groups.push({ typeId: t.id, typeName: t.name, list });
      }
    });

    const unmapped = depositAccounts.filter(
      (a) => !accountTypes.some((t) => t.id === a.typeId)
    );
    if (unmapped.length > 0) {
      groups.push({ typeId: "other", typeName: "Other Accounts", list: unmapped });
    }

    return groups;
  }, [accountTypes, depositAccounts]);

  const handleOpenAccountDetail = (account: Account) => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push({
      pathname: "/accounts/[id]",
      params: { id: account.id },
    });
  };

  const handleOpenCreateAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setEditingAccount(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEditAccount = (account: Account) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setEditingAccount(account);
    setIsEditModalOpen(true);
  };

  const green = isDark ? "#4ade80" : "#16a34a";
  const red = isDark ? "#f87171" : "#dc2626";
  const blue = isDark ? "#60a5fa" : "#2563eb";
  const purple = isDark ? "#a78bfa" : "#7c3aed";

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Comprehensive Net Worth Hero Card */}
      <Card
        style={[
          styles.netWorthCard,
          {
            backgroundColor: isDark
              ? "rgba(30, 27, 75, 0.45)"
              : "rgba(238, 242, 255, 0.9)",
            borderColor: theme.colors.primary,
          },
        ]}
      >
        <View style={styles.netWorthHeader}>
          <View style={styles.netWorthTitleRow}>
            <TrendingUp size={18} color={theme.colors.primary} />
            <Text
              style={[
                styles.netWorthLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Total Net Worth
            </Text>
          </View>
        </View>

        <Amount
          value={netWorth.totalNetWorth}
          currency={system.defaultCurrency}
          ghostable
          style={{
            fontSize: 30,
            fontWeight: "800",
            color:
              netWorth.totalNetWorth >= 0
                ? theme.colors.foreground
                : theme.colors.destructive,
          }}
        />

        {/* Assets vs Liabilities Summary */}
        <View style={styles.netWorthSubRow}>
          <View style={styles.netWorthStat}>
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
                fontWeight: "600",
              }}
            >
              Total Assets
            </Text>
            <Amount
              value={netWorth.totalAssets}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "800",
                color: green,
              }}
            />
          </View>

          <View
            style={[
              styles.netWorthDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />

          <View style={styles.netWorthStat}>
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
                fontWeight: "600",
              }}
            >
              Liabilities
            </Text>
            <Amount
              value={netWorth.totalLiabilities}
              currency={system.defaultCurrency}
              prefix={netWorth.totalLiabilities > 0 ? "-" : ""}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "800",
                color: netWorth.totalLiabilities > 0 ? red : theme.colors.mutedForeground,
              }}
            />
          </View>
        </View>

        {/* Detailed Breakdown Pills */}
        <View
          style={[
            styles.breakdownRow,
            {
              borderTopColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
            },
          ]}
        >
          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}>
              Bank/Cash
            </Text>
            <Amount
              value={netWorth.liquidBankAssets}
              currency={system.defaultCurrency}
              style={{ fontSize: 11, fontWeight: "700", color: theme.colors.foreground }}
            />
          </View>

          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}>
              Fixed Deposits
            </Text>
            <Amount
              value={netWorth.investmentsValue}
              currency={system.defaultCurrency}
              style={{ fontSize: 11, fontWeight: "700", color: green }}
            />
          </View>

          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}>
              Stocks & Demat
            </Text>
            <Amount
              value={netWorth.totalStocksValue}
              currency={system.defaultCurrency}
              style={{ fontSize: 11, fontWeight: "700", color: blue }}
            />
          </View>
        </View>
      </Card>

      {/* Material 3 Quick Actions Carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionRow}
      >
        <Pressable
          onPress={handleOpenCreateAccount}
          android_ripple={{ color: theme.colors.primary + "20", borderless: false }}
          style={({ pressed }) => [
            styles.actionChip,
            theme.elevation[1],
            {
              backgroundColor: theme.colors.primary,
              borderColor: theme.colors.primary,
            },
            pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
          ]}
          accessibilityRole="button"
        >
          <Plus size={16} color={theme.colors.primaryForeground} strokeWidth={2.4} />
          <Text style={[styles.actionChipText, { color: theme.colors.primaryForeground }]}>
            Add Account
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setIsTransferModalOpen(true);
          }}
          android_ripple={{ color: theme.colors.primary + "18", borderless: false }}
          style={({ pressed }) => [
            styles.actionChip,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
            pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
          ]}
          accessibilityRole="button"
        >
          <ArrowLeftRight size={16} color={theme.colors.primary} />
          <Text style={[styles.actionChipText, { color: theme.colors.foreground }]}>
            Transfer
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setIsStockCashModalOpen(true);
          }}
          android_ripple={{ color: purple + "20", borderless: false }}
          style={({ pressed }) => [
            styles.actionChip,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
            pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
          ]}
          accessibilityRole="button"
        >
          <TrendingUp size={16} color={purple} />
          <Text style={[styles.actionChipText, { color: theme.colors.foreground }]}>
            Stocks Cash
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setIsEntryModalOpen(true);
          }}
          android_ripple={{ color: theme.colors.primary + "18", borderless: false }}
          style={({ pressed }) => [
            styles.actionChip,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
            pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
          ]}
          accessibilityRole="button"
        >
          <SlidersHorizontal size={16} color={theme.colors.primary} />
          <Text style={[styles.actionChipText, { color: theme.colors.foreground }]}>
            Adjust Balance
          </Text>
        </Pressable>
      </ScrollView>

      {/* Stocks & Demat Cash Card */}
      <View style={styles.groupSection}>
        <Text
          style={[
            styles.groupHeader,
            {
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.xs,
            },
          ]}
        >
          STOCKS & DEMAT PORTFOLIO
        </Text>
        <Card
          style={[
            styles.stockPortfolioCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: isDark ? "rgba(99, 102, 241, 0.3)" : "rgba(99, 102, 241, 0.2)",
            },
          ]}
        >
          <View style={styles.stockCardHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={[
                  styles.accountIconBox,
                  {
                    backgroundColor: isDark
                      ? "rgba(99, 102, 241, 0.15)"
                      : "rgba(99, 102, 241, 0.1)",
                  },
                ]}
              >
                <TrendingUp size={20} color={theme.colors.primary} />
              </View>
              <View style={{ gap: 2 }}>
                <Text
                  style={[
                    styles.accountName,
                    {
                      color: theme.colors.foreground,
                      fontSize: theme.typography.md,
                    },
                  ]}
                >
                  Stocks Demat Account
                </Text>
                <Text
                  style={[
                    styles.accountSub,
                    {
                      color: theme.colors.mutedForeground,
                      fontSize: theme.typography.xs,
                    },
                  ]}
                >
                  Trading Cash & Equities Portfolio
                </Text>
              </View>
            </View>

            <Amount
              value={netWorth.totalStocksValue}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.md,
                fontWeight: "800",
                color: theme.colors.foreground,
              }}
            />
          </View>

          <View style={styles.stockCardStatsRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  color: theme.colors.mutedForeground,
                }}
              >
                Cash Balance:{" "}
                <Amount
                  value={netWorth.stocksCashBalance}
                  currency={system.defaultCurrency}
                  style={{ fontWeight: "700", color: theme.colors.foreground }}
                />
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  color: theme.colors.mutedForeground,
                }}
              >
                Holdings Value:{" "}
                <Amount
                  value={netWorth.stocksHoldingsValue}
                  currency={system.defaultCurrency}
                  style={{ fontWeight: "700", color: blue }}
                />
              </Text>
            </View>
          </View>

          <View style={styles.stockCardActionsRow}>
            <Button
              size="sm"
              variant="outline"
              onPress={() => setIsStockCashModalOpen(true)}
              style={{ flex: 1 }}
            >
              Transfer Cash
            </Button>
            <Button
              size="sm"
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                router.push("/ledger?tab=portfolio");
              }}
              style={{ flex: 1 }}
            >
              View Portfolio
            </Button>
          </View>
        </Card>
      </View>

      {/* Grouped Bank / Deposit Accounts */}
      {groupedAccounts.length === 0 ? (
        <EmptyState
          illustration="accounts"
          title="No Bank Accounts Added Yet"
          description="Track your savings, checking accounts, and physical cash wallets in one secure place."
          primaryAction={{
            label: "Add First Account",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
            onPress: handleOpenCreateAccount,
          }}
          secondaryAction={{
            label: "Adjust Balance",
            icon: <SlidersHorizontal size={16} color={theme.colors.primary} />,
            onPress: () => setIsEntryModalOpen(true),
          }}
          tip="Keep opening balances accurate so your historical net worth calculates automatically."
        />
      ) : (
        groupedAccounts.map((group) => (
          <View key={group.typeId} style={styles.groupSection}>
            <Text
              style={[
                styles.groupHeader,
                {
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.xs,
                },
              ]}
            >
              {group.typeName.toUpperCase()} ({group.list.length})
            </Text>

            <View style={{ gap: 10 }}>
              {group.list.map((account) => {
                const balance = accountBalances.get(account.id) ?? 0;
                const accountColor = account.color || theme.colors.primary;

                return (
                  <Pressable
                    key={account.id}
                    onPress={() => handleOpenAccountDetail(account)}
                    onLongPress={() => handleOpenEditAccount(account)}
                    style={({ pressed }) => [
                      styles.accountCard,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                  >
                    {/* Left Accent Bar */}
                    <View
                      style={[
                        styles.colorAccentBar,
                        { backgroundColor: accountColor },
                      ]}
                    />

                    {/* Account Icon & Info */}
                    <View style={styles.accountCardLeft}>
                      <View
                        style={[
                          styles.accountIconBox,
                          {
                            backgroundColor: isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)",
                          },
                        ]}
                      >
                        <Wallet size={20} color={accountColor} />
                      </View>
                      <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
                        <Text
                          style={[
                            styles.accountName,
                            {
                              color: theme.colors.foreground,
                              fontSize: theme.typography.md,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {account.name}
                        </Text>
                        <Text
                          style={[
                            styles.accountSub,
                            {
                              color: theme.colors.mutedForeground,
                              fontSize: theme.typography.xs,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {formatAccountIdentityLine(account, group.typeName)}
                        </Text>
                      </View>
                    </View>

                    {/* Balance & Chevron */}
                    <View style={styles.accountCardRight}>
                      <Amount
                        value={balance}
                        currency={system.defaultCurrency}
                        ghostable
                        style={{
                          fontSize: theme.typography.md,
                          fontWeight: "800",
                          color:
                            balance >= 0
                              ? theme.colors.foreground
                              : theme.colors.destructive,
                        }}
                      />
                      <ChevronRight
                        size={16}
                        color={theme.colors.mutedForeground}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}

      {/* Credit Cards & Liabilities Section */}
      {creditAccounts.length > 0 && (
        <View style={styles.groupSection}>
          <Text
            style={[
              styles.groupHeader,
              {
                color: red,
                fontSize: theme.typography.xs,
              },
            ]}
          >
            CREDIT CARDS & LIABILITIES ({creditAccounts.length})
          </Text>

          <View style={{ gap: 10 }}>
            {creditAccounts.map((account) => {
              const usage = computeCreditUsage(account, expenses, payments);
              const cardColor = account.color || "#EF4444";

              return (
                <Pressable
                  key={account.id}
                  onPress={() => handleOpenAccountDetail(account)}
                  onLongPress={() => handleOpenEditAccount(account)}
                  style={({ pressed }) => [
                    styles.accountCard,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  {/* Left Accent Bar */}
                  <View
                    style={[
                      styles.colorAccentBar,
                      { backgroundColor: cardColor },
                    ]}
                  />

                  {/* Account Icon & Info */}
                  <View style={styles.accountCardLeft}>
                    <View
                      style={[
                        styles.accountIconBox,
                        {
                          backgroundColor: isDark
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(239, 68, 68, 0.1)",
                        },
                      ]}
                    >
                      <CreditCard size={20} color={cardColor} />
                    </View>
                    <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.accountName,
                          {
                            color: theme.colors.foreground,
                            fontSize: theme.typography.md,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {account.name}
                      </Text>
                      <Text
                        style={[
                          styles.accountSub,
                          {
                            color: theme.colors.mutedForeground,
                            fontSize: theme.typography.xs,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {formatAccountIdentityLine(account, "Credit Card")}
                      </Text>
                    </View>
                  </View>

                  {/* Used Liability & Chevron */}
                  <View style={styles.accountCardRight}>
                    <View style={{ alignItems: "flex-end" }}>
                      <Amount
                        value={usage.usedThisCycle}
                        currency={system.defaultCurrency}
                        prefix={usage.usedThisCycle > 0 ? "-" : ""}
                        ghostable
                        style={{
                          fontSize: theme.typography.md,
                          fontWeight: "800",
                          color: usage.usedThisCycle > 0 ? red : theme.colors.foreground,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 10,
                          color: theme.colors.mutedForeground,
                          fontWeight: "600",
                        }}
                      >
                        Used This Cycle
                      </Text>
                    </View>
                    <ChevronRight
                      size={16}
                      color={theme.colors.mutedForeground}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Modals */}
      <EditAccountModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        account={editingAccount}
      />

      <TransferFundsModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        accounts={depositAccounts}
      />

      <AddAccountEntryModal
        isOpen={isEntryModalOpen}
        onClose={() => setIsEntryModalOpen(false)}
        accounts={depositAccounts}
      />

      <ManageStockCashModal
        visible={isStockCashModalOpen}
        onClose={() => setIsStockCashModalOpen(false)}
        currency={system.defaultCurrency}
      />

      <PayCreditBillModal
        isOpen={isPayCreditModalOpen}
        onClose={() => setIsPayCreditModalOpen(false)}
        defaultCreditCardId={selectedPayCardId}
        accounts={accounts}
        accountTypes={accountTypes}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 18,
    paddingBottom: 40,
  },
  netWorthCard: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 12,
  },
  netWorthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  netWorthTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  netWorthLabel: {
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  netWorthSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  netWorthStat: {
    alignItems: "center",
    gap: 2,
  },
  netWorthDivider: {
    width: 1,
    height: 24,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
  },
  breakdownItem: {
    alignItems: "center",
    gap: 2,
  },
  breakdownLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 2,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 46,
    gap: 8,
  },
  actionChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  groupSection: {
    gap: 8,
  },
  groupHeader: {
    fontWeight: "800",
    letterSpacing: 0.8,
    marginLeft: 4,
  },
  stockPortfolioCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  stockCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stockCardStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stockCardActionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  colorAccentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  accountCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
    marginLeft: 4,
  },
  accountIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  accountName: {
    fontWeight: "700",
  },
  accountSub: {},
  accountCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginTop: 20,
  },
  emptyTitle: {
    fontWeight: "800",
  },
  emptyDesc: {
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 8,
  },
});

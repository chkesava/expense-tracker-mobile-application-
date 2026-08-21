import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Banknote,
  BarChart3,
  ChevronRight,
  CreditCard,
  Landmark,
  PiggyBank,
  Plus,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react-native";

import { AddAccountEntryModal } from "@/components/accounts/AddAccountEntryModal";
import { AccountEditButton } from "@/components/accounts/AccountEditButton";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { ManageStockCashModal } from "@/components/portfolio/ManageStockCashModal";
import { Button } from "@/components/ui/Button";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useReceivables } from "@/hooks/useReceivables";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useUnifiedNetWorth } from "@/hooks/useUnifiedNetWorth";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Account } from "@/shared/types/expense";
import {
  computeBankBalance,
  computeOutstandingCredit,
} from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  formatAccountIdentityLine,
} from "@/shared/utils/accountIdentity";
import { SmsMatchingUnconfiguredText } from "@/components/accounts/SmsMatchingUnconfiguredText";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

type AccentTone = {
  icon: string;
  softBg: string;
  softBorder: string;
};

function accentForTypeName(
  typeName: string,
  isDark: boolean
): AccentTone {
  const n = typeName.toLowerCase();
  if (n.includes("credit")) {
    return {
      icon: isDark ? "#f87171" : "#dc2626",
      softBg: isDark ? "rgba(239,68,68,0.14)" : "rgba(239,68,68,0.1)",
      softBorder: isDark ? "rgba(239,68,68,0.28)" : "rgba(239,68,68,0.18)",
    };
  }
  if (n.includes("stock") || n.includes("demat") || n.includes("broker")) {
    return {
      icon: isDark ? "#a78bfa" : "#7c3aed",
      softBg: isDark ? "rgba(124,58,237,0.16)" : "rgba(124,58,237,0.1)",
      softBorder: isDark ? "rgba(124,58,237,0.3)" : "rgba(124,58,237,0.18)",
    };
  }
  if (n.includes("fixed") || n.includes("deposit") || n.includes("fd") || n.includes("rd")) {
    return {
      icon: isDark ? "#2dd4bf" : "#0d9488",
      softBg: isDark ? "rgba(13,148,136,0.16)" : "rgba(13,148,136,0.1)",
      softBorder: isDark ? "rgba(13,148,136,0.3)" : "rgba(13,148,136,0.18)",
    };
  }
  if (n.includes("cash") || n.includes("wallet") || n.includes("hand")) {
    return {
      icon: isDark ? "#86efac" : "#15803d",
      softBg: isDark ? "rgba(34,197,94,0.12)" : "rgba(34,197,94,0.08)",
      softBorder: isDark ? "rgba(34,197,94,0.24)" : "rgba(34,197,94,0.16)",
    };
  }
  // bank / savings / salary / default
  return {
    icon: isDark ? "#4ade80" : "#16a34a",
    softBg: isDark ? "rgba(37,150,90,0.16)" : "rgba(37,150,90,0.1)",
    softBorder: isDark ? "rgba(37,150,90,0.28)" : "rgba(37,150,90,0.16)",
  };
}

function iconForTypeName(typeName: string) {
  const n = typeName.toLowerCase();
  if (n.includes("credit")) return CreditCard;
  if (n.includes("cash") || n.includes("wallet") || n.includes("hand")) return Banknote;
  if (n.includes("fixed") || n.includes("deposit") || n.includes("fd")) return PiggyBank;
  if (n.includes("salary")) return Landmark;
  return Wallet;
}

/** Mini trend silhouette — decorative only; no fabricated history. */
function NetWorthTrendMark({ color }: { color: string }) {
  return (
    <View style={styles.trendMark} accessibilityElementsHidden>
      <View style={[styles.trendBar, { height: 8, backgroundColor: color, opacity: 0.35 }]} />
      <View style={[styles.trendBar, { height: 14, backgroundColor: color, opacity: 0.5 }]} />
      <View style={[styles.trendBar, { height: 10, backgroundColor: color, opacity: 0.4 }]} />
      <View style={[styles.trendBar, { height: 18, backgroundColor: color, opacity: 0.65 }]} />
      <View style={[styles.trendBar, { height: 22, backgroundColor: color, opacity: 0.9 }]} />
    </View>
  );
}

export function AccountsList() {
  const { push } = useRouter();
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
  const { bills } = useCreditCardBills();

  const netWorth = useUnifiedNetWorth();

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

  const depositAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) !== "credit";
    });
  }, [accounts, typeMap]);

  const creditAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) === "credit";
    });
  }, [accounts, typeMap]);

  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      const kind = getAccountKind(typeName);
      if (kind === "credit") {
        const usage = computeOutstandingCredit(a, expenses, payments, bills);
        map.set(a.id, -usage.outstanding);
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
    bills,
    entries,
    transfers,
    borrowings,
    borrowingRepayments,
    receivables,
    receivableRepayments,
  ]);

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
    push({
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

  const green = theme.colors.success;
  const red = isDark ? "#f87171" : "#dc2626";
  const purple = isDark ? "#a78bfa" : "#7c3aed";
  const blue = isDark ? "#60a5fa" : "#2563eb";
  const ripple = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)";

  return (
    <View style={styles.container}>
      {/* Net Worth */}
      <View
        style={[
          styles.netWorthCard,
          theme.elevation[2],
          {
            backgroundColor: isDark
              ? "rgba(52, 179, 122, 0.1)"
              : "rgba(236, 253, 245, 0.95)",
            borderColor: isDark
              ? "rgba(52, 179, 122, 0.28)"
              : "rgba(37, 150, 90, 0.18)",
          },
        ]}
      >
        <View style={styles.netWorthHeader}>
          <View style={styles.netWorthTitleRow}>
            <TrendingUp size={16} color={green} strokeWidth={2.4} />
            <Text style={[styles.netWorthLabel, { color: theme.colors.mutedForeground }]}>
              Total Net Worth
            </Text>
          </View>
          <NetWorthTrendMark color={green} />
        </View>

        <Amount
          value={netWorth.totalNetWorth}
          currency={system.defaultCurrency}
          ghostable
          style={{
            fontSize: 32,
            fontWeight: "800",
            letterSpacing: -0.6,
            color:
              netWorth.totalNetWorth >= 0
                ? theme.colors.foreground
                : theme.colors.destructive,
          }}
        />

        <View style={styles.netWorthSubRow}>
          <View style={styles.netWorthStat}>
            <Text style={[styles.statCaption, { color: theme.colors.mutedForeground }]}>
              Total Assets
            </Text>
            <Amount
              value={netWorth.totalAssets}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "800",
                color: theme.colors.foreground,
              }}
            />
          </View>

          <View
            style={[styles.netWorthDivider, { backgroundColor: theme.colors.outlineVariant }]}
          />

          <View style={styles.netWorthStat}>
            <Text style={[styles.statCaption, { color: theme.colors.mutedForeground }]}>
              Liabilities (credit cards & borrowings)
            </Text>
            <Amount
              value={netWorth.totalLiabilities}
              currency={system.defaultCurrency}
              prefix={netWorth.totalLiabilities > 0 ? "-" : ""}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "800",
                color:
                  netWorth.totalLiabilities > 0
                    ? red
                    : theme.colors.mutedForeground,
              }}
            />
          </View>
        </View>

        <View
          style={[
            styles.breakdownRow,
            {
              borderTopColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(15,23,42,0.06)",
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
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: theme.colors.foreground,
              }}
            />
          </View>
          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}>
              Fixed Deposits
            </Text>
            <Amount
              value={netWorth.investmentsValue}
              currency={system.defaultCurrency}
              style={{ fontSize: 12, fontWeight: "700", color: green }}
            />
          </View>
          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: theme.colors.mutedForeground }]}>
              Stocks/Demat
            </Text>
            <Amount
              value={netWorth.totalStocksValue}
              currency={system.defaultCurrency}
              style={{ fontSize: 12, fontWeight: "700", color: blue }}
            />
          </View>
        </View>
      </View>

      {/* Quick actions */}
      <View style={styles.quickActionsRow}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setIsStockCashModalOpen(true);
          }}
          android_ripple={{ color: purple + "22", borderless: false }}
          style={({ pressed }) => [
            styles.quickAction,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.outlineVariant,
            },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Stocks Cash"
        >
          <TrendingUp size={18} color={purple} strokeWidth={2.2} />
          <Text
            style={[styles.quickActionText, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            Stocks Cash
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setIsEntryModalOpen(true);
          }}
          android_ripple={{ color: green + "22", borderless: false }}
          style={({ pressed }) => [
            styles.quickAction,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.outlineVariant,
            },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Adjust Balance"
        >
          <SlidersHorizontal size={18} color={green} strokeWidth={2.2} />
          <Text
            style={[styles.quickActionText, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            Adjust Balance
          </Text>
        </Pressable>
      </View>

      {/* Stocks & Demat */}
      <View style={styles.groupSection}>
        <Text style={[styles.groupHeader, { color: theme.colors.mutedForeground }]}>
          STOCKS & DEMAT PORTFOLIO
        </Text>

        <View
          style={[
            styles.stockCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: isDark
                ? "rgba(124, 58, 237, 0.28)"
                : "rgba(124, 58, 237, 0.16)",
            },
          ]}
        >
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              push("/investments?tab=portfolio" as never);
            }}
            android_ripple={{ color: ripple, borderless: false }}
            style={styles.stockCardHeader}
            accessibilityRole="button"
            accessibilityLabel="View portfolio"
          >
            <View style={styles.stockTitleRow}>
              <View
                style={[
                  styles.accountIconBox,
                  {
                    backgroundColor: isDark
                      ? "rgba(124, 58, 237, 0.16)"
                      : "rgba(124, 58, 237, 0.1)",
                  },
                ]}
              >
                <BarChart3 size={18} color={purple} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text
                  style={[styles.accountName, { color: theme.colors.foreground }]}
                  numberOfLines={1}
                >
                  Stocks Demat Account
                </Text>
                <Text
                  style={[styles.accountSub, { color: theme.colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  Trading Cash & Equities
                </Text>
              </View>
              <ChevronRight size={18} color={theme.colors.mutedForeground} />
            </View>
          </Pressable>

          <View style={styles.stockStatsGrid}>
            <View style={styles.stockStat}>
              <Text style={[styles.statCaption, { color: theme.colors.mutedForeground }]}>
                Cash Balance
              </Text>
              <Amount
                value={netWorth.stocksCashBalance}
                currency={system.defaultCurrency}
                ghostable
                style={{
                  fontSize: theme.typography.md,
                  fontWeight: "800",
                  color: theme.colors.foreground,
                }}
              />
            </View>
            <View style={styles.stockStat}>
              <Text style={[styles.statCaption, { color: theme.colors.mutedForeground }]}>
                Holdings Value
              </Text>
              <Amount
                value={netWorth.stocksHoldingsValue}
                currency={system.defaultCurrency}
                ghostable
                style={{
                  fontSize: theme.typography.md,
                  fontWeight: "800",
                  color: blue,
                }}
              />
            </View>
          </View>

          <View style={styles.stockActionsRow}>
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
                push("/investments?tab=portfolio" as never);
              }}
              style={{ flex: 1 }}
            >
              View Portfolio
            </Button>
          </View>
        </View>
      </View>

      {/* Grouped accounts */}
      {groupedAccounts.length === 0 ? (
        <EmptyState
          illustration="accounts"
          title="No accounts yet"
          description="Add a savings, salary, or cash account to start tracking balances."
          primaryAction={{
            label: "Add Account",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
            onPress: handleOpenCreateAccount,
          }}
          secondaryAction={{
            label: "Adjust Balance",
            icon: <SlidersHorizontal size={16} color={theme.colors.success} />,
            onPress: () => setIsEntryModalOpen(true),
          }}
          tip="Keep opening balances accurate so net worth stays trustworthy."
        />
      ) : (
        groupedAccounts.map((group) => {
          const accent = accentForTypeName(group.typeName, isDark);
          const TypeIcon = iconForTypeName(group.typeName);

          return (
            <View key={group.typeId} style={styles.groupSection}>
              <Text style={[styles.groupHeader, { color: theme.colors.mutedForeground }]}>
                {group.typeName.toUpperCase()} ({group.list.length})
              </Text>

              <View style={styles.accountList}>
                {group.list.map((account) => {
                  const balance = accountBalances.get(account.id) ?? 0;
                  const tint = account.color || accent.icon;

                  return (
                    <Pressable
                      key={account.id}
                      onPress={() => handleOpenAccountDetail(account)}
                      onLongPress={() => handleOpenEditAccount(account)}
                      android_ripple={{ color: ripple, borderless: false }}
                      style={({ pressed }) => [
                        styles.accountRow,
                        {
                          backgroundColor: theme.colors.card,
                          borderColor: theme.colors.outlineVariant,
                          opacity: pressed ? 0.92 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${account.name}, balance`}
                    >
                      <View
                        style={[
                          styles.accountIconBox,
                          {
                            backgroundColor: accent.softBg,
                            borderColor: accent.softBorder,
                            borderWidth: StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <TypeIcon size={18} color={tint} strokeWidth={2.1} />
                      </View>

                      <View style={styles.accountMeta}>
                        <Text
                          style={[styles.accountName, { color: theme.colors.foreground }]}
                          numberOfLines={1}
                        >
                          {account.name}
                        </Text>
                        <Text
                          style={[styles.accountSub, { color: theme.colors.mutedForeground }]}
                          numberOfLines={1}
                        >
                          {formatAccountIdentityLine(account, group.typeName)}
                        </Text>
                        <SmsMatchingUnconfiguredText
                          account={account}
                          typeName={group.typeName}
                        />
                      </View>

                      <View style={styles.accountRight}>
                        <Amount
                          value={balance}
                          currency={system.defaultCurrency}
                          ghostable
                          style={{
                            fontSize: theme.typography.md,
                            fontWeight: "700",
                            color:
                              balance >= 0
                                ? theme.colors.foreground
                                : theme.colors.destructive,
                          }}
                        />
                        <AccountEditButton
                          label={`Edit ${account.name}`}
                          color={theme.colors.mutedForeground}
                          onPress={() => handleOpenEditAccount(account)}
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
          );
        })
      )}

      {/* Credit liabilities (still on Accounts for completeness; Cards tab owns primary UX) */}
      {creditAccounts.length > 0 ? (
        <View style={styles.groupSection}>
          <Text style={[styles.groupHeader, { color: red }]}>
            CREDIT CARDS & LIABILITIES ({creditAccounts.length})
          </Text>
          <View style={styles.accountList}>
            {creditAccounts.map((account) => {
              const usage = computeOutstandingCredit(account, expenses, payments, bills);
              const accent = accentForTypeName("credit", isDark);
              const cardColor = account.color || accent.icon;

              return (
                <Pressable
                  key={account.id}
                  onPress={() => handleOpenAccountDetail(account)}
                  onLongPress={() => handleOpenEditAccount(account)}
                  android_ripple={{ color: ripple, borderless: false }}
                  style={({ pressed }) => [
                    styles.accountRow,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.outlineVariant,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.accountIconBox,
                      {
                        backgroundColor: accent.softBg,
                        borderColor: accent.softBorder,
                        borderWidth: StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <CreditCard size={18} color={cardColor} strokeWidth={2.1} />
                  </View>
                  <View style={styles.accountMeta}>
                    <Text
                      style={[styles.accountName, { color: theme.colors.foreground }]}
                      numberOfLines={1}
                    >
                      {account.name}
                    </Text>
                    <Text
                      style={[styles.accountSub, { color: theme.colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {formatAccountIdentityLine(account, "Credit Card")}
                    </Text>
                    <SmsMatchingUnconfiguredText
                      account={account}
                      typeName="Credit Card"
                    />
                  </View>
                  <View style={styles.accountRight}>
                    <View style={{ alignItems: "flex-end" }}>
                      <Amount
                        value={usage.outstanding}
                        currency={system.defaultCurrency}
                        prefix={usage.outstanding > 0 ? "-" : ""}
                        ghostable
                        style={{
                          fontSize: theme.typography.md,
                          fontWeight: "700",
                          color:
                            usage.outstanding > 0
                              ? red
                              : theme.colors.foreground,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 10,
                          color: theme.colors.mutedForeground,
                          fontWeight: "600",
                        }}
                      >
                        Used this cycle
                      </Text>
                    </View>
                    <AccountEditButton
                      label={`Edit ${account.name}`}
                      color={theme.colors.mutedForeground}
                      onPress={() => handleOpenEditAccount(account)}
                    />
                    <ChevronRight size={16} color={theme.colors.mutedForeground} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Add Account */}
      <Pressable
        onPress={handleOpenCreateAccount}
        android_ripple={{ color: green + "22", borderless: false }}
        style={({ pressed }) => [
          styles.addAccountButton,
          {
            backgroundColor: isDark
              ? "rgba(52, 179, 122, 0.12)"
              : "rgba(37, 150, 90, 0.08)",
            borderColor: isDark
              ? "rgba(52, 179, 122, 0.28)"
              : "rgba(37, 150, 90, 0.2)",
          },
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add Account"
      >
        <Plus size={18} color={green} strokeWidth={2.4} />
        <Text style={[styles.addAccountText, { color: green }]}>Add Account</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          setIsTransferModalOpen(true);
        }}
        style={styles.transferLink}
        accessibilityRole="button"
        accessibilityLabel="Transfer between accounts"
      >
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 13, fontWeight: "600" }}>
          Transfer between accounts
        </Text>
      </Pressable>

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
    </View>
  );
}

export default AccountsList;

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 8,
  },
  netWorthCard: {
    padding: 18,
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
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
    letterSpacing: 0.6,
  },
  trendMark: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 22,
  },
  trendBar: {
    width: 4,
    borderRadius: 2,
  },
  netWorthSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 4,
  },
  netWorthStat: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  netWorthDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  statCaption: {
    fontSize: 11,
    fontWeight: "600",
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  breakdownItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  breakdownLabel: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  groupSection: {
    gap: 8,
  },
  groupHeader: {
    fontWeight: "800",
    letterSpacing: 0.7,
    fontSize: 11,
    marginLeft: 2,
  },
  stockCard: {
    padding: 14,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 14,
  },
  stockCardHeader: {
    borderRadius: 12,
    overflow: "hidden",
  },
  stockTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stockStatsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  stockStat: {
    flex: 1,
    gap: 4,
  },
  stockActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  accountList: {
    gap: 8,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  accountIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  accountMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  accountSub: {
    fontSize: 12,
    fontWeight: "500",
  },
  accountRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  addAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderStyle: "dashed",
    overflow: "hidden",
  },
  addAccountText: {
    fontSize: 14,
    fontWeight: "700",
  },
  transferLink: {
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 40,
    justifyContent: "center",
  },
});

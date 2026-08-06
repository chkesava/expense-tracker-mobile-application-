import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
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
  Landmark,
  Plus,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react-native";

import { AddAccountEntryModal } from "@/components/accounts/AddAccountEntryModal";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Account } from "@/shared/types/expense";
import {
  computeBankBalance,
  computeCreditUsage,
} from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function AccountsList() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const { accounts, loading: accountsLoading } = useAccounts();
  const { accountTypes, loading: typesLoading } = useAccountTypes();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { entries } = useAccountEntries();
  const { payments } = useAccountPayments();
  const { transfers } = useAccountTransfers();

  // Modals state
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  // Exclude credit cards from primary deposit/cash accounts (they have their own Cards view)
  const depositAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) !== "credit";
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
          transfers
        );
        map.set(a.id, bal);
      }
    });
    return map;
  }, [accounts, typeMap, expenses, incomes, payments, entries, transfers]);

  // Net worth calculation (Assets - Credit Liabilities)
  const netWorthSummary = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;

    accounts.forEach((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      const kind = getAccountKind(typeName);
      if (kind === "credit") {
        const usage = computeCreditUsage(a, expenses, payments);
        totalLiabilities += usage.usedThisCycle;
      } else {
        const bal = computeBankBalance(
          a,
          expenses,
          incomes,
          payments,
          entries,
          transfers
        );
        if (bal > 0) {
          totalAssets += bal;
        } else {
          totalLiabilities += Math.abs(bal);
        }
      }
    });

    const net = totalAssets - totalLiabilities;
    return { totalAssets, totalLiabilities, net };
  }, [accounts, typeMap, expenses, incomes, payments, entries, transfers]);

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

    // Also include accounts whose type might not be in accountTypes
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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Liquid Net Worth Hero Banner */}
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
              Liquid Net Worth
            </Text>
          </View>
        </View>

        <Amount
          value={netWorthSummary.net}
          currency={system.defaultCurrency}
          ghostable
          style={{
          fontSize: 28,
            fontWeight: "800",
            color:
              netWorthSummary.net >= 0
                ? theme.colors.foreground
                : theme.colors.destructive,
          }}
        />

        <View style={styles.netWorthSubRow}>
          <View style={styles.netWorthStat}>
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
              }}
            >
              Total Assets
            </Text>
            <Amount
              value={netWorthSummary.totalAssets}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: theme.colors.success,
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
              }}
            >
              Liabilities
            </Text>
            <Amount
              value={netWorthSummary.totalLiabilities}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: theme.colors.destructive,
              }}
            />
          </View>
        </View>
      </Card>

      {/* Quick Actions Row */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={handleOpenCreateAccount}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Plus size={16} color={theme.colors.primary} />
          <Text
            style={[
              styles.actionButtonText,
              { color: theme.colors.foreground },
            ]}
          >
            Add Account
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setIsTransferModalOpen(true)}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <ArrowLeftRight size={16} color={theme.colors.primary} />
          <Text
            style={[
              styles.actionButtonText,
              { color: theme.colors.foreground },
            ]}
          >
            Transfer
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setIsEntryModalOpen(true)}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <SlidersHorizontal size={16} color={theme.colors.primary} />
          <Text
            style={[
              styles.actionButtonText,
              { color: theme.colors.foreground },
            ]}
          >
            Adjust
          </Text>
        </Pressable>
      </View>

      {/* Grouped Deposit Accounts */}
      {groupedAccounts.length === 0 ? (
        <Card
          style={[
            styles.emptyCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Landmark size={36} color={theme.colors.mutedForeground} />
          <Text
            style={[
              styles.emptyTitle,
              {
                color: theme.colors.foreground,
                fontSize: theme.typography.lg,
              },
            ]}
          >
            No Accounts Added Yet
          </Text>
          <Text
            style={[
              styles.emptyDesc,
              {
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.sm,
              },
            ]}
          >
            Track your bank accounts, cash wallets, and investments in one place.
          </Text>
          <Button onPress={handleOpenCreateAccount} size="sm">
            Create First Account
          </Button>
        </Card>
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
                          {account.accountNumber
                            ? `${group.typeName} • ${account.accountNumber}`
                            : group.typeName}
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
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 12,
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

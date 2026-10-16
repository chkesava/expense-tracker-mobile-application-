import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Banknote,
  BarChart3,
  CreditCard,
  Landmark,
  PiggyBank,
  Plus,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react-native";

import { AddAccountEntryModal } from "@/components/accounts/AddAccountEntryModal";
import { AccountRow } from "@/components/accounts/AccountRow";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import { LiabilityAmount } from "@/components/common/LiabilityAmount";
import { EmptyState } from "@/components/common/EmptyState";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { NetWorthHeroCard } from "@/components/dashboard/NetWorthWidget";
import {
  MetaLabel,
  Section,
  SectionAction,
  StatTile,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { ManageStockCashModal } from "@/components/portfolio/ManageStockCashModal";
import { RunwayEntryRow } from "@/components/runway/RunwayEntryRow";
import { Button } from "@/components/ui/Button";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useUnifiedNetWorth } from "@/hooks/useUnifiedNetWorth";
import type { Account } from "@/shared/types/expense";
import { getAccountKind } from "@/shared/utils/accountKind";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

type Colors = ReturnType<typeof useTheme>["theme"]["colors"];

/**
 * SPENDLY-535: one semantic theme colour per account kind, replacing the
 * per-type hex table. A user-picked `account.color` still wins for the icon.
 */
function tintForTypeName(typeName: string, colors: Colors): string {
  const n = typeName.toLowerCase();
  if (n.includes("credit")) return colors.destructive;
  if (n.includes("stock") || n.includes("demat") || n.includes("broker")) return colors.info;
  if (n.includes("cash") || n.includes("wallet") || n.includes("hand")) return colors.success;
  return colors.primary;
}

function iconForTypeName(typeName: string) {
  const n = typeName.toLowerCase();
  if (n.includes("credit")) return CreditCard;
  if (n.includes("cash") || n.includes("wallet") || n.includes("hand")) return Banknote;
  if (n.includes("fixed") || n.includes("deposit") || n.includes("fd")) return PiggyBank;
  if (n.includes("salary")) return Landmark;
  return Wallet;
}

/**
 * The Money hub's Accounts section (SPENDLY-535): the dashboard's net-worth
 * hero, where the money sits, the stocks account, then every account grouped
 * by type. Figures come from `useUnifiedNetWorth` and the accounts' own
 * balances, exactly as before.
 */
export function AccountsList() {
  const { push } = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const displayCurrency = useDisplayCurrency();

  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();

  // Progressive, as on the dashboard: figures show once the core ledger is in
  // and the hero says "Updating valuations…" until cards, loans and quotes
  // land. The final totals are the same summary either way (SPENDLY-535).
  const netWorth = useUnifiedNetWorth({ progressive: true });

  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isStockCashModalOpen, setIsStockCashModalOpen] = useState(false);
  const [isPayCreditModalOpen, setIsPayCreditModalOpen] = useState(false);
  const [selectedPayCardId] = useState<string | undefined>();

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

  const creditOutstandingById = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach((a) => {
      if (getAccountKind(typeMap.get(a.typeId) || "") !== "credit") return;
      map.set(a.id, a.currentOutstanding ?? 0);
    });
    return map;
  }, [accounts, typeMap]);

  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      const kind = getAccountKind(typeName);
      if (kind === "credit") {
        map.set(a.id, -(a.currentOutstanding ?? 0));
      } else {
        map.set(a.id, a.currentBalance ?? 0);
      }
    });
    return map;
  }, [accounts, typeMap]);

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
    haptic.selection().catch(() => undefined);
    push({
      pathname: "/accounts/[id]",
      params: { id: account.id },
    });
  };

  const handleOpenCreateAccount = () => {
    haptic.light().catch(() => undefined);
    setEditingAccount(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEditAccount = (account: Account) => {
    haptic.light().catch(() => undefined);
    setEditingAccount(account);
    setIsEditModalOpen(true);
  };

  const openPortfolio = () => {
    haptic.selection().catch(() => undefined);
    push("/investments?tab=portfolio" as never);
  };

  // Where the net worth sits. EPF only when there is some (KAN-71: the
  // simulated framing lives on the dashboard card and the EPF tab).
  const breakdown = [
    { key: "bank", label: "Bank & cash", value: netWorth.liquidBankAssets },
    { key: "fd", label: "Fixed deposits", value: netWorth.investmentsValue },
    { key: "stocks", label: "Stocks & demat", value: netWorth.totalStocksValue },
    ...(netWorth.epfValue > 0 ? [{ key: "epf", label: "EPF", value: netWorth.epfValue }] : []),
  ];

  return (
    <View style={styles.container}>
      <NetWorthHeroCard netWorth={netWorth} currency={displayCurrency} showAccountsLink={false} />

      <View style={styles.breakdownGrid}>
        {breakdown.map((item) => (
          <StatTile key={item.key} label={item.label} style={styles.breakdownTile}>
            <FinancialAmount value={item.value} currency={displayCurrency} size="md" weight="bold" />
          </StatTile>
        ))}
      </View>

      {/* SPENDLY-210: entry to Financial Runway */}
      <RunwayEntryRow />

      {/* Quick actions */}
      <View style={styles.quickActionsRow}>
        <Button
          variant="outline"
          size="sm"
          haptic={false}
          onPress={() => {
            haptic.selection().catch(() => undefined);
            setIsStockCashModalOpen(true);
          }}
          accessibilityLabel="Stocks Cash"
          style={styles.quickAction}
        >
          <TrendingUp size={18} color={theme.colors.primary} strokeWidth={2.2} />
          <Text
            style={[styles.quickActionText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            Stocks Cash
          </Text>
        </Button>

        <Button
          variant="outline"
          size="sm"
          haptic={false}
          onPress={() => {
            haptic.selection().catch(() => undefined);
            setIsEntryModalOpen(true);
          }}
          accessibilityLabel="Adjust Balance"
          style={styles.quickAction}
        >
          <SlidersHorizontal size={18} color={theme.colors.primary} strokeWidth={2.2} />
          <Text
            style={[styles.quickActionText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            Adjust Balance
          </Text>
        </Button>
      </View>

      {/* Stocks & Demat */}
      <Section
        title="Stocks & Demat"
        subtitle="Trading cash & equities"
        icon={<BarChart3 size={16} color={theme.colors.info} strokeWidth={2.3} />}
        iconTint={surfaces.wash(theme.colors.info)}
        action={
          <SectionAction label="Portfolio" onPress={openPortfolio} accessibilityLabel="View portfolio" />
        }
      >
        <View style={styles.tileRow}>
          <StatTile label="Cash balance">
            <FinancialAmount value={netWorth.stocksCashBalance} currency={displayCurrency} size="md" weight="bold" />
          </StatTile>
          <StatTile label="Holdings value">
            <FinancialAmount value={netWorth.stocksHoldingsValue} currency={displayCurrency} size="md" weight="bold" />
          </StatTile>
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
          <Button size="sm" onPress={openPortfolio} style={{ flex: 1 }}>
            View Portfolio
          </Button>
        </View>
      </Section>

      {/* Grouped accounts. The empty state keys off every account, not just
          deposits: a user holding only credit cards was told "No accounts yet"
          directly above their populated credit-cards section. */}
      {groupedAccounts.length === 0 && creditAccounts.length === 0 ? (
        <EmptyState
          illustration="accounts"
          title="No accounts yet"
          description="Add a savings, salary, or cash account to start tracking balances."
          primaryAction={{
            label: "Add Account",
            icon: <Plus size={16} color={theme.colors.primaryForeground} strokeWidth={2.4} />,
            onPress: handleOpenCreateAccount,
          }}
          secondaryAction={{
            label: "Adjust Balance",
            icon: <SlidersHorizontal size={16} color={theme.colors.primary} />,
            onPress: () => setIsEntryModalOpen(true),
          }}
          tip="Keep opening balances accurate so net worth stays trustworthy."
        />
      ) : (
        groupedAccounts.map((group) => {
          const tint = tintForTypeName(group.typeName, theme.colors);
          const TypeIcon = iconForTypeName(group.typeName);

          return (
            <View key={group.typeId} style={styles.groupSection}>
              <MetaLabel style={styles.groupHeader}>
                {group.typeName.toUpperCase()} · {group.list.length}
              </MetaLabel>

              <View style={styles.accountList}>
                {group.list.map((account) => {
                  const balance = accountBalances.get(account.id) ?? 0;

                  return (
                    <AccountRow
                      key={account.id}
                      account={account}
                      typeName={group.typeName}
                      tint={tint}
                      icon={
                        <TypeIcon size={18} color={account.color || tint} strokeWidth={2.1} />
                      }
                      onPress={() => handleOpenAccountDetail(account)}
                      onLongPress={() => handleOpenEditAccount(account)}
                      accessibilityLabel={`${account.name}, balance`}
                      trailing={
                        <FinancialAmount
                          value={balance}
                          currency={displayCurrency}
                          size="md"
                          weight="bold"
                          tone={balance < 0 ? "negative" : "default"}
                        />
                      }
                    />
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
          <MetaLabel style={styles.groupHeader}>
            CREDIT CARDS & LIABILITIES · {creditAccounts.length}
          </MetaLabel>
          <View style={styles.accountList}>
            {creditAccounts.map((account) => {
              const outstanding = creditOutstandingById.get(account.id) ?? 0;
              const tint = theme.colors.destructive;

              return (
                <AccountRow
                  key={account.id}
                  account={account}
                  typeName="Credit Card"
                  tint={tint}
                  icon={<CreditCard size={18} color={account.color || tint} strokeWidth={2.1} />}
                  onPress={() => handleOpenAccountDetail(account)}
                  onLongPress={() => handleOpenEditAccount(account)}
                  accessibilityLabel={`${account.name}, outstanding`}
                  trailing={
                    <View style={styles.outstanding}>
                      {/* LiabilityAmount keeps its minus even with amounts hidden. */}
                      <LiabilityAmount
                        value={outstanding}
                        currency={displayCurrency}
                        ghostable
                        style={{ fontSize: 16, fontFamily: theme.fontFamily.bold }}
                      />
                      <MetaLabel>Outstanding</MetaLabel>
                    </View>
                  }
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Add Account */}
      <Button
        variant="outline"
        size="sm"
        onPress={handleOpenCreateAccount}
        accessibilityLabel="Add Account"
        style={styles.addAccountButton}
      >
        <Plus size={18} color={theme.colors.primary} strokeWidth={2.4} />
        <Text style={[styles.addAccountText, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>
          Add Account
        </Text>
      </Button>

      <Pressable
        onPress={() => {
          haptic.selection().catch(() => undefined);
          setIsTransferModalOpen(true);
        }}
        style={styles.transferLink}
        accessibilityRole="button"
        accessibilityLabel="Transfer between accounts"
      >
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 13, fontFamily: theme.fontFamily.semibold }}>
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
        currency={displayCurrency}
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
  breakdownGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  breakdownTile: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 140,
  },
  tileRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickAction: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  quickActionText: {
    fontSize: 13,
  },
  groupSection: {
    gap: 8,
  },
  groupHeader: {
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  stockActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  accountList: {
    gap: 8,
  },
  outstanding: {
    alignItems: "flex-end",
    gap: 1,
  },
  addAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
  },
  addAccountText: {
    fontSize: 14,
  },
  transferLink: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
});

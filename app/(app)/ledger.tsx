import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CreditCard,
  HandCoins,
  History,
  Plane,
  Plus,
  Repeat,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useLedgerState, type LedgerTab } from "@/providers/LedgerStateProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { computeBankBalance } from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { currentMonthKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function LedgerScreen() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();
  const { setIsAddExpenseOpen, globalMonth } = useModals();
  const {
    ledgerTab,
    setLedgerTab,
    expensesTab,
    setExpensesTab,
    query,
    setQuery,
  } = useLedgerState();

  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { payments } = useAccountPayments();
  const { entries } = useAccountEntries();
  const { transfers } = useAccountTransfers();

  const activeMonth = globalMonth || currentMonthKey(settings.timezone);

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  // Filtered expenses for active month + search query
  const filteredExpenses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchMonth =
        !activeMonth ||
        e.month === activeMonth ||
        (e.date && e.date.startsWith(activeMonth));
      if (!matchMonth) return false;
      if (!q) return true;
      return (
        (e.note && e.note.toLowerCase().includes(q)) ||
        (e.category && e.category.toLowerCase().includes(q)) ||
        (e.subcategory && e.subcategory.toLowerCase().includes(q)) ||
        (e.tags && e.tags.some((t) => t.toLowerCase().includes(q)))
      );
    });
  }, [expenses, activeMonth, query]);

  // Filtered incomes for active month + search query
  const filteredIncomes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return incomes.filter((i) => {
      const matchMonth =
        !activeMonth ||
        i.month === activeMonth ||
        (i.date && i.date.startsWith(activeMonth));
      if (!matchMonth) return false;
      if (!q) return true;
      return (
        (i.source && i.source.toLowerCase().includes(q)) ||
        (i.note && i.note.toLowerCase().includes(q))
      );
    });
  }, [incomes, activeMonth, query]);

  const allTabs: PageHeaderTab[] = [
    {
      id: "expenses",
      label: `Journal (${filteredExpenses.length})`,
      icon: <History size={16} color={theme.colors.foreground} />,
    },
    {
      id: "accounts",
      label: `Accounts (${accounts.length})`,
      icon: <Wallet size={16} color={theme.colors.foreground} />,
    },
    {
      id: "cards",
      label: "Cards",
      icon: <CreditCard size={16} color={theme.colors.foreground} />,
    },
    {
      id: "splits",
      label: "Splits",
      icon: <Users size={16} color={theme.colors.foreground} />,
    },
    {
      id: "subscriptions",
      label: "Subscriptions",
      icon: <Repeat size={16} color={theme.colors.foreground} />,
    },
    {
      id: "travel",
      label: "Travel",
      icon: <Plane size={16} color={theme.colors.foreground} />,
    },
    {
      id: "collect",
      label: "Collect",
      icon: <HandCoins size={16} color={theme.colors.foreground} />,
    },
    ...(settings.enableInvestments
      ? [
          {
            id: "investments",
            label: "Investments",
            icon: <TrendingUp size={16} color={theme.colors.foreground} />,
          },
        ]
      : []),
  ];

  return (
    <PageShell contentContainerStyle={styles.container}>
      <PageHeader
        title="Ledger Hub"
        subtitle="Transactions & Accounts"
        icon={<Wallet size={22} color={theme.colors.primary} />}
        activeTab={ledgerTab}
        onTabChange={(tab) => setLedgerTab(tab as LedgerTab)}
        tabs={allTabs}
      />

      {/* Tab: Expenses (Journal) */}
      {ledgerTab === "expenses" && (
        <View style={styles.sectionContainer}>
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

          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes, categories, tags..."
          />

          {expensesTab === "history" && (
            <>
              {expensesLoading ? (
                <ActivityIndicator
                  size="large"
                  color={theme.colors.primary}
                  style={{ marginTop: 24 }}
                />
              ) : filteredExpenses.length === 0 ? (
                <EmptyState
                  icon={<History size={36} color={theme.colors.mutedForeground} />}
                  title="No Expenses in this View"
                  description={
                    query
                      ? `No records matching "${query}".`
                      : `No expenses logged for ${activeMonth}.`
                  }
                  action={
                    <Button onPress={() => setIsAddExpenseOpen(true)}>
                      Add Expense
                    </Button>
                  }
                />
              ) : (
                <View style={styles.itemList}>
                  {filteredExpenses.map((e, idx) => (
                    <View
                      key={e.id || `exp-${idx}`}
                      style={[
                        styles.itemCard,
                        {
                          backgroundColor: theme.colors.card,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <View style={styles.itemLeft}>
                        <View
                          style={[
                            styles.categoryBadge,
                            {
                              backgroundColor: isDark
                                ? "rgba(107, 99, 255, 0.15)"
                                : "rgba(79, 70, 255, 0.1)",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryBadgeText,
                              { color: theme.colors.primary },
                            ]}
                          >
                            {e.category}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.itemTitle,
                            { color: theme.colors.foreground },
                          ]}
                          numberOfLines={1}
                        >
                          {e.note || e.subcategory || e.category}
                        </Text>
                        <Text
                          style={[
                            styles.itemSubtitle,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          {e.date} {e.time ? `• ${e.time}` : ""}
                        </Text>
                      </View>

                      <Amount
                        value={e.amount}
                        currency={system.defaultCurrency}
                        ghostable
                        style={{
                          color: theme.colors.foreground,
                          fontSize: theme.typography.md,
                          fontWeight: "700",
                        }}
                      />
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {expensesTab === "income" && (
            <>
              {incomesLoading ? (
                <ActivityIndicator
                  size="large"
                  color={theme.colors.primary}
                  style={{ marginTop: 24 }}
                />
              ) : filteredIncomes.length === 0 ? (
                <EmptyState
                  icon={<TrendingUp size={36} color={theme.colors.mutedForeground} />}
                  title="No Incomes Recorded"
                  description={`No income entries found for ${activeMonth}.`}
                  action={
                    <Button onPress={() => setIsAddExpenseOpen(true)}>
                      Add Income
                    </Button>
                  }
                />
              ) : (
                <View style={styles.itemList}>
                  {filteredIncomes.map((inc, idx) => (
                    <View
                      key={inc.id || `inc-${idx}`}
                      style={[
                        styles.itemCard,
                        {
                          backgroundColor: theme.colors.card,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <View style={styles.itemLeft}>
                        <Text
                          style={[
                            styles.itemTitle,
                            { color: theme.colors.foreground },
                          ]}
                        >
                          {inc.source || "Income"}
                        </Text>
                        <Text
                          style={[
                            styles.itemSubtitle,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          {inc.date} {inc.note ? `• ${inc.note}` : ""}
                        </Text>
                      </View>

                      <Amount
                        value={inc.amount}
                        currency={system.defaultCurrency}
                        ghostable
                        style={{
                          color: theme.colors.success,
                          fontSize: theme.typography.md,
                          fontWeight: "700",
                        }}
                      />
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {expensesTab === "audit" && (
            <EmptyState
              icon={<Sparkles size={36} color={theme.colors.mutedForeground} />}
              title="Audit Log"
              description="Realtime audit trail and transaction history logs."
            />
          )}

          {expensesTab === "data" && (
            <EmptyState
              icon={<History size={36} color={theme.colors.mutedForeground} />}
              title="Data Management"
              description="Export, backup, and restore your financial datasets."
            />
          )}
        </View>
      )}

      {/* Tab: Accounts */}
      {ledgerTab === "accounts" && (
        <View style={styles.sectionContainer}>
          {accountsLoading ? (
            <ActivityIndicator
              size="large"
              color={theme.colors.primary}
              style={{ marginTop: 24 }}
            />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={<Wallet size={36} color={theme.colors.mutedForeground} />}
              title="No Bank or Cash Accounts"
              description="Track bank accounts, wallets, and cash reserves in one place."
              action={
                <Button onPress={() => setIsAddExpenseOpen(true)}>
                  Add Account
                </Button>
              }
            />
          ) : (
            <View style={styles.itemList}>
              {accounts.map((acc) => {
                const typeName = typeMap.get(acc.typeId) || "Account";
                const kind = getAccountKind(typeName);
                const balance =
                  kind !== "credit"
                    ? computeBankBalance(
                        acc,
                        expenses,
                        incomes,
                        payments,
                        entries,
                        transfers
                      )
                    : 0;

                return (
                  <View
                    key={acc.id}
                    style={[
                      styles.itemCard,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.itemLeft}>
                      <Text
                        style={[
                          styles.itemTitle,
                          { color: theme.colors.foreground },
                        ]}
                      >
                        {acc.name}
                      </Text>
                      <Text
                        style={[
                          styles.itemSubtitle,
                          { color: theme.colors.mutedForeground },
                        ]}
                      >
                        {typeName}
                      </Text>
                    </View>

                    {kind !== "credit" && (
                      <Amount
                        value={balance}
                        currency={system.defaultCurrency}
                        ghostable
                        style={{
                          color:
                            balance >= 0
                              ? theme.colors.foreground
                              : theme.colors.destructive,
                          fontSize: theme.typography.md,
                          fontWeight: "700",
                        }}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Tab: Cards */}
      {ledgerTab === "cards" && (
        <View style={styles.sectionContainer}>
          <EmptyState
            icon={<CreditCard size={36} color={theme.colors.mutedForeground} />}
            title="Credit Cards"
            description="Statement cycle tracking, bill payments, and credit limits connect in Phase 13."
          />
        </View>
      )}

      {/* Tab: Splits */}
      {ledgerTab === "splits" && (
        <View style={styles.sectionContainer}>
          <EmptyState
            icon={<Users size={36} color={theme.colors.mutedForeground} />}
            title="Split Expenses"
            description="Group settlements, UPI deep-linking, and debt tracking connect in Phase 12."
          />
        </View>
      )}

      {/* Tab: Subscriptions */}
      {ledgerTab === "subscriptions" && (
        <View style={styles.sectionContainer}>
          <EmptyState
            icon={<Repeat size={36} color={theme.colors.mutedForeground} />}
            title="Subscriptions"
            description="Recurring bills, renewal calendar, and autopay tracking connect in Phase 14."
          />
        </View>
      )}

      {/* Tab: Travel */}
      {ledgerTab === "travel" && (
        <View style={styles.sectionContainer}>
          <EmptyState
            icon={<Plane size={36} color={theme.colors.mutedForeground} />}
            title="Travel Vaults"
            description="Trip budgets, multi-currency conversion, and travel logs connect in Phase 15."
          />
        </View>
      )}

      {/* Tab: Collect */}
      {ledgerTab === "collect" && (
        <View style={styles.sectionContainer}>
          <EmptyState
            icon={<HandCoins size={36} color={theme.colors.mutedForeground} />}
            title="Payment Requests"
            description="UPI payment links and payment collection requests connect in Phase 16."
          />
        </View>
      )}

      {/* Tab: Investments */}
      {ledgerTab === "investments" && (
        <View style={styles.sectionContainer}>
          <EmptyState
            icon={<TrendingUp size={36} color={theme.colors.mutedForeground} />}
            title="Investments"
            description="Portfolio tracking and investment logs connect in Phase 17."
          />
        </View>
      )}
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
  itemList: {
    gap: 8,
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

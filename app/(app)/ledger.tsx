import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Calendar,
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

import { AccountsList } from "@/components/accounts/AccountsList";
import { CardsList } from "@/components/accounts/CardsList";
import { SubscriptionsList } from "@/components/subscriptions/SubscriptionsList";
import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { ExpenseList } from "@/components/ExpenseList";
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

          {/* Search bar & Active Month Pill */}
          <View style={styles.searchAndMonthRow}>
            <View style={{ flex: 1 }}>
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Search notes, categories, tags..."
              />
            </View>
            <Pressable
              onPress={() => {
                setIsMonthDrawerOpen(true);
              }}
              style={[
                styles.monthPickerButton,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Calendar size={16} color={theme.colors.primary} />
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  fontWeight: "700",
                  color: theme.colors.foreground,
                }}
              >
                {activeMonth}
              </Text>
            </Pressable>
          </View>

          {expensesTab === "history" && (
            <>
              {expensesLoading ? (
                <ActivityIndicator
                  size="large"
                  color={theme.colors.primary}
                  style={{ marginTop: 24 }}
                />
              ) : (
                <ExpenseList
                  expenses={filteredExpenses}
                  accounts={accounts}
                  onEditExpense={(exp) => {
                    setEditingExpense(exp);
                    setIsAddExpenseOpen(true);
                  }}
                />
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
              ) : (
                <ExpenseList
                  expenses={[]}
                  incomes={filteredIncomes}
                  accounts={accounts}
                  onEditIncome={(inc) => {
                    setEditingIncome(inc);
                    setIsAddExpenseOpen(true);
                  }}
                />
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
      {ledgerTab === "accounts" && <AccountsList />}

      {/* Tab: Cards */}
      {ledgerTab === "cards" && <CardsList />}

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
      {ledgerTab === "subscriptions" && <SubscriptionsList />}

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
  searchAndMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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

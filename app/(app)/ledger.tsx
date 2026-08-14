import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowDownLeft,
  BarChart3,
  Calendar,
  CreditCard,
  HandCoins,
  History,
  Landmark,
  LayoutGrid,
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
import { CreditCardBillsList } from "@/components/creditCardBills/CreditCardBillsList";
import { BorrowingsList } from "@/components/borrowings/BorrowingsList";
import { ReceivablesList } from "@/components/receivables/ReceivablesList";
import { CollectList } from "@/components/collect/CollectList";
import { SpacesList } from "@/components/spaces/SpacesList";
import { SplitsList } from "@/components/splits/SplitsList";
import { SubscriptionsList } from "@/components/subscriptions/SubscriptionsList";
import { TripsList } from "@/components/trips/TripsList";
import { InvestmentsList } from "@/components/investments/InvestmentsList";
import { PortfolioDashboard } from "@/components/portfolio/PortfolioDashboard";
import { SipDashboard } from "@/components/sip/SipDashboard";
import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { SearchBar } from "@/components/common/SearchBar";
import { Skeleton } from "@/components/common/Skeleton";
import { ExpenseList } from "@/components/ExpenseList";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
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
  const investmentsEnabled = settings.enableInvestments && system.enableInvestments;

  useEffect(() => {
    if (params.tab === "subscriptions") {
      setLedgerTab("subscriptions");
    }
  }, [params.tab, setLedgerTab]);

  useEffect(() => {
    if (!investmentsEnabled && (ledgerTab === "investments" || ledgerTab === "portfolio")) {
      setLedgerTab("expenses");
    }
  }, [investmentsEnabled, ledgerTab, setLedgerTab]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

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

  const tabIconColor = (id: string) =>
    ledgerTab === id ? theme.colors.success : theme.colors.mutedForeground;

  const allTabs: PageHeaderTab[] = [
    {
      id: "expenses",
      label: `Journal (${filteredExpenses.length})`,
      icon: <History size={16} color={tabIconColor("expenses")} />,
    },
    {
      id: "accounts",
      label: `Accounts (${accounts.length})`,
      icon: <Wallet size={16} color={tabIconColor("accounts")} />,
    },
    {
      id: "cards",
      label: "Cards",
      icon: <CreditCard size={16} color={tabIconColor("cards")} />,
    },
    {
      id: "ccBills",
      label: "CC Bills",
      icon: <Calendar size={16} color={tabIconColor("ccBills")} />,
    },
    {
      id: "borrowings",
      label: "Borrowings",
      icon: <Landmark size={16} color={tabIconColor("borrowings")} />,
    },
    {
      id: "receivables",
      label: "Receivables",
      icon: <ArrowDownLeft size={16} color={tabIconColor("receivables")} />,
    },
    {
      id: "spaces",
      label: "Spaces",
      icon: <LayoutGrid size={16} color={tabIconColor("spaces")} />,
    },
    {
      id: "splits",
      label: "Splits",
      icon: <Users size={16} color={tabIconColor("splits")} />,
    },
    {
      id: "subscriptions",
      label: "Subscriptions",
      icon: <Repeat size={16} color={tabIconColor("subscriptions")} />,
    },
    {
      id: "travel",
      label: "Travel",
      icon: <Plane size={16} color={tabIconColor("travel")} />,
    },
    {
      id: "collect",
      label: "Collect",
      icon: <HandCoins size={16} color={tabIconColor("collect")} />,
    },
    ...(investmentsEnabled
      ? [
          {
            id: "investments",
            label: "Investments",
            icon: <TrendingUp size={16} color={tabIconColor("investments")} />,
          },
          {
            id: "portfolio",
            label: "Stocks",
            icon: <BarChart3 size={16} color={tabIconColor("portfolio")} />,
          },
          {
            id: "sip",
            label: "Virtual SIPs",
            icon: <Calendar size={16} color={tabIconColor("sip")} />,
          },
        ]
      : []),
  ];

  const isExpenseListTab =
    ledgerTab === "expenses" && (expensesTab === "history" || expensesTab === "income");

  return (
    <PageShell
      scrollable={!isExpenseListTab}
      contentContainerStyle={styles.container}
    >
      <PageHeader
        title="Ledger Hub"
        subtitle="Transactions & Accounts"
        icon={<Wallet size={22} color={theme.colors.success} />}
        activeTab={ledgerTab}
        onTabChange={(tab) => setLedgerTab(tab as LedgerTab)}
        tabs={allTabs}
        tabVariant="underline"
      />

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

          {/* Search bar & Active Month Pill */}
          <View style={styles.searchAndMonthRow}>
            <View style={{ flex: 1 }}>
              <SearchBar
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
            <View style={{ flex: 1 }}>
              {expensesLoading && filteredExpenses.length === 0 ? (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} height={64} borderRadius={theme.radius.lg} />
                  ))}
                </View>
              ) : (
                <ExpenseList
                  expenses={filteredExpenses}
                  incomes={filteredIncomes}
                  accounts={accounts}
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
              ) : (
                <ExpenseList
                  expenses={[]}
                  incomes={filteredIncomes}
                  accounts={accounts}
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

          {expensesTab === "audit" && (
            <EmptyState
              illustration="search"
              title="Audit Trail Clean"
              description="Realtime audit trail and transaction history logs will appear here as entries are modified."
              primaryAction={{
                label: "View Journal",
                onPress: () => setExpensesTab("history"),
              }}
              tip="All modifications, deletions, and balance adjustments are logged with timestamps for security."
            />
          )}

          {expensesTab === "data" && (
            <EmptyState
              illustration="general"
              title="Data & Backup Vault"
              description="Export, backup, and restore your financial datasets securely."
              primaryAction={{
                label: "Export CSV / JSON",
                onPress: () => router.push("/settings"),
              }}
              secondaryAction={{
                label: "Manage Cloud Sync",
                onPress: () => router.push("/settings"),
              }}
              tip="Cloud synchronization keeps all your accounts seamlessly aligned across devices."
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

      {/* Tab: Borrowings */}
      {ledgerTab === "borrowings" && <BorrowingsList />}

      {/* Tab: Receivables */}
      {ledgerTab === "receivables" && <ReceivablesList />}

      {/* Tab: Spaces */}
      {ledgerTab === "spaces" && <SpacesList />}

      {/* Tab: Splits */}
      {ledgerTab === "splits" && <SplitsList />}

      {/* Tab: Subscriptions */}
      {ledgerTab === "subscriptions" && <SubscriptionsList />}

      {/* Tab: Travel */}
      {ledgerTab === "travel" && <TripsList />}

      {/* Tab: Collect */}
      {ledgerTab === "collect" && <CollectList />}

      {/* Tab: Investments */}
      {ledgerTab === "investments" && investmentsEnabled && <InvestmentsList />}

      {/* Tab: Portfolio / Stocks */}
      {ledgerTab === "portfolio" && investmentsEnabled && <PortfolioDashboard />}

      {/* Tab: Virtual SIPs */}
      {ledgerTab === "sip" && investmentsEnabled && <SipDashboard />}
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

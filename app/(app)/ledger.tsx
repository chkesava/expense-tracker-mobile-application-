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
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useLedgerState, type LedgerTab } from "@/providers/LedgerStateProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function LedgerScreen() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings } = useSettings();
  const { setIsAddExpenseOpen } = useModals();
  const {
    ledgerTab,
    setLedgerTab,
    expensesTab,
    setExpensesTab,
    query,
    setQuery,
  } = useLedgerState();

  const allTabs: PageHeaderTab[] = [
    { id: "expenses", label: "Journal", icon: <History size={16} color={theme.colors.foreground} /> },
    { id: "accounts", label: "Accounts", icon: <Wallet size={16} color={theme.colors.foreground} /> },
    { id: "cards", label: "Cards", icon: <CreditCard size={16} color={theme.colors.foreground} /> },
    { id: "splits", label: "Splits", icon: <Users size={16} color={theme.colors.foreground} /> },
    { id: "subscriptions", label: "Subscriptions", icon: <Repeat size={16} color={theme.colors.foreground} /> },
    { id: "travel", label: "Travel", icon: <Plane size={16} color={theme.colors.foreground} /> },
    { id: "collect", label: "Collect", icon: <HandCoins size={16} color={theme.colors.foreground} /> },
    ...(settings.enableInvestments
      ? [{ id: "investments", label: "Investments", icon: <TrendingUp size={16} color={theme.colors.foreground} /> }]
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
                      borderColor: isActive ? theme.colors.primary : theme.colors.border,
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
            placeholder="Search notes, merchants, tags..."
          />

          <EmptyState
            icon={<History size={36} color={theme.colors.mutedForeground} />}
            title="Ledger Journal"
            description="Realtime Firestore ledger data and category filters connect in Phase 6."
            action={
              <Button onPress={() => setIsAddExpenseOpen(true)}>
                Add Entry
              </Button>
            }
          />
        </View>
      )}

      {/* Tab: Accounts */}
      {ledgerTab === "accounts" && (
        <View style={styles.sectionContainer}>
          <EmptyState
            icon={<Wallet size={36} color={theme.colors.mutedForeground} />}
            title="Bank & Cash Accounts"
            description="Opening balances, transfers, and account reconciliations connect in Phase 7."
            action={
              <Button onPress={() => setIsAddExpenseOpen(true)}>
                Add Account
              </Button>
            }
          />
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
});

import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CreditCard,
  Flame,
  History,
  Home as HomeIcon,
  PieChart,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Split,
  Target,
  Wallet,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Card } from "@/components/ui/Card";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useAuth } from "@/providers/AuthProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { computeBankBalance } from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { currentMonthKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function DashboardScreen() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { isDuress } = useAuth();
  const { settings: system } = useSystemSettings();
  const { settings } = useSettings();
  const { globalMonth, setIsAddExpenseOpen, setIsMonthDrawerOpen } = useModals();

  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { payments } = useAccountPayments();
  const { entries } = useAccountEntries();
  const { transfers } = useAccountTransfers();

  const [refreshing, setRefreshing] = useState(false);

  const activeMonth = globalMonth || currentMonthKey(settings.timezone);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 600);
  };

  // Filtered transactions for active month
  const monthlyExpenses = useMemo(() => {
    return expenses.filter(
      (e) => e.month === activeMonth || (e.date && e.date.startsWith(activeMonth))
    );
  }, [expenses, activeMonth]);

  const monthlyIncomes = useMemo(() => {
    return incomes.filter(
      (i) => i.month === activeMonth || (i.date && i.date.startsWith(activeMonth))
    );
  }, [incomes, activeMonth]);

  // Aggregated totals
  const monthlySpent = useMemo(() => {
    return monthlyExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [monthlyExpenses]);

  const monthlyIncome = useMemo(() => {
    return monthlyIncomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  }, [monthlyIncomes]);

  // Account type map for kinds
  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  // Total balance computation
  const totalBalance = useMemo(() => {
    const nonCreditAccounts = accounts.filter((acc) => {
      const typeName = typeMap.get(acc.typeId) || "";
      return getAccountKind(typeName) !== "credit";
    });

    if (nonCreditAccounts.length > 0) {
      return nonCreditAccounts.reduce((sum, acc) => {
        return (
          sum +
          computeBankBalance(
            acc,
            expenses,
            incomes,
            payments,
            entries,
            transfers
          )
        );
      }, 0);
    }

    // Fallback if no bank accounts configured yet
    const lifetimeIncome = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
    const lifetimeSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    return lifetimeIncome - lifetimeSpent;
  }, [accounts, typeMap, expenses, incomes, payments, entries, transfers]);

  // Budget progress
  const budgetProgress = useMemo(() => {
    if (!settings.monthlyBudget || settings.monthlyBudget <= 0) return 0;
    return Math.min(100, Math.round((monthlySpent / settings.monthlyBudget) * 100));
  }, [monthlySpent, settings.monthlyBudget]);

  // 5 Most recent transactions
  const recentTransactions = useMemo(() => {
    return expenses.slice(0, 5);
  }, [expenses]);

  const isLoading = expensesLoading || incomesLoading || accountsLoading;

  return (
    <PageShell
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.container}
    >
      <PageHeader
        title="Dashboard"
        subtitle="Financial Overview"
        icon={<HomeIcon size={22} color={theme.colors.primary} />}
      />

      {/* Duress Session Warning */}
      {isDuress ? (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: isDark
                ? "rgba(245, 158, 11, 0.15)"
                : "rgba(245, 158, 11, 0.1)",
              borderColor: theme.colors.warning,
            },
          ]}
        >
          <ShieldAlert size={18} color={theme.colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: theme.colors.warning }]}>
              Duress Mode Active
            </Text>
            <Text style={[styles.alertText, { color: theme.colors.mutedForeground }]}>
              Running isolated decoy session. Real ledger data is not loaded.
            </Text>
          </View>
        </View>
      ) : null}

      {/* System Announcement Banner */}
      {system.announcementBanner ? (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.15)"
                : "rgba(79, 70, 255, 0.08)",
              borderColor: theme.colors.primary,
            },
          ]}
        >
          <Sparkles size={18} color={theme.colors.primary} />
          <Text style={[styles.alertText, { color: theme.colors.foreground, flex: 1 }]}>
            {system.announcementBanner}
          </Text>
        </View>
      ) : null}

      {/* Main Balance & Overview Bento Card */}
      <View
        style={[
          styles.overviewCard,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.35 : 0.08,
            shadowRadius: 16,
            elevation: 6,
          },
        ]}
      >
        <View style={styles.overviewHeader}>
          <Text style={[styles.overviewSubtitle, { color: theme.colors.mutedForeground }]}>
            TOTAL BALANCE
          </Text>
          <Pressable
            onPress={() => setIsMonthDrawerOpen(true)}
            style={({ pressed }) => [
              styles.monthBadge,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
                borderColor: theme.colors.border,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Calendar size={12} color={theme.colors.primary} style={{ marginRight: 4 }} />
            <Text style={[styles.monthBadgeText, { color: theme.colors.primary }]}>
              {activeMonth}
            </Text>
          </Pressable>
        </View>

        <View style={styles.amountRow}>
          {isLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Amount
              value={totalBalance}
              currency={system.defaultCurrency}
              ghostable
              style={{ fontSize: theme.typography.xxl, fontWeight: "900" }}
            />
          )}
        </View>

        {/* In / Out Stats */}
        <View
          style={[
            styles.statsRow,
            {
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.statBox}>
            <View style={styles.statLabelRow}>
              <ArrowDownLeft size={14} color={theme.colors.success} />
              <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                Income
              </Text>
            </View>
            <Amount
              value={monthlyIncome}
              currency={system.defaultCurrency}
              ghostable
              style={{ color: theme.colors.success, fontSize: theme.typography.md, fontWeight: "700" }}
            />
          </View>

          <View
            style={[
              styles.statDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />

          <View style={styles.statBox}>
            <View style={styles.statLabelRow}>
              <ArrowUpRight size={14} color={theme.colors.destructive} />
              <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                Spent
              </Text>
            </View>
            <Amount
              value={monthlySpent}
              currency={system.defaultCurrency}
              ghostable
              style={{ color: theme.colors.foreground, fontSize: theme.typography.md, fontWeight: "700" }}
            />
          </View>
        </View>
      </View>

      {/* Quick Action Buttons */}
      <View style={styles.quickActionsGrid}>
        <Pressable
          onPress={() => setIsAddExpenseOpen(true)}
          style={({ pressed }) => [
            styles.quickActionButton,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.12)"
                : "rgba(79, 70, 255, 0.08)",
              borderColor: isDark ? "rgba(107, 99, 255, 0.3)" : "rgba(79, 70, 255, 0.2)",
            },
            pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
          ]}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: theme.colors.primary }]}>
            <Plus size={18} color={theme.colors.primaryForeground} strokeWidth={2.5} />
          </View>
          <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
            Add Expense
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push("/ledger");
          }}
          style={({ pressed }) => [
            styles.quickActionButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
            pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
          ]}
        >
          <View
            style={[
              styles.actionIconWrap,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
              },
            ]}
          >
            <Wallet size={18} color={theme.colors.foreground} />
          </View>
          <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
            Ledger
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push("/insights");
          }}
          style={({ pressed }) => [
            styles.quickActionButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
            pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
          ]}
        >
          <View
            style={[
              styles.actionIconWrap,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
              },
            ]}
          >
            <BarChart3 size={18} color={theme.colors.foreground} />
          </View>
          <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
            Insights
          </Text>
        </Pressable>
      </View>

      {/* Widgets & Recent Transactions Grid */}
      <View style={styles.widgetsGrid}>
        {/* Monthly Budget Card */}
        {settings.monthlyBudget > 0 ? (
          <Card
            title="Monthly Budget"
            subtitle={`Target: ${system.defaultCurrency}${settings.monthlyBudget.toLocaleString()}`}
          >
            <View style={styles.budgetProgressContainer}>
              <View
                style={[
                  styles.progressBarBg,
                  { backgroundColor: theme.colors.muted },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, Math.max(2, budgetProgress))}%`,
                      backgroundColor:
                        budgetProgress >= 100
                          ? theme.colors.destructive
                          : budgetProgress >= 80
                            ? theme.colors.warning
                            : theme.colors.primary,
                    },
                  ]}
                />
              </View>
              <View style={styles.budgetFooter}>
                <Text style={[styles.budgetText, { color: theme.colors.mutedForeground }]}>
                  {budgetProgress}% used
                </Text>
                <Amount
                  value={Math.max(0, settings.monthlyBudget - monthlySpent)}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{ fontSize: theme.typography.sm, fontWeight: "600" }}
                />
              </View>
            </View>
          </Card>
        ) : null}

        {/* Recent Transactions Live Feed */}
        <Card
          title="Recent Transactions"
          subtitle={`${expenses.length} total recorded`}
        >
          {recentTransactions.length === 0 ? (
            <EmptyState
              icon={<History size={32} color={theme.colors.mutedForeground} />}
              title="No Transactions"
              description="Your logged expenses will appear here in realtime."
            />
          ) : (
            <View style={styles.transactionsList}>
              {recentTransactions.map((item, index) => (
                <View
                  key={item.id || `tx-${index}`}
                  style={[
                    styles.transactionRow,
                    index < recentTransactions.length - 1 && {
                      borderBottomColor: theme.colors.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View style={styles.txLeft}>
                    <View
                      style={[
                        styles.categoryDot,
                        {
                          backgroundColor: isDark
                            ? "rgba(107, 99, 255, 0.2)"
                            : "rgba(79, 70, 255, 0.12)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryDotText,
                          { color: theme.colors.primary },
                        ]}
                      >
                        {item.category?.charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                    <View style={styles.txMeta}>
                      <Text
                        style={[styles.txTitle, { color: theme.colors.foreground }]}
                        numberOfLines={1}
                      >
                        {item.note || item.category || "Expense"}
                      </Text>
                      <Text
                        style={[
                          styles.txSubtitle,
                          { color: theme.colors.mutedForeground },
                        ]}
                      >
                        {item.date} • {item.category}
                      </Text>
                    </View>
                  </View>

                  <Amount
                    value={item.amount}
                    currency={system.defaultCurrency}
                    ghostable
                    style={{
                      color: theme.colors.foreground,
                      fontWeight: "700",
                      fontSize: theme.typography.md,
                    }}
                  />
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  alertText: {
    fontSize: 12,
    lineHeight: 16,
  },
  overviewCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  overviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  overviewSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  monthBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  monthBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  amountRow: {
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
  },
  statBox: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 16,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  quickActionsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  quickActionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  widgetsGrid: {
    gap: 16,
  },
  budgetProgressContainer: {
    gap: 8,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  budgetFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  budgetText: {
    fontSize: 12,
    fontWeight: "500",
  },
  transactionsList: {
    gap: 4,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  txLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  categoryDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryDotText: {
    fontSize: 14,
    fontWeight: "800",
  },
  txMeta: {
    flex: 1,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  txSubtitle: {
    fontSize: 11,
  },
});

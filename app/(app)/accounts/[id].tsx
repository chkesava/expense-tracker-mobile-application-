import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  Edit2,
  FolderTree,
  Landmark,
  Plus,
  SlidersHorizontal,
  Wallet,
} from "lucide-react-native";

import { AddAccountEntryModal } from "@/components/accounts/AddAccountEntryModal";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import { Amount } from "@/components/common/Amount";
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
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { AccountActivity } from "@/shared/types/expense";
import {
  buildAccountActivities,
  computeBankBalance,
  computeCreditUsage,
  getCreditBillHistory,
} from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function AccountDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
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

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<"all" | "debit" | "credit">("all");

  const account = useMemo(() => {
    return accounts.find((a) => a.id === id);
  }, [accounts, id]);

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

  // Balance or Credit calculation
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

  // Build full activities timeline
  const activities = useMemo(() => {
    if (!account) return [];
    const list = buildAccountActivities(
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
    // Sort descending by date
    return list.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
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

  const filteredActivities = useMemo(() => {
    if (activityFilter === "all") return activities;
    return activities.filter((a) => a.type === activityFilter);
  }, [activities, activityFilter]);

  if (!account) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background,
            paddingTop: insets.top + 16,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
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
    );
  }

  const accountColor = account.color || theme.colors.primary;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top,
        },
      ]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.back();
          }}
          style={styles.headerBtn}
        >
          <ArrowLeft size={20} color={theme.colors.foreground} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text
            style={[
              styles.headerTitle,
              {
                color: theme.colors.foreground,
                fontSize: theme.typography.lg,
              },
            ]}
            numberOfLines={1}
          >
            {account.name}
          </Text>
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.xs,
            }}
          >
            {account.accountNumber
              ? `${typeName} • ${account.accountNumber}`
              : typeName}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            setIsEditModalOpen(true);
          }}
          style={styles.headerBtn}
        >
          <Edit2 size={18} color={theme.colors.foreground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 50 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance / Credit Overview Hero Card */}
        {isCreditCard && creditUsage ? (
          <Card
            style={[
              styles.heroCard,
              {
                backgroundColor: isDark
                  ? "rgba(49, 46, 129, 0.4)"
                  : "rgba(243, 232, 255, 0.9)",
                borderColor: accountColor,
              },
            ]}
          >
            <View style={styles.heroTop}>
              <View>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                    fontWeight: "700",
                    textTransform: "uppercase",
                  }}
                >
                  Current Used (This Cycle)
                </Text>
                <Amount
                  value={creditUsage.usedThisCycle}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{
                    fontSize: 28,
                    fontWeight: "800",
                    color: theme.colors.destructive,
                  }}
                />
              </View>

              <View
                style={[
                  styles.countdownBadge,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.04)",
                  },
                ]}
              >
                <Calendar size={12} color={theme.colors.mutedForeground} />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Resets in {creditUsage.daysRemaining}d
                </Text>
              </View>
            </View>

            <View style={styles.heroStatsRow}>
              <View>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Available Credit
                </Text>
                <Amount
                  value={creditUsage.availableCredit}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{
                    fontSize: theme.typography.md,
                    fontWeight: "800",
                    color: theme.colors.success,
                  }}
                />
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Credit Limit
                </Text>
                <Amount
                  value={account.creditLimit || 0}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{
                    fontSize: theme.typography.md,
                    fontWeight: "800",
                    color: theme.colors.foreground,
                  }}
                />
              </View>
            </View>

            <Pressable
              onPress={() => setIsPayModalOpen(true)}
              style={[
                styles.heroCtaBtn,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <CheckCircle2 size={16} color={theme.colors.primaryForeground} />
              <Text
                style={{
                  color: theme.colors.primaryForeground,
                  fontWeight: "700",
                  fontSize: theme.typography.sm,
                }}
              >
                Record Bill Payment
              </Text>
            </Pressable>
          </Card>
        ) : (
          <Card
            style={[
              styles.heroCard,
              {
                backgroundColor: isDark
                  ? "rgba(30, 27, 75, 0.4)"
                  : "rgba(238, 242, 255, 0.9)",
                borderColor: accountColor,
              },
            ]}
          >
            <View style={styles.heroTop}>
              <View>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                    fontWeight: "700",
                    textTransform: "uppercase",
                  }}
                >
                  Available Balance
                </Text>
                <Amount
                  value={bankBalance}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{
                    fontSize: 28,
                    fontWeight: "800",
                    color:
                      bankBalance >= 0
                        ? theme.colors.foreground
                        : theme.colors.destructive,
                  }}
                />
              </View>
            </View>

            <View style={styles.heroStatsRow}>
              <View>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Opening Balance
                </Text>
                <Amount
                  value={account.openingBalance || 0}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{
                    fontSize: theme.typography.sm,
                    fontWeight: "700",
                    color: theme.colors.mutedForeground,
                  }}
                />
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Baseline Date
                </Text>
                <Text
                  style={{
                    fontSize: theme.typography.sm,
                    fontWeight: "700",
                    color: theme.colors.foreground,
                  }}
                >
                  {account.balanceAsOfDate || "Creation"}
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => setIsTransferModalOpen(true)}
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <ArrowLeftRight size={15} color={theme.colors.primary} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: theme.colors.foreground,
                  }}
                >
                  Transfer
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setIsEntryModalOpen(true)}
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <SlidersHorizontal size={15} color={theme.colors.primary} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: theme.colors.foreground,
                  }}
                >
                  Adjust
                </Text>
              </Pressable>
            </View>
          </Card>
        )}

        {/* Past Billing Cycles (for Credit Cards) */}
        {isCreditCard && creditBillHistory.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text
              style={[
                styles.sectionTitle,
                {
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.xs,
                },
              ]}
            >
              PAST BILLING CYCLES
            </Text>
            <View style={{ gap: 8 }}>
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
                      {formatDateKey(bill.cycleStart)} →{" "}
                      {formatDateKey(bill.cycleEnd)}
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.typography.xs,
                        color: theme.colors.mutedForeground,
                      }}
                    >
                      Billed: {system.defaultCurrency} {bill.billedAmount.toLocaleString()} • Paid: {system.defaultCurrency} {bill.paidAmount.toLocaleString()}
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
          </View>
        ) : null}

        {/* Activity Timeline Header & Filter Pills */}
        <View style={styles.activityHeaderRow}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.xs,
              },
            ]}
          >
            RUNNING ACTIVITY ({filteredActivities.length})
          </Text>

          <View style={styles.filterPills}>
            {(["all", "debit", "credit"] as const).map((filter) => {
              const isSelected = activityFilter === filter;
              return (
                <Pressable
                  key={filter}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setActivityFilter(filter);
                  }}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: isSelected
                        ? theme.colors.primaryForeground
                        : theme.colors.mutedForeground,
                      textTransform: "capitalize",
                    }}
                  >
                    {filter}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Activity Items List */}
        {filteredActivities.length === 0 ? (
          <Card
            style={[
              styles.emptyActivityCard,
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
          </Card>
        ) : (
          <View style={{ gap: 8 }}>
            {filteredActivities.map((act) => {
              const isCredit = act.type === "credit";

              return (
                <Card
                  key={act.id}
                  style={[
                    styles.activityRow,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  {/* Icon */}
                  <View
                    style={[
                      styles.actIcon,
                      {
                        backgroundColor: isCredit
                          ? "rgba(34, 197, 94, 0.12)"
                          : "rgba(239, 68, 68, 0.12)",
                      },
                    ]}
                  >
                    {isCredit ? (
                      <ArrowDownLeft size={16} color={theme.colors.success} />
                    ) : (
                      <ArrowUpRight size={16} color={theme.colors.destructive} />
                    )}
                  </View>

                  {/* Description & Date */}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[
                        styles.actNote,
                        {
                          color: theme.colors.foreground,
                          fontSize: theme.typography.sm,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {act.note || act.category || act.source || "Transaction"}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.mutedForeground,
                      }}
                    >
                      {act.date}
                      {act.counterpartyName
                        ? ` • ${act.counterpartyName}`
                        : act.category
                          ? ` • ${act.category}`
                          : act.source
                            ? ` • ${act.source}`
                            : ""}
                    </Text>
                  </View>

                  {/* Amount */}
                  <Amount
                    value={act.amount}
                    currency={system.defaultCurrency}
                    ghostable
                    style={{
                      fontSize: theme.typography.sm,
                      fontWeight: "800",
                      color: isCredit
                        ? theme.colors.success
                        : theme.colors.foreground,
                    }}
                  />
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modals */}
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
  },
  headerTitle: {
    fontWeight: "800",
  },
  heroCard: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: 16,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  heroCtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    gap: 8,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  sectionTitle: {
    fontWeight: "800",
    letterSpacing: 0.8,
    marginLeft: 4,
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
  activityHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  filterPills: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    minHeight: 64,
  },
  actIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actNote: {
    fontWeight: "700",
  },
  emptyActivityCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
  },
});

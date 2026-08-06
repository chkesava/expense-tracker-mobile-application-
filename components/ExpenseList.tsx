import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
} from "firebase/firestore";
import * as Haptics from "expo-haptics";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Edit2,
  FolderTree,
  Tag,
  Trash2,
  Wallet,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import type { Account, Expense, Income } from "@/shared/types/expense";
import { formatDateKey, parseLocalDate } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface ExpenseListProps {
  expenses: Expense[];
  incomes?: Income[];
  accounts?: Account[];
  onEditExpense?: (expense: Expense) => void;
  onEditIncome?: (income: Income) => void;
  showMonthSummary?: boolean;
}

type CombinedTransaction =
  | { kind: "expense"; data: Expense; date: string; id: string }
  | { kind: "income"; data: Income; date: string; id: string };

export function ExpenseList({
  expenses,
  incomes = [],
  accounts = [],
  onEditExpense,
  onEditIncome,
  showMonthSummary = true,
}: ExpenseListProps) {
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();
  const uid = user?.uid;
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();

  const [selectedTx, setSelectedTx] = useState<CombinedTransaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CombinedTransaction | null>(null);

  // Account map by ID
  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

  // Combined & sorted chronologically
  const combinedTransactions = useMemo<CombinedTransaction[]>(() => {
    const list: CombinedTransaction[] = [];
    expenses.forEach((e) => {
      if (e.id) {
        list.push({ kind: "expense", data: e, date: e.date, id: e.id });
      }
    });
    incomes.forEach((i) => {
      if (i.id) {
        list.push({ kind: "income", data: i, date: i.date, id: i.id });
      }
    });

    return list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [expenses, incomes]);

  // Total summary metrics
  const totals = useMemo(() => {
    const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalIncome = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
    const net = totalIncome - totalSpent;
    return { totalSpent, totalIncome, net };
  }, [expenses, incomes]);

  // Group by Date key
  const groupedByDay = useMemo(() => {
    const groups: { [dateKey: string]: CombinedTransaction[] } = {};
    const todayStr = formatDateKey(new Date(), settings.timezone);
    const yDate = new Date();
    yDate.setDate(yDate.getDate() - 1);
    const yesterdayStr = formatDateKey(yDate, settings.timezone);

    combinedTransactions.forEach((tx) => {
      const dateKey = tx.date || "Unknown Date";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(tx);
    });

    return { groups, todayStr, yesterdayStr };
  }, [combinedTransactions, settings.timezone]);

  const handleDelete = async (target: CombinedTransaction) => {
    const db = getFirestoreDb();
    if (!uid || !db || !target.id) return;

    try {
      const collectionName = target.kind === "expense" ? "expenses" : "incomes";
      const docRef = doc(db, "users", uid, collectionName, target.id);
      const snapshotData = { ...target.data };

      await deleteDoc(docRef);
      setDeleteTarget(null);
      setSelectedTx(null);

      toast.success(
        `${target.kind === "expense" ? "Expense" : "Income"} deleted`
      );
    } catch (err) {
      console.error("Delete transaction error:", err);
      toast.error("Failed to delete transaction");
    }
  };

  const formatHeaderDate = (dateKey: string) => {
    if (dateKey === groupedByDay.todayStr) return "Today";
    if (dateKey === groupedByDay.yesterdayStr) return "Yesterday";
    try {
      const d = parseLocalDate(dateKey);
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateKey;
    }
  };

  if (combinedTransactions.length === 0) {
    return (
      <EmptyState
        title="No transactions found"
        description="Try selecting another month or tap '+' to log an expense or income."
      />
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {/* Month Summary Bar */}
      {showMonthSummary ? (
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.02)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.summaryCol}>
            <Text
              style={[
                styles.summaryLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Spent
            </Text>
            <Amount
              value={totals.totalSpent}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.md,
                fontWeight: "700",
                color: theme.colors.destructive,
              }}
            />
          </View>

          <View
            style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]}
          />

          <View style={styles.summaryCol}>
            <Text
              style={[
                styles.summaryLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Income
            </Text>
            <Amount
              value={totals.totalIncome}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.md,
                fontWeight: "700",
                color: theme.colors.success,
              }}
            />
          </View>

          <View
            style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]}
          />

          <View style={styles.summaryCol}>
            <Text
              style={[
                styles.summaryLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Net
            </Text>
            <Amount
              value={totals.net}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.md,
                fontWeight: "700",
                color:
                  totals.net >= 0 ? theme.colors.success : theme.colors.destructive,
              }}
            />
          </View>
        </View>
      ) : null}

      {/* Grouped Transaction List */}
      {Object.keys(groupedByDay.groups).map((dateKey) => {
        const items = groupedByDay.groups[dateKey];
        const dayTotal = items.reduce((sum, item) => {
          return item.kind === "expense"
            ? sum - item.data.amount
            : sum + item.data.amount;
        }, 0);

        return (
          <View key={dateKey} style={styles.dayGroup}>
            {/* Day Header */}
            <View style={styles.dayHeader}>
              <Text
                style={[
                  styles.dayHeaderText,
                  {
                    color: theme.colors.foreground,
                    fontSize: theme.typography.sm,
                  },
                ]}
              >
                {formatHeaderDate(dateKey)}
              </Text>
              <Text
                style={[
                  styles.daySubtotal,
                  {
                    color:
                      dayTotal >= 0
                        ? theme.colors.success
                        : theme.colors.mutedForeground,
                    fontSize: theme.typography.xs,
                  },
                ]}
              >
                {dayTotal >= 0 ? "+" : "-"}
                {system.defaultCurrency}
                {Math.abs(dayTotal).toLocaleString()}
              </Text>
            </View>

            {/* Day Item Cards */}
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {items.map((item, index) => {
                const isExpense = item.kind === "expense";
                const iconChar = isExpense
                  ? getCategoryIcon(item.data.category)
                  : "💰";
                const acc = item.data.accountId
                  ? accountMap.get(item.data.accountId)
                  : undefined;

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setSelectedTx(item);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      index < items.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                      },
                      pressed && {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.03)",
                      },
                    ]}
                  >
                    {/* Category Icon */}
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: isExpense
                            ? theme.colors.primary + "18"
                            : theme.colors.success + "18",
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 18 }}>{iconChar}</Text>
                    </View>

                    {/* Details */}
                    <View style={styles.rowDetails}>
                      <Text
                        style={[
                          styles.rowTitle,
                          {
                            color: theme.colors.foreground,
                            fontSize: theme.typography.sm,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {isExpense
                          ? item.data.note || item.data.category
                          : item.data.note || item.data.source}
                      </Text>

                      <View style={styles.rowSub}>
                        <Text
                          style={[
                            styles.rowCategory,
                            {
                              color: theme.colors.mutedForeground,
                              fontSize: theme.typography.xs,
                            },
                          ]}
                        >
                          {isExpense
                            ? `${item.data.category}${
                                item.data.subcategory
                                  ? ` › ${item.data.subcategory}`
                                  : ""
                              }`
                            : item.data.source}
                        </Text>

                        {acc ? (
                          <View
                            style={[
                              styles.accBadge,
                              {
                                backgroundColor: isDark
                                  ? "rgba(255,255,255,0.06)"
                                  : "rgba(0,0,0,0.04)",
                                borderColor: theme.colors.border,
                              },
                            ]}
                          >
                            <Wallet
                              size={10}
                              color={theme.colors.mutedForeground}
                            />
                            <Text
                              style={[
                                styles.accBadgeText,
                                {
                                  color: theme.colors.mutedForeground,
                                  fontSize: 10,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {acc.name}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* Amount & Time */}
                    <View style={styles.rowRight}>
                      <Amount
                        value={item.data.amount}
                        currency={system.defaultCurrency}
                        ghostable
                        style={{
                          fontSize: theme.typography.sm,
                          fontWeight: "700",
                          color: isExpense
                            ? theme.colors.foreground
                            : theme.colors.success,
                        }}
                      />
                      {isExpense && item.data.tags && item.data.tags.length > 0 ? (
                        <View style={styles.tagsPreview}>
                          <Tag size={10} color={theme.colors.mutedForeground} />
                          <Text
                            style={{
                              fontSize: 10,
                              color: theme.colors.mutedForeground,
                            }}
                          >
                            {item.data.tags.length}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          </View>
        );
      })}

      {/* Transaction Action Bottom Sheet Modal */}
      <Modal
        visible={!!selectedTx}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTx(null)}
      >
        <Pressable
          style={[
            styles.modalOverlay,
            { paddingBottom: Math.max(insets.bottom + 16, 24) },
          ]}
          onPress={() => setSelectedTx(null)}
        >
          <Pressable
            style={[
              styles.actionSheet,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedTx ? (
              <View style={{ gap: 16 }}>
                {/* Header */}
                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                    <Text
                      style={{
                        fontSize: theme.typography.lg,
                        fontWeight: "800",
                        color: theme.colors.foreground,
                      }}
                      numberOfLines={2}
                    >
                      {selectedTx.kind === "expense"
                        ? selectedTx.data.note || selectedTx.data.category
                        : selectedTx.data.note || selectedTx.data.source}
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.typography.xs,
                        color: theme.colors.mutedForeground,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {selectedTx.date} •{" "}
                      {selectedTx.kind === "expense"
                        ? selectedTx.data.category
                        : selectedTx.data.source}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
                    <Amount
                      value={selectedTx.data.amount}
                      currency={system.defaultCurrency}
                      ghostable
                      style={{
                        fontSize: theme.typography.lg,
                        fontWeight: "800",
                        color:
                          selectedTx.kind === "expense"
                            ? theme.colors.destructive
                            : theme.colors.success,
                      }}
                    />
                  </View>
                </View>

                {/* Actions */}
                <View style={{ gap: 8 }}>
                  <Button
                    variant="outline"
                    onPress={() => {
                      const tx = selectedTx;
                      setSelectedTx(null);
                      if (tx.kind === "expense") {
                        onEditExpense?.(tx.data);
                      } else {
                        onEditIncome?.(tx.data);
                      }
                    }}
                  >
                    Edit Transaction
                  </Button>

                  <Button
                    variant="destructive"
                    onPress={() => {
                      const tx = selectedTx;
                      if (tx) handleDelete(tx);
                    }}
                  >
                    Delete Transaction
                  </Button>
                </View>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  summaryCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryDivider: {
    width: 1,
    height: 32,
  },
  dayGroup: {
    gap: 8,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  dayHeaderText: {
    fontWeight: "800",
  },
  daySubtotal: {
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowDetails: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    fontWeight: "700",
  },
  rowSub: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  rowCategory: {
    fontWeight: "500",
    flexShrink: 1,
  },
  accBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 140,
  },
  accBadgeText: {
    fontWeight: "600",
  },
  rowRight: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 4,
    minWidth: 60,
  },
  tagsPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    padding: 16,
  },
  actionSheet: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});

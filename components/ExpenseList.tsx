import { useMemo, useState } from "react";
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteDoc, doc } from "firebase/firestore";
import * as Haptics from "expo-haptics";
import {
  Calendar,
  CreditCard,
  Edit3,
  FileText,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Modal } from "@/components/common/Modal";
import { SwipeableRow } from "@/components/common/SwipeableRow";
import { Button } from "@/components/ui/Button";
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
  refreshing?: boolean;
  onRefresh?: () => void;
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
  refreshing,
  onRefresh,
}: ExpenseListProps) {
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();
  const uid = user?.uid;
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();

  const [selectedTx, setSelectedTx] = useState<CombinedTransaction | null>(null);

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

      await deleteDoc(docRef);
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

  const sections = useMemo(
    () =>
      Object.keys(groupedByDay.groups).map((dateKey) => ({
        title: dateKey,
        data: groupedByDay.groups[dateKey],
      })),
    [groupedByDay]
  );

  const renderTxRow = (
    item: CombinedTransaction,
    isFirstInSection: boolean,
    isLastInSection: boolean
  ) => {
    const isExpense = item.kind === "expense";
    const iconChar = isExpense ? getCategoryIcon(item.data.category) : "💰";
    const acc = item.data.accountId ? accountMap.get(item.data.accountId) : undefined;

    return (
      <SwipeableRow
        rightActions={[
          {
            icon: Edit3,
            label: "Edit",
            color: theme.colors.primary,
            onPress: () => {
              if (item.kind === "expense") {
                onEditExpense?.(item.data);
              } else {
                onEditIncome?.(item.data);
              }
            },
          },
          {
            icon: Trash2,
            label: "Delete",
            color: theme.colors.destructive,
            onPress: () => handleDelete(item),
          },
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setSelectedTx(item);
          }}
          android_ripple={{
            color: theme.colors.primary + "18",
            borderless: false,
          }}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: theme.colors.card,
              borderTopLeftRadius: isFirstInSection ? theme.radius.lg : 0,
              borderTopRightRadius: isFirstInSection ? theme.radius.lg : 0,
              borderBottomLeftRadius: isLastInSection ? theme.radius.lg : 0,
              borderBottomRightRadius: isLastInSection ? theme.radius.lg : 0,
            },
            !isLastInSection && {
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            },
            pressed && {
              opacity: 0.9,
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
                      item.data.subcategory ? ` › ${item.data.subcategory}` : ""
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
                  <Wallet size={10} color={theme.colors.mutedForeground} />
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
              prefix={isExpense ? "-" : "+"}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "800",
                color: isExpense ? theme.colors.foreground : theme.colors.success,
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
      </SwipeableRow>
    );
  };

  if (combinedTransactions.length === 0) {
    return (
      <EmptyState
        emoji="📊"
        title="No Expenses Yet"
        description="Track your first expense to begin understanding your spending habits."
      />
    );
  }

  const selectedAcc = selectedTx?.data.accountId
    ? accountMap.get(selectedTx.data.accountId)
    : undefined;

  return (
    <>
      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        refreshing={onRefresh ? !!refreshing : undefined}
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
        ListHeaderComponent={
          showMonthSummary ? (
            <View
              style={[
                styles.summaryCard,
                theme.elevation[1],
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.summaryCol}>
                <Text
                  style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
                >
                  Spent
                </Text>
                <Amount
                  value={totals.totalSpent}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{
                    fontSize: theme.typography.md,
                    fontWeight: "800",
                    color: theme.colors.destructive,
                  }}
                />
              </View>

              <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />

              <View style={styles.summaryCol}>
                <Text
                  style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
                >
                  Income
                </Text>
                <Amount
                  value={totals.totalIncome}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{
                    fontSize: theme.typography.md,
                    fontWeight: "800",
                    color: theme.colors.success,
                  }}
                />
              </View>

              <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />

              <View style={styles.summaryCol}>
                <Text
                  style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
                >
                  Net
                </Text>
                <Amount
                  value={totals.net}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{
                    fontSize: theme.typography.md,
                    fontWeight: "800",
                    color: totals.net >= 0 ? theme.colors.success : theme.colors.destructive,
                  }}
                />
              </View>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => {
          const items = section.data;
          const dayTotal = items.reduce((sum, item) => {
            return item.kind === "expense" ? sum - item.data.amount : sum + item.data.amount;
          }, 0);

          return (
            <View style={[styles.dayHeader, { backgroundColor: theme.colors.background }]}>
              <Text
                style={[
                  styles.dayHeaderText,
                  { color: theme.colors.foreground, fontSize: theme.typography.sm },
                ]}
              >
                {formatHeaderDate(section.title)}
              </Text>
              <Text
                style={[
                  styles.daySubtotal,
                  {
                    color: dayTotal >= 0 ? theme.colors.success : theme.colors.mutedForeground,
                    fontSize: theme.typography.xs,
                  },
                ]}
              >
                {dayTotal >= 0 ? "+" : "-"}
                {system.defaultCurrency}
                {Math.abs(dayTotal).toLocaleString()}
              </Text>
            </View>
          );
        }}
        renderItem={({ item, index, section }) =>
          renderTxRow(item, index === 0, index === section.data.length - 1)
        }
        SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* Material 3 Transaction Detail Bottom Sheet */}
      <Modal
        isOpen={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        title="Transaction Details"
      >
        {selectedTx ? (
          <View style={{ gap: 20 }}>
            {/* Amount & Category Hero */}
            <View style={styles.modalHeroWrap}>
              <View
                style={[
                  styles.modalIconBox,
                  {
                    backgroundColor:
                      selectedTx.kind === "expense"
                        ? theme.colors.primary + "18"
                        : theme.colors.success + "18",
                  },
                ]}
              >
                <Text style={{ fontSize: 28 }}>
                  {selectedTx.kind === "expense"
                    ? getCategoryIcon(selectedTx.data.category)
                    : "💰"}
                </Text>
              </View>

              <Amount
                value={selectedTx.data.amount}
                currency={system.defaultCurrency}
                prefix={selectedTx.kind === "expense" ? "-" : "+"}
                ghostable
                style={{
                  fontSize: 32,
                  fontWeight: "900",
                  letterSpacing: -0.5,
                  color:
                    selectedTx.kind === "expense"
                      ? theme.colors.destructive
                      : theme.colors.success,
                }}
              />

              <Text
                style={{
                  fontSize: theme.typography.md,
                  fontWeight: "700",
                  color: theme.colors.foreground,
                  textAlign: "center",
                }}
              >
                {selectedTx.kind === "expense"
                  ? selectedTx.data.note || selectedTx.data.category
                  : selectedTx.data.note || selectedTx.data.source}
              </Text>
            </View>

            {/* Key-Value Details */}
            <View
              style={[
                styles.detailsList,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.03)",
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.detailRow}>
                <View style={styles.detailLabelRow}>
                  <Calendar size={15} color={theme.colors.mutedForeground} />
                  <Text style={[styles.detailLabel, { color: theme.colors.mutedForeground }]}>
                    Date
                  </Text>
                </View>
                <Text style={[styles.detailValue, { color: theme.colors.foreground }]}>
                  {selectedTx.date}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLabelRow}>
                  <Tag size={15} color={theme.colors.mutedForeground} />
                  <Text style={[styles.detailLabel, { color: theme.colors.mutedForeground }]}>
                    Category
                  </Text>
                </View>
                <Text style={[styles.detailValue, { color: theme.colors.foreground }]}>
                  {selectedTx.kind === "expense"
                    ? `${selectedTx.data.category}${
                        selectedTx.data.subcategory ? ` › ${selectedTx.data.subcategory}` : ""
                      }`
                    : selectedTx.data.source}
                </Text>
              </View>

              {selectedAcc ? (
                <View style={styles.detailRow}>
                  <View style={styles.detailLabelRow}>
                    <Wallet size={15} color={theme.colors.mutedForeground} />
                    <Text style={[styles.detailLabel, { color: theme.colors.mutedForeground }]}>
                      Account
                    </Text>
                  </View>
                  <Text style={[styles.detailValue, { color: theme.colors.foreground }]}>
                    {selectedAcc.name}
                  </Text>
                </View>
              ) : null}

              {selectedTx.kind === "expense" && selectedTx.data.tags && selectedTx.data.tags.length > 0 ? (
                <View style={styles.detailRow}>
                  <View style={styles.detailLabelRow}>
                    <FileText size={15} color={theme.colors.mutedForeground} />
                    <Text style={[styles.detailLabel, { color: theme.colors.mutedForeground }]}>
                      Tags
                    </Text>
                  </View>
                  <Text style={[styles.detailValue, { color: theme.colors.foreground }]}>
                    {selectedTx.data.tags.join(", ")}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Action Buttons */}
            <View style={{ gap: 10 }}>
              <Button
                variant="tonal"
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
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 20,
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
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 8,
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
    width: 44,
    height: 44,
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
  modalHeroWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  modalIconBox: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  detailsList: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "700",
  },
});

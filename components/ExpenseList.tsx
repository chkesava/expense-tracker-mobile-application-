import { useCallback, useMemo, useRef, useState } from "react";
import {
  InteractionManager,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { deleteDoc, doc } from "firebase/firestore";
import { haptic } from "@/lib/haptics";
import { sampleScrollFps } from "@/lib/perf";
import {
  Calendar,
  Edit3,
  FileText,
  LayoutGrid,
  Plus,
  ScanLine,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Modal } from "@/components/common/Modal";
import {
  SwipeableRow,
  closeOpenSwipeableRow,
} from "@/components/common/SwipeableRow";
import { AssignToSpaceModal } from "@/components/spaces/AssignToSpaceModal";
import { Button } from "@/components/ui/Button";
import { useSpaces } from "@/hooks/useSpaces";
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
  onAddExpense?: () => void;
  onEditExpense?: (expense: Expense) => void;
  onEditIncome?: (income: Income) => void;
  showMonthSummary?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

type CombinedTransaction =
  | { kind: "expense"; data: Expense; date: string; id: string }
  | { kind: "income"; data: Income; date: string; id: string };

type LedgerListItem =
  | {
      type: "header";
      id: string;
      title: string;
      dayTotal: number;
    }
  | {
      type: "tx";
      id: string;
      item: CombinedTransaction;
      isFirst: boolean;
      isLast: boolean;
    };

export function ExpenseList({
  expenses,
  incomes = [],
  accounts = [],
  onAddExpense,
  onEditExpense,
  onEditIncome,
  showMonthSummary = true,
  refreshing,
  onRefresh,
}: ExpenseListProps) {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();
  const uid = user?.uid;
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();
  const { spaces, removeExpenseFromSpace } = useSpaces();

  const [selectedTx, setSelectedTx] = useState<CombinedTransaction | null>(null);
  const [swipeCloseSignal, setSwipeCloseSignal] = useState(0);
  const deletingIdsRef = useRef(new Set<string>());

  // Multi-select exists only to bulk-assign expenses to a Space.
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const isSelecting = selectedExpenseIds.size > 0;

  const toggleExpenseSelection = useCallback((expenseId: string) => {
    setSelectedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(expenseId)) next.delete(expenseId);
      else next.add(expenseId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedExpenseIds(new Set());
  }, []);

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

  const formatHeaderDate = useCallback(
    (dateKey: string) => {
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
    },
    [groupedByDay.todayStr, groupedByDay.yesterdayStr]
  );

  const handleDelete = useCallback(
    async (target: CombinedTransaction) => {
      const db = getFirestoreDb();
      const docId = target.id?.trim();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return;
      }
      if (!docId) {
        toast.error("Cannot delete — missing transaction id");
        return;
      }
      if (deletingIdsRef.current.has(docId)) return;
      deletingIdsRef.current.add(docId);

      try {
        const collectionName = target.kind === "expense" ? "expenses" : "incomes";
        const docRef = doc(db, "users", uid, collectionName, docId);

        await deleteDoc(docRef);
        setSelectedTx(null);
        void haptic.delete();

        toast.success(
          `${target.kind === "expense" ? "Expense" : "Income"} deleted`
        );
      } catch (err) {
        console.error("Delete transaction error:", err);
        toast.error("Failed to delete transaction");
      } finally {
        deletingIdsRef.current.delete(docId);
      }
    },
    [uid]
  );

  const openEditFromRow = useCallback(
    (target: CombinedTransaction) => {
      // Prefer the list row id (from Firestore doc id) over any field on the payload.
      if (target.kind === "expense") {
        onEditExpense?.({ ...target.data, id: target.id });
      } else {
        onEditIncome?.({ ...target.data, id: target.id });
      }
    },
    [onEditExpense, onEditIncome]
  );

  const openEditAfterDetailClose = useCallback(
    (target: CombinedTransaction) => {
      // Closing one RN Modal and opening another in the same tick often drops
      // the second sheet on Android — wait until the detail sheet finishes.
      setSelectedTx(null);
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => openEditFromRow(target), 50);
      });
    },
    [openEditFromRow]
  );

  const sections = useMemo(
    () =>
      Object.keys(groupedByDay.groups).map((dateKey) => ({
        title: dateKey,
        data: groupedByDay.groups[dateKey],
      })),
    [groupedByDay]
  );

  const listData = useMemo(() => {
    const rows: LedgerListItem[] = [];
    for (const section of sections) {
      const dayTotal = section.data.reduce((sum, item) => {
        return item.kind === "expense"
          ? sum - item.data.amount
          : sum + item.data.amount;
      }, 0);
      rows.push({
        type: "header",
        id: `header-${section.title}`,
        title: section.title,
        dayTotal,
      });
      section.data.forEach((item, index) => {
        rows.push({
          type: "tx",
          id: `${item.kind}-${item.id}`,
          item,
          isFirst: index === 0,
          isLast: index === section.data.length - 1,
        });
      });
    }
    return rows;
  }, [sections]);

  const stickyHeaderIndices = useMemo(
    () =>
      listData
        .map((row, index) => (row.type === "header" ? index : -1))
        .filter((index) => index >= 0),
    [listData]
  );

  const renderTxRow = useCallback(
    (
      item: CombinedTransaction,
      isFirstInSection: boolean,
      isLastInSection: boolean
    ) => {
    const isExpense = item.kind === "expense";
    const iconChar = isExpense ? getCategoryIcon(item.data.category) : "💰";
    const acc = item.data.accountId ? accountMap.get(item.data.accountId) : undefined;
    const isRowSelected = Boolean(
      isExpense && item.data.id && selectedExpenseIds.has(item.data.id)
    );

    return (
      <SwipeableRow
        closeSignal={swipeCloseSignal}
        rightActions={[
          {
            icon: Edit3,
            label: "Edit",
            color: theme.colors.primary,
            onPress: () => openEditFromRow(item),
          },
          {
            icon: Trash2,
            label: "Delete",
            color: theme.colors.destructive,
            onPress: () => {
              void handleDelete(item);
            },
          },
        ]}
      >
        <Pressable
          onPress={() => {
            void haptic.selection();
            if (isSelecting && isExpense && item.data.id) {
              toggleExpenseSelection(item.data.id);
              return;
            }
            setSelectedTx(item);
          }}
          onLongPress={() => {
            if (!isExpense || !item.data.id) return;
            void haptic.impact();
            toggleExpenseSelection(item.data.id);
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
            isRowSelected && {
              backgroundColor: theme.colors.primary + "1F",
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
    },
    [
      accountMap,
      handleDelete,
      isDark,
      isSelecting,
      openEditFromRow,
      selectedExpenseIds,
      swipeCloseSignal,
      system.defaultCurrency,
      theme,
      toggleExpenseSelection,
    ]
  );

  const renderListItem = useCallback(
    ({ item }: { item: LedgerListItem }) => {
      if (item.type === "header") {
        return (
          <View style={[styles.dayHeader, { backgroundColor: theme.colors.background }]}>
            <Text
              style={[
                styles.dayHeaderText,
                { color: theme.colors.foreground, fontSize: theme.typography.sm },
              ]}
            >
              {formatHeaderDate(item.title)}
            </Text>
            <Text
              style={[
                styles.daySubtotal,
                {
                  color:
                    item.dayTotal >= 0
                      ? theme.colors.success
                      : theme.colors.mutedForeground,
                  fontSize: theme.typography.xs,
                },
              ]}
            >
              {item.dayTotal >= 0 ? "+" : "-"}
              {system.defaultCurrency}
              {Math.abs(item.dayTotal).toLocaleString()}
            </Text>
          </View>
        );
      }
      return renderTxRow(item.item, item.isFirst, item.isLast);
    },
    [formatHeaderDate, renderTxRow, system.defaultCurrency, theme]
  );

  if (combinedTransactions.length === 0) {
    return (
      <EmptyState
        illustration="expenses"
        title="No Expenses Yet"
        description="Track your first expense to begin understanding your spending habits and category breakdowns."
        primaryAction={{
          label: "Add Expense",
          icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
          onPress: () => {
            if (onAddExpense) {
              onAddExpense();
            } else {
              router.push("/dashboard");
            }
          },
        }}
        secondaryAction={{
          label: "Scan Receipt",
          icon: <ScanLine size={16} color={theme.colors.primary} strokeWidth={2} />,
          onPress: () => {
            router.push("/dashboard");
          },
        }}
        tip="Quick-add cash expenses in under 3 seconds using the bottom dock '+' button anytime."
      />
    );
  }

  const selectedAcc = selectedTx?.data.accountId
    ? accountMap.get(selectedTx.data.accountId)
    : undefined;

  const selectedSpaceId =
    selectedTx?.kind === "expense" ? selectedTx.data.spaceId : null;
  const selectedSpace = selectedSpaceId
    ? spaces.find((s) => s.id === selectedSpaceId)
    : undefined;

  return (
    <>
      {isSelecting ? (
        <View
          style={[
            styles.selectionBar,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.selectionCount,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            {selectedExpenseIds.size} selected
          </Text>

          <View style={styles.selectionActions}>
            <Button size="sm" onPress={() => setIsAssignModalOpen(true)}>
              <Text
                style={{
                  fontWeight: "700",
                  color: theme.colors.primaryForeground,
                }}
              >
                Add to Space
              </Text>
            </Button>
            <Button size="sm" variant="outline" onPress={clearSelection}>
              <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
                Cancel
              </Text>
            </Button>
          </View>
        </View>
      ) : null}

      <FlashList
        style={styles.list}
        data={listData}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.type}
        stickyHeaderIndices={stickyHeaderIndices}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => {
          closeOpenSwipeableRow();
          setSwipeCloseSignal((n) => n + 1);
          sampleScrollFps("ledger");
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={() => {
                void haptic.impact();
                onRefresh();
              }}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
              progressBackgroundColor={theme.colors.card}
            />
          ) : undefined
        }
        contentContainerStyle={styles.listContent}
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
        renderItem={renderListItem}
      />

      <AssignToSpaceModal
        visible={isAssignModalOpen}
        expenseIds={Array.from(selectedExpenseIds)}
        onClose={() => setIsAssignModalOpen(false)}
        onAssigned={clearSelection}
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

              {selectedTx.kind === "expense" ? (
                <View style={styles.detailRow}>
                  <View style={styles.detailLabelRow}>
                    <LayoutGrid size={15} color={theme.colors.mutedForeground} />
                    <Text style={[styles.detailLabel, { color: theme.colors.mutedForeground }]}>
                      Space
                    </Text>
                  </View>
                  <Text style={[styles.detailValue, { color: theme.colors.foreground }]}>
                    {selectedSpace?.name ?? "None"}
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

            {/* Action Buttons — plain Pressable avoids Reanimated pressables
                failing to receive taps inside the bottom sheet on Android. */}
            <View style={{ gap: 10 }}>
              {selectedTx.kind === "expense" ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={selectedSpace ? "Change Space" : "Add to Space"}
                    android_ripple={{ color: theme.colors.primary + "22" }}
                    onPress={() => {
                      const tx = selectedTx;
                      if (!tx || tx.kind !== "expense" || !tx.data.id) return;
                      void haptic.selection();
                      setSelectedTx(null);
                      setSelectedExpenseIds(new Set([tx.data.id]));
                      setIsAssignModalOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.detailActionBtn,
                      {
                        flex: 1,
                        backgroundColor: theme.colors.secondaryContainer,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.colors.onSecondaryContainer,
                        fontSize: theme.typography.sm,
                        fontWeight: "700",
                      }}
                    >
                      {selectedSpace ? "Change Space" : "Add to Space"}
                    </Text>
                  </Pressable>

                  {selectedSpace ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove from Space"
                      android_ripple={{ color: theme.colors.primary + "22" }}
                      onPress={() => {
                        const tx = selectedTx;
                        if (!tx || tx.kind !== "expense" || !tx.data.id) return;
                        void haptic.selection();
                        void removeExpenseFromSpace(tx.data.id);
                      }}
                      style={({ pressed }) => [
                        styles.detailActionBtn,
                        {
                          flex: 1,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: theme.colors.foreground,
                          fontSize: theme.typography.sm,
                          fontWeight: "700",
                        }}
                      >
                        Remove
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit Transaction"
                android_ripple={{ color: theme.colors.primary + "22" }}
                onPress={() => {
                  const tx = selectedTx;
                  if (!tx) return;
                  void haptic.selection();
                  openEditAfterDetailClose(tx);
                }}
                style={({ pressed }) => [
                  styles.detailActionBtn,
                  {
                    backgroundColor: theme.colors.secondaryContainer,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.onSecondaryContainer,
                    fontSize: theme.typography.sm,
                    fontWeight: "700",
                  }}
                >
                  Edit Transaction
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete Transaction"
                android_ripple={{ color: "rgba(255,255,255,0.24)" }}
                onPress={() => {
                  const tx = selectedTx;
                  if (!tx) return;
                  void haptic.impact();
                  void handleDelete(tx);
                }}
                style={({ pressed }) => [
                  styles.detailActionBtn,
                  {
                    backgroundColor: theme.colors.destructive,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.destructiveForeground,
                    fontSize: theme.typography.sm,
                    fontWeight: "700",
                  }}
                >
                  Delete Transaction
                </Text>
              </Pressable>
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
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  selectionCount: {
    fontWeight: "800",
  },
  selectionActions: {
    flexDirection: "row",
    gap: 8,
  },
  listContent: {
    paddingBottom: 32,
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
  detailActionBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    overflow: "hidden",
  },
});

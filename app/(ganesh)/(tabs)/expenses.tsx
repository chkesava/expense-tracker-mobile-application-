import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { GaneshSyncChip, PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { AddFab } from "@/components/ui/AddFab";
import { EmptyState } from "@/components/common/EmptyState";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshExpenses } from "@/hooks/useGaneshExpenses";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { assetPurchaseAmountOf, regularExpenseAmount, totalExpenses } from "@/shared/utils/ganeshMath";
import { isAssetPurchaseExpense } from "@/shared/utils/ganeshAssets";
import type { GaneshExpense } from "@/shared/types/ganesh";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

const FILTERS = ["all", "god", "personal", "pending"] as const;

const ExpenseCard = memo(function ExpenseCard({
  id,
  name,
  amountLabel,
  fundingLabel,
  paidBy,
  enteredBy,
  at,
  date,
  isAsset,
  receiptPath,
  pandalId,
  festivalId,
  pending,
  onOpen,
}: {
  id: string;
  name: string;
  amountLabel: string;
  fundingLabel: string;
  paidBy: string;
  enteredBy: string;
  at?: GaneshExpense["createdAt"];
  date?: string;
  isAsset: boolean;
  receiptPath?: string;
  pandalId?: string | null;
  festivalId?: string | null;
  pending?: boolean;
  onOpen: (id: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => onOpen(id)}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        gap: 4,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700", flex: 1 }}>{name}</Text>
        {isAsset ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: theme.colors.muted,
            }}
          >
            <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700", fontSize: 12 }}>
              Asset
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>{amountLabel}</Text>
      <Text style={{ color: theme.colors.mutedForeground }}>{fundingLabel}</Text>
      <AccountabilityLine paidBy={paidBy} enteredBy={enteredBy} at={at} date={date} />
      {pandalId && festivalId && receiptPath ? (
        <GaneshSignedPreview path={receiptPath} pandalId={pandalId} festivalId={festivalId} />
      ) : null}
      <PendingHint pending={pending} />
    </Pressable>
  );
});

export default function GaneshExpensesScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { expenses } = useGaneshExpenses(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const { can } = useGaneshPermissions();

  const onOpen = useCallback(
    (id: string) => {
      push(`/(ganesh)/expense/${id}` as never);
    },
    [push]
  );

  const rows = useMemo(
    () =>
      expenses.filter((expense) => {
        if (expense.voided) return false;
        if (filter === "god") return expense.godFundAmount > 0;
        if (filter === "personal") return expense.personalAmount > 0;
        if (filter === "pending") return expense.personalAmount > 0;
        return true;
      }),
    [expenses, filter]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16, paddingTop: insets.top + 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Expenses
        </Text>
        <GaneshSyncChip />
      </View>
      <MetricGrid
        items={[
          { label: "Festival expenses", value: totalExpenses(summary) },
          { label: "Regular", value: regularExpenseAmount(summary) },
          { label: "Asset purchases", value: assetPurchaseAmountOf(summary) },
          { label: "Pending reimbursement", value: summary.pendingReimbursements },
        ]}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FILTERS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: filter === item ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: filter === item ? theme.colors.primaryForeground : theme.colors.foreground,
                fontWeight: "700",
                textTransform: "capitalize",
              }}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: GaneshExpense }) => {
          const receiptPath = ganeshStoredPath(item.receipt, item.receiptPath);
          const sponsored = item.sponsoredAmount > 0 ? ` · Sponsored ${formatInr(item.sponsoredAmount)}` : "";
          return (
            <ExpenseCard
              id={item.id}
              name={item.name}
              amountLabel={formatInr(item.totalAmount)}
              fundingLabel={`God Fund ${formatInr(item.godFundAmount)} · Personal ${formatInr(item.personalAmount)}${sponsored}`}
              paidBy={memberDisplayName(members, item.paidByMemberId)}
              enteredBy={memberDisplayName(members, item.createdBy)}
              at={item.createdAt}
              date={item.date}
              isAsset={isAssetPurchaseExpense(item)}
              receiptPath={receiptPath}
              pandalId={pandalId}
              festivalId={festivalId}
              pending={item.pendingWrite}
              onOpen={onOpen}
            />
          );
        }}
        ListEmptyComponent={
          <EmptyState title="No expenses yet" description="Record God Fund, personal, or split-funded spends." />
        }
      />
      {festival?.status === "open" && can("expenses.create") ? (
        <AddFab
          onPress={() => push("/(ganesh)/add-expense" as never)}
          accessibilityLabel="Add expense"
        />
      ) : null}
    </View>
  );
}

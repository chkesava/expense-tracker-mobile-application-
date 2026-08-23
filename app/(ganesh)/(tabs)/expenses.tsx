import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
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
import { totalExpenses } from "@/shared/utils/ganeshMath";
import type { GaneshExpense } from "@/shared/types/ganesh";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

const FILTERS = ["all", "god", "personal", "pending"] as const;

export default function GaneshExpensesScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { expenses } = useGaneshExpenses(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const { can } = useGaneshPermissions();

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
    <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Expenses
        </Text>
        <GaneshSyncChip />
      </View>
      <MetricGrid
        items={[
          { label: "Total expenses", value: totalExpenses(summary) },
          { label: "God Fund", value: summary.godFundExpenses },
          { label: "Personal", value: summary.personalMoneyUsed },
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
        renderItem={({ item }: { item: GaneshExpense }) => (
          <View
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
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{item.name}</Text>
            <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>
              {formatInr(item.totalAmount)}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground }}>
              God Fund {formatInr(item.godFundAmount)} · Personal {formatInr(item.personalAmount)}
              {item.sponsoredAmount > 0 ? ` · Sponsored ${formatInr(item.sponsoredAmount)}` : ""}
            </Text>
            <AccountabilityLine
              paidBy={memberDisplayName(members, item.paidByMemberId)}
              enteredBy={memberDisplayName(members, item.createdBy)}
              at={item.createdAt}
              date={item.date}
            />
            <PendingHint pending={item.pendingWrite} />
          </View>
        )}
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

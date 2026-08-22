import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { CreateCreditCardBillModal } from "@/components/creditCardBills/CreateCreditCardBillModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import type { CreditCardBill, CreditCardBillStatus } from "@/shared/types/creditCardBill";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

type FilterKey =
  | "all"
  | "upcoming"
  | "due_soon"
  | "overdue"
  | "partially_paid"
  | "paid";

const FILTERS: { key: FilterKey; label: string; statuses?: CreditCardBillStatus[] }[] =
  [
    { key: "all", label: "All" },
    { key: "upcoming", label: "Upcoming", statuses: ["UPCOMING"] },
    {
      key: "due_soon",
      label: "Due Soon",
      statuses: ["DUE_SOON", "DUE_TODAY"],
    },
    { key: "overdue", label: "Overdue", statuses: ["OVERDUE"] },
    {
      key: "partially_paid",
      label: "Partial",
      statuses: ["PARTIALLY_PAID"],
    },
    { key: "paid", label: "Paid", statuses: ["PAID"] },
  ];

function statusColor(
  status: CreditCardBillStatus,
  colors: { primary: string; destructive: string; mutedForeground: string; warning?: string }
): string {
  switch (status) {
    case "OVERDUE":
      return colors.destructive;
    case "DUE_TODAY":
    case "DUE_SOON":
      return colors.primary;
    case "PAID":
      return colors.mutedForeground;
    case "PARTIALLY_PAID":
      return colors.primary;
    default:
      return colors.mutedForeground;
  }
}

export function CreditCardBillsList() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { bills, loading } = useCreditCardBills();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const accountName = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.name]));
    return (id: string) => map.get(id) || "Card";
  }, [accounts]);

  const filtered = useMemo(() => {
    const conf = FILTERS.find((f) => f.key === filter);
    let list = [...bills];
    if (conf?.statuses) {
      list = list.filter((b) => conf.statuses!.includes(b.status));
    }
    return list.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [bills, filter]);

  const current = filtered.filter((b) => b.status !== "PAID" && b.status !== "CANCELLED");
  const history = filtered.filter((b) => b.status === "PAID" || b.status === "CANCELLED");

  const renderBill = (bill: CreditCardBill) => (
    <Pressable
      key={bill.id}
      onPress={() => {
        haptic.selection().catch(() => undefined);
        router.push(`/credit-card-bills/${bill.id}`);
      }}
      style={{ marginBottom: 10 }}
    >
      <Card>
        <View style={{ gap: 6 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: theme.colors.foreground,
                fontWeight: "600",
                fontSize: theme.typography.md,
              }}
            >
              {accountName(bill.accountId)}
            </Text>
            <Text
              style={{
                color: statusColor(bill.status, theme.colors),
                fontSize: theme.typography.xs,
                fontWeight: "700",
                letterSpacing: 0.4,
              }}
            >
              {bill.status.replaceAll("_", " ")}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Amount value={bill.statementAmount} />
            <Text style={{ color: theme.colors.mutedForeground }}>
              Due {bill.dueDate}
            </Text>
          </View>
          {bill.billingPeriodStart && bill.billingPeriodEnd ? (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.sm,
              }}
            >
              {bill.billingPeriodStart} → {bill.billingPeriodEnd}
            </Text>
          ) : null}
          {bill.remainingAmount > 0 && bill.amountPaid > 0 ? (
            <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.sm,
                }}
              >
                Remaining
              </Text>
              <Amount value={bill.remainingAmount} />
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );

  return (
    <View style={{ gap: 12, paddingBottom: 24 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: theme.colors.foreground,
            fontWeight: "700",
            fontSize: theme.typography.lg,
          }}
        >
          Credit Card Bills
        </Text>
        <Button
          size="sm"
          onPress={() => {
            haptic.light().catch(
              () => undefined
            );
            setCreateOpen(true);
          }}
        >
          <Plus size={14} color="#fff" /> Add Bill
        </Button>
      </View>

      <ScrollFilters
        filter={filter}
        onChange={setFilter}
        isDark={isDark}
      />

      {loading ? (
        <Text style={{ color: theme.colors.mutedForeground }}>Loading…</Text>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No bills yet"
          description="Statements are created automatically on each card’s bill generation day from that cycle’s spend. Due date is 5 days later. Set a bill generation day on the card if nothing appears. You can still add a bill manually."
        />
      ) : (
        <>
          {current.length > 0 ? (
            <View style={{ gap: 4 }}>
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontWeight: "600",
                  marginBottom: 4,
                }}
              >
                Current Bills
              </Text>
              {current.map(renderBill)}
            </View>
          ) : null}
          {history.length > 0 ? (
            <View style={{ gap: 4, marginTop: 8 }}>
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontWeight: "600",
                  marginBottom: 4,
                }}
              >
                History
              </Text>
              {history.map(renderBill)}
            </View>
          ) : null}
        </>
      )}

      <CreateCreditCardBillModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        accounts={accounts}
        accountTypes={accountTypes}
      />
    </View>
  );
}

function ScrollFilters({
  filter,
  onChange,
  isDark,
}: {
  filter: FilterKey;
  onChange: (f: FilterKey) => void;
  isDark: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.filterRow}>
      {FILTERS.map((f) => {
        const selected = filter === f.key;
        return (
          <Pressable
            key={f.key}
            onPress={() => {
              haptic.selection().catch(() => undefined);
              onChange(f.key);
            }}
            style={[
              styles.filterPill,
              {
                backgroundColor: selected
                  ? theme.colors.primary
                  : isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                borderColor: selected ? theme.colors.primary : theme.colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: selected ? "#fff" : theme.colors.foreground,
                fontSize: theme.typography.xs,
                fontWeight: "600",
              }}
            >
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
  },
});

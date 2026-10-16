import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CreditCard, History, Plus, ReceiptText } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { CreateCreditCardBillModal } from "@/components/creditCardBills/CreateCreditCardBillModal";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import {
  DataRow,
  RowGlyph,
  Section,
  toneColor,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useSettings } from "@/providers/SettingsProvider";
import type { CreditCardBill, CreditCardBillStatus } from "@/shared/types/creditCardBill";
import { billStatusPresentation } from "@/shared/utils/creditCardPresentation";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { useTheme } from "@/theme/ThemeProvider";
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

/**
 * The Money hub's Card bills section (SPENDLY-535): statements grouped into
 * current and history, each a row with its card, due date, amount and status
 * word. Filters, sorting, the manual-bill modal and navigation are unchanged.
 */
export function CreditCardBillsList() {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const currency = useDisplayCurrency();
  const { settings } = useSettings();
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

  const openCreate = () => {
    haptic.light().catch(() => undefined);
    setCreateOpen(true);
  };

  const renderBill = (bill: CreditCardBill, index: number, list: CreditCardBill[]) => {
    const status = billStatusPresentation(bill.status);
    const statusColor = toneColor(theme.colors, status.tone);
    const period =
      bill.billingPeriodStart && bill.billingPeriodEnd
        ? `${formatDisplayDate(bill.billingPeriodStart, settings.dateFormat)} – ${formatDisplayDate(bill.billingPeriodEnd, settings.dateFormat)}`
        : null;
    const partlyPaid = bill.remainingAmount > 0 && bill.amountPaid > 0;

    return (
      <DataRow
        key={bill.id}
        onPress={() => router.push(`/credit-card-bills/${bill.id}`)}
        divider={index < list.length - 1}
        leading={
          <RowGlyph size={38} tint={surfaces.wash(statusColor)}>
            <CreditCard size={17} color={statusColor} strokeWidth={2.2} />
          </RowGlyph>
        }
        title={accountName(bill.accountId)}
        meta={[`Due ${formatDisplayDate(bill.dueDate, settings.dateFormat)}`, period].filter(Boolean).join(" · ")}
        value={
          <FinancialAmount value={bill.statementAmount} currency={currency} size="sm" weight="bold" fit={false} />
        }
        valueMeta={
          <View style={styles.statusCol}>
            <Text style={[styles.status, { color: statusColor, fontFamily: theme.fontFamily.semibold }]}>
              {status.word}
            </Text>
            {partlyPaid ? (
              <View style={styles.remaining}>
                <Text style={[styles.remainingLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                  Left
                </Text>
                <FinancialAmount value={bill.remainingAmount} currency={currency} size="xs" tone="muted" fit={false} />
              </View>
            ) : null}
          </View>
        }
        accessibilityLabel={`${accountName(bill.accountId)} bill, ${status.word}`}
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>
            Card bills
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            Statements by due date
          </Text>
        </View>
        <Button size="sm" onPress={openCreate} accessibilityLabel="Add bill" style={styles.addBtn}>
          <Plus size={14} color={theme.colors.primaryForeground} strokeWidth={2.4} />
          <Text style={[styles.addLabel, { color: theme.colors.primaryForeground, fontFamily: theme.fontFamily.semibold }]}>
            Add bill
          </Text>
        </Button>
      </View>

      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          accessibilityRole="tablist"
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={filter === f.key}
              accessibilityRole="tab"
              onPress={() => setFilter(f.key)}
            />
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>

      {loading && bills.length === 0 ? (
        <DashboardSkeleton variant="section" rows={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration="cards"
          title={filter === "all" ? "No bills yet" : "No bills in this filter"}
          description="Statements are created on each card’s bill generation day from that cycle’s spend, due 5 days later. Set a bill day on the card if nothing appears, or add a bill yourself."
          primaryAction={{
            label: "Add bill",
            icon: <Plus size={16} color={theme.colors.primaryForeground} strokeWidth={2.4} />,
            onPress: openCreate,
          }}
        />
      ) : (
        <>
          {current.length > 0 ? (
            <Section
              title="Current bills"
              subtitle={`${current.length} open`}
              icon={<ReceiptText size={16} color={theme.colors.primary} strokeWidth={2.3} />}
              iconTint={surfaces.wash(theme.colors.primary)}
            >
              {current.map((bill, index) => renderBill(bill, index, current))}
            </Section>
          ) : null}
          {history.length > 0 ? (
            <Section
              title="History"
              subtitle={`${history.length} paid or cancelled`}
              icon={<History size={16} color={theme.colors.mutedForeground} strokeWidth={2.3} />}
            >
              {history.map((bill, index) => renderBill(bill, index, history))}
            </Section>
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

const styles = StyleSheet.create({
  container: {
    gap: 14,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 18,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addLabel: {
    fontSize: 13,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  statusCol: {
    alignItems: "flex-end",
    gap: 1,
  },
  status: {
    fontSize: 11.5,
  },
  remaining: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  remainingLabel: {
    fontSize: 11,
  },
});

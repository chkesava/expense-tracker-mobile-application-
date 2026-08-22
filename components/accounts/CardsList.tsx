import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CheckCircle2, Plus } from "lucide-react-native";

import { CreditCardListItem, type CreditCardRowModel } from "@/components/accounts/CreditCardListItem";
import { CreditSummaryCard } from "@/components/accounts/CreditSummaryCard";
import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { CreateCreditCardBillModal } from "@/components/creditCardBills/CreateCreditCardBillModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import {
  ACCOUNT_GREEN,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { EmptyState } from "@/components/common/EmptyState";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useExpenses } from "@/hooks/useExpenses";
import { useSettings } from "@/providers/SettingsProvider";
import { OPEN_BILL_STATUSES } from "@/shared/types/creditCardBill";
import type { Account } from "@/shared/types/expense";
import { computeOutstandingCredit } from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  formatAccountIdentityLine,
  smsMatchingUnconfiguredLabel,
} from "@/shared/utils/accountIdentity";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

const DEFAULT_CARD_ACCENT = "#6D5AE6";

export function CardsList() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);

  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { expenses } = useExpenses();
  const { payments } = useAccountPayments();
  const { bills } = useCreditCardBills();

  const [editingCard, setEditingCard] = useState<Account | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isCreateBillOpen, setIsCreateBillOpen] = useState(false);
  const [selectedPayCardId, setSelectedPayCardId] = useState<string | undefined>();
  const [createBillAccountId, setCreateBillAccountId] = useState<string | undefined>();

  const openBillByAccount = useMemo(() => {
    const map = new Map<string, (typeof bills)[number]>();
    for (const bill of bills) {
      if (!OPEN_BILL_STATUSES.includes(bill.status)) continue;
      const prev = map.get(bill.accountId);
      if (!prev || bill.dueDate < prev.dueDate) map.set(bill.accountId, bill);
    }
    return map;
  }, [bills]);

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  const creditCards = useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) === "credit";
    });
  }, [accounts, typeMap]);

  const creditOverview = useMemo(() => {
    let totalLimit = 0;
    let totalUsed = 0;

    creditCards.forEach((c) => {
      const usage = computeOutstandingCredit(c, expenses, payments, bills, today);
        totalLimit += c.creditLimit || 0;
      totalUsed += usage.unbilledSpend;
    });

    const totalAvailable = Math.max(0, totalLimit - totalUsed);
    const utilizationRate =
      totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0;

    return { totalLimit, totalUsed, totalAvailable, utilizationRate };
  }, [creditCards, expenses, payments, bills, today]);

  const cardRows = useMemo((): CreditCardRowModel[] => {
    return creditCards.map((card) => {
      const usage = computeOutstandingCredit(
        card,
        expenses,
        payments,
        bills,
        today
      );
      const limit = card.creditLimit || 0;
      return {
        id: card.id,
        name: card.name,
        identityLine: formatAccountIdentityLine(card, "Credit Card"),
        smsWarning: smsMatchingUnconfiguredLabel(card, "Credit Card"),
        daysRemaining: usage.daysRemaining,
        usedThisCycle: usage.unbilledSpend,
        cancelledSpend: usage.cancelledSpend,
        statementDue: usage.statementDue,
        outstanding: usage.totalOutstanding,
        availableCredit: usage.availableCredit,
        limit,
        utilization: limit > 0 ? (usage.unbilledSpend / limit) * 100 : 0,
        accent: card.color || DEFAULT_CARD_ACCENT,
        openBill: openBillByAccount.get(card.id) ?? null,
      };
    });
  }, [creditCards, expenses, payments, bills, openBillByAccount, today]);

  const handleOpenCardDetail = useCallback(
    (cardId: string) => {
      haptic.selection().catch(() => undefined);
      router.push({
        pathname: "/accounts/[id]",
        params: { id: cardId },
      });
    },
    [router]
  );

  const handleOpenPayBill = useCallback(
    (cardId?: string) => {
      haptic.light().catch(() => undefined);
      const openBill = cardId ? openBillByAccount.get(cardId) : undefined;
      if (openBill) {
        router.push(`/credit-card-bills/${openBill.id}` as never);
        return;
      }
      setSelectedPayCardId(cardId || creditCards[0]?.id);
      setIsPayModalOpen(true);
    },
    [creditCards, openBillByAccount, router]
  );

  const handleOpenAddCard = useCallback(() => {
    haptic.light().catch(() => undefined);
    setEditingCard(null);
    setIsEditModalOpen(true);
  }, []);

  const handleOpenEditCard = useCallback(
    (cardId: string) => {
      haptic.light().catch(() => undefined);
      const card = creditCards.find((item) => item.id === cardId) ?? null;
      setEditingCard(card);
      setIsEditModalOpen(true);
    },
    [creditCards]
  );

  const handleAddStatement = useCallback((cardId: string) => {
    haptic.selection().catch(() => undefined);
    setCreateBillAccountId(cardId);
    setIsCreateBillOpen(true);
  }, []);

  return (
    <View style={styles.container}>
      <CreditSummaryCard
        totalUsed={creditOverview.totalUsed}
        totalLimit={creditOverview.totalLimit}
        totalAvailable={creditOverview.totalAvailable}
        utilizationRate={creditOverview.utilizationRate}
        currency={displayCurrency}
      />

      <View style={styles.actionRow}>
        <Pressable
          onPress={handleOpenAddCard}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: isDark ? "rgba(12, 16, 24, 0.92)" : theme.colors.card,
              borderColor: isDark ? "rgba(148, 163, 184, 0.16)" : theme.colors.border,
            },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add card"
        >
          <Plus size={16} color={CARD_ORANGE} strokeWidth={2.4} />
          <Text style={[styles.actionButtonText, { color: theme.colors.foreground }]}>
            Add Card
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleOpenPayBill()}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: isDark ? "rgba(12, 16, 24, 0.92)" : theme.colors.card,
              borderColor: isDark ? "rgba(148, 163, 184, 0.16)" : theme.colors.border,
            },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Pay bill"
        >
          <CheckCircle2 size={16} color={isDark ? ACCOUNT_GREEN : theme.colors.success} />
          <Text style={[styles.actionButtonText, { color: theme.colors.foreground }]}>
            Pay Bill
          </Text>
        </Pressable>
      </View>

      {creditCards.length === 0 ? (
        <EmptyState
          illustration="cards"
          title="No Credit Cards Added"
          description="Keep track of billing statement dates, credit limits, and automatic due date reminders."
          primaryAction={{
            label: "Add Credit Card",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
            onPress: handleOpenAddCard,
          }}
          secondaryAction={{
            label: "Record Bill Payment",
            icon: <CheckCircle2 size={16} color={theme.colors.success} />,
            onPress: () => handleOpenPayBill(),
          }}
          tip="Setting your billing cycle reset date enables automated payment countdowns and credit health tracking."
        />
      ) : (
        <View style={styles.list}>
          {cardRows.map((row) => (
            <CreditCardListItem
              key={row.id}
              row={row}
              currency={displayCurrency}
              onPress={handleOpenCardDetail}
              onLongPress={handleOpenEditCard}
              onAddStatement={handleAddStatement}
              onPay={handleOpenPayBill}
            />
          ))}
        </View>
      )}

      <EditAccountModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        account={editingCard}
      />

      <PayCreditBillModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        defaultCreditCardId={selectedPayCardId}
        accounts={accounts}
        accountTypes={accountTypes}
      />

      <CreateCreditCardBillModal
        isOpen={isCreateBillOpen}
        onClose={() => setIsCreateBillOpen(false)}
        accounts={accounts}
        accountTypes={accountTypes}
        defaultAccountId={createBillAccountId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.78,
  },
  list: {
    gap: 12,
  },
});

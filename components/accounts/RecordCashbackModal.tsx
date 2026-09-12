import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CreditCard, Gift, Receipt } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { appDialog } from "@/lib/appDialog";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useSettings } from "@/providers/SettingsProvider";
import type {
  Account,
  AccountType,
  CashbackKind,
  CashbackSource,
  Expense,
} from "@/shared/types/expense";
import { computeOutstandingCredit } from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { cashbackDocId } from "@/shared/utils/cashbackId";
import { cashbackAppliedToExpense, validateCashbackInput } from "@/shared/utils/cashbackValidate";
import { formatDateKey, todayDateKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/** How many recent card purchases to offer as link targets. */
const LINKABLE_PURCHASE_LIMIT = 25;

export interface RecordCashbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCreditCardId?: string;
  accounts: Account[];
  accountTypes: AccountType[];
  /** Prefill, e.g. an unlogged credit picked up from a statement. */
  defaultAmount?: number;
  defaultDate?: string;
  defaultProviderRef?: string;
  /** Where the entry came from, for the audit trail. */
  source?: CashbackSource;
  onRecorded?: (cashbackId: string) => void | Promise<void>;
}

/**
 * Record cashback / a statement credit against a credit card.
 *
 * The thing this screen has to get across is that cashback is *not* a bill
 * payment: no money left an account, the original purchase stays exactly as it
 * was, and what changes is only what the card owes.
 */
export function RecordCashbackModal({
  isOpen,
  onClose,
  defaultCreditCardId,
  accounts,
  accountTypes,
  defaultAmount,
  defaultDate,
  defaultProviderRef,
  source = "manual",
  onRecorded,
}: RecordCashbackModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const { settings } = useSettings();
  const { payments, addCashback } = useAccountPayments();
  const { expenses } = useExpenses();
  const { bills } = useCreditCardBills();

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  const creditCards = useMemo(
    () =>
      accounts.filter(
        (a) => getAccountKind(typeMap.get(a.typeId) || "") === "credit"
      ),
    [accounts, typeMap]
  );

  const [cardId, setCardId] = useState(
    defaultCreditCardId || creditCards[0]?.id || ""
  );
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [kind, setKind] = useState<CashbackKind>("statement_credit");
  const [linkedExpenseId, setLinkedExpenseId] = useState<string | undefined>();
  const [providerRef, setProviderRef] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedCard = useMemo(
    () => creditCards.find((c) => c.id === cardId),
    [creditCards, cardId]
  );

  const usageInfo = useMemo(() => {
    if (!selectedCard) return null;
    return computeOutstandingCredit(
      selectedCard,
      expenses,
      payments,
      bills,
      todayDateKey(settings.timezone)
    );
  }, [selectedCard, expenses, payments, bills, settings.timezone]);

  /** Recent purchases on this card that still have cashback headroom. */
  const linkablePurchases = useMemo(() => {
    if (!cardId) return [] as Expense[];
    return expenses
      .filter((e) => e.accountId === cardId && e.id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, LINKABLE_PURCHASE_LIMIT);
  }, [expenses, cardId]);

  useEffect(() => {
    if (!isOpen) return;
    setCardId(defaultCreditCardId || creditCards[0]?.id || "");
    setAmount(defaultAmount != null && defaultAmount > 0 ? String(defaultAmount) : "");
    setDate(defaultDate || formatDateKey(new Date()));
    setKind("statement_credit");
    setLinkedExpenseId(undefined);
    setProviderRef(defaultProviderRef || "");
    setNote("");
    setSaving(false);
    // `creditCards` is intentionally excluded: it is a fresh array every render
    // and would reset the user's card choice mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultCreditCardId, defaultAmount, defaultDate, defaultProviderRef]);

  // A purchase on one card cannot be the source of cashback on another.
  useEffect(() => {
    if (!linkedExpenseId) return;
    const linked = expenses.find((e) => e.id === linkedExpenseId);
    if (!linked || linked.accountId !== cardId) setLinkedExpenseId(undefined);
  }, [cardId, linkedExpenseId, expenses]);

  const linkedExpense = useMemo(
    () => expenses.find((e) => e.id === linkedExpenseId),
    [expenses, linkedExpenseId]
  );

  /** What is left of the linked purchase after cashback already recorded. */
  const eligibleOnLinked = useMemo(() => {
    if (!linkedExpense?.id) return null;
    return roundMoney(
      Math.max(
        0,
        linkedExpense.amount - cashbackAppliedToExpense(linkedExpense.id, payments)
      )
    );
  }, [linkedExpense, payments]);

  const handleSubmit = async () => {
    // Guard at entry, not after the awaits: a double-tap must not get two
    // writes in flight before the first has disabled the button.
    if (saving) return;

    const parsedAmount = Number.parseFloat(amount);
    const validation = validateCashbackInput(
      {
        cardId,
        amount: parsedAmount,
        date: date.trim(),
        kind,
        linkedExpenseId,
      },
      {
        accounts,
        accountTypes,
        expenses,
        payments,
        totalOutstanding: usageInfo?.totalOutstanding ?? 0,
      }
    );
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }

    const entry = {
      cardId,
      amount: roundMoney(parsedAmount),
      date: date.trim(),
      kind,
      linkedExpenseId,
    };

    // The id is derived from the entry, so an identical one would overwrite the
    // credit already on file rather than adding to it. That is exactly what we
    // want for a retry and exactly wrong for two genuine credits that happen to
    // match, so the ambiguous case is the user's to resolve.
    const duplicate = payments.find(
      (payment) => payment.id === cashbackDocId(entry) && !payment.voidedAt
    );
    if (duplicate) {
      appDialog.alert(
        "Already recorded?",
        "A cashback with the same card, date, amount and purchase is already on file. Recording it again only makes sense if the provider really did credit you twice.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Record anyway",
            onPress: () => {
              void commit(entry, String(Date.now()));
            },
          },
        ]
      );
      return;
    }

    await commit(entry);
  };

  const commit = async (
    entry: {
      cardId: string;
      amount: number;
      date: string;
      kind: CashbackKind;
      linkedExpenseId?: string;
    },
    discriminator?: string
  ) => {
    setSaving(true);
    try {
      const cashbackId = await addCashback({
        ...entry,
        note: note.trim() || undefined,
        providerRef: providerRef.trim() || undefined,
        source,
        discriminator,
      });
      if (!cashbackId) return;
      if (onRecorded) await onRecorded(cashbackId);
      onClose();
    } catch (err) {
      logError("creditCard.recordCashback", err);
      toast.error(friendlyErrorMessage(err, "Couldn't record the cashback."));
    } finally {
      setSaving(false);
    }
  };

  const subtleBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const panelBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";

  const kindOptions: { value: CashbackKind; label: string; hint: string }[] = [
    {
      value: "statement_credit",
      label: "Statement credit",
      hint: "Credited against a purchase on this card",
    },
    {
      value: "reward",
      label: "Reward",
      hint: "A general reward not tied to one purchase",
    },
  ];

  if (creditCards.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Record Cashback">
        <View style={{ gap: 12, paddingBottom: 20 }}>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            Cashback is credited to a credit card, and there are no credit card
            accounts yet. Add one first, then record the cashback against it.
          </Text>
          <Button variant="outline" size="lg" onPress={onClose}>
            Close
          </Button>
        </View>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Cashback">
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            lineHeight: 20,
          }}
        >
          Cashback reduces what this card owes. It is not a bill payment, no money
          leaves your accounts, and the original purchase stays in your spending
          exactly as it is.
        </Text>

        {/* Card */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Credit Card *
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {creditCards.map((c) => {
              const isSelected = cardId === c.id;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Credit card ${c.name}`}
                  onPress={() => {
                    haptic.selection().catch(() => undefined);
                    setCardId(c.id);
                  }}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : subtleBg,
                      borderColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.border,
                    },
                  ]}
                >
                  <CreditCard
                    size={14}
                    color={
                      isSelected
                        ? theme.colors.primaryForeground
                        : theme.colors.mutedForeground
                    }
                  />
                  <Text
                    style={[
                      styles.pillText,
                      {
                        color: isSelected
                          ? theme.colors.primaryForeground
                          : theme.colors.foreground,
                        fontSize: theme.typography.xs,
                      },
                    ]}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* What the card owes right now — the ceiling for this entry. */}
        {usageInfo ? (
          <View
            style={[
              styles.panel,
              { backgroundColor: panelBg, borderColor: theme.colors.border },
            ]}
          >
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.xs,
                  fontWeight: "600",
                }}
              >
                Outstanding on this card
              </Text>
              <Amount
                value={usageInfo.totalOutstanding}
                currency={displayCurrency}
                style={{
                  color: theme.colors.foreground,
                  fontSize: theme.typography.lg,
                  fontWeight: "700",
                }}
              />
            </View>
            {usageInfo.totalOutstanding > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Use the full outstanding amount"
                onPress={() => {
                  haptic.selection().catch(() => undefined);
                  setAmount(String(usageInfo.totalOutstanding));
                }}
                style={[styles.quickBtn, { backgroundColor: theme.colors.primary }]}
              >
                <Text
                  style={{
                    color: theme.colors.primaryForeground,
                    fontSize: theme.typography.xs,
                    fontWeight: "700",
                  }}
                >
                  Use full
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Input
          label="Cashback Amount *"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />

        <Input
          label="Cashback Date * (YYYY-MM-DD)"
          value={date}
          onChangeText={setDate}
          autoCapitalize="none"
          placeholder="2026-01-31"
        />

        {/* Kind */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Type *
          </Text>
          <View style={{ gap: 8 }}>
            {kindOptions.map((option) => {
              const isSelected = kind === option.value;
              const Icon = option.value === "statement_credit" ? Receipt : Gift;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${option.label}. ${option.hint}`}
                  onPress={() => {
                    haptic.selection().catch(() => undefined);
                    setKind(option.value);
                  }}
                  style={[
                    styles.kindRow,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary + "14"
                        : subtleBg,
                      borderColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.border,
                    },
                  ]}
                >
                  <Icon
                    size={16}
                    color={
                      isSelected ? theme.colors.primary : theme.colors.mutedForeground
                    }
                  />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text
                      style={{
                        color: theme.colors.foreground,
                        fontSize: theme.typography.sm,
                        fontWeight: "700",
                      }}
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.mutedForeground,
                        fontSize: theme.typography.xs,
                      }}
                    >
                      {option.hint}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Optional link to the purchase this cashback came from */}
        {linkablePurchases.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text
              style={[
                styles.label,
                { color: theme.colors.foreground, fontSize: theme.typography.sm },
              ]}
            >
              Linked purchase (optional)
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !linkedExpenseId }}
                accessibilityLabel="Not linked to a purchase"
                onPress={() => {
                  haptic.selection().catch(() => undefined);
                  setLinkedExpenseId(undefined);
                }}
                style={[
                  styles.pill,
                  {
                    backgroundColor: !linkedExpenseId
                      ? theme.colors.primary
                      : subtleBg,
                    borderColor: !linkedExpenseId
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    {
                      color: !linkedExpenseId
                        ? theme.colors.primaryForeground
                        : theme.colors.foreground,
                      fontSize: theme.typography.xs,
                    },
                  ]}
                >
                  Not linked
                </Text>
              </Pressable>
              {linkablePurchases.map((purchase) => {
                const isSelected = linkedExpenseId === purchase.id;
                const label = `${purchase.date.slice(5)} · ${
                  purchase.note || purchase.category
                }`;
                return (
                  <Pressable
                    key={purchase.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Link to ${label}`}
                    onPress={() => {
                      haptic.selection().catch(() => undefined);
                      setLinkedExpenseId(purchase.id);
                    }}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: isSelected ? theme.colors.primary : subtleBg,
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: isSelected
                            ? theme.colors.primaryForeground
                            : theme.colors.foreground,
                          fontSize: theme.typography.xs,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {linkedExpense && eligibleOnLinked != null ? (
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.xs,
                }}
              >
                {eligibleOnLinked > 0
                  ? `${eligibleOnLinked.toLocaleString()} of this ${linkedExpense.amount.toLocaleString()} purchase is still eligible for cashback.`
                  : "This purchase has already been fully cashed back."}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Input
          label="Provider reference (optional)"
          value={providerRef}
          onChangeText={setProviderRef}
          autoCapitalize="none"
          placeholder="Statement or offer reference"
        />

        <Input
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. 100% cashback on recharge"
        />

        <Button
          onPress={() => void handleSubmit()}
          disabled={saving}
          size="lg"
          style={{ marginTop: 8 }}
        >
          {saving ? "Saving..." : "Record Cashback"}
        </Button>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: "700",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    maxWidth: 220,
  },
  pillText: {
    fontWeight: "700",
  },
  panel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  kindRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
});

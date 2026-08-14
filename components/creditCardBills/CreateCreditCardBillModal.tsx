import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { CreditCard } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { toast } from "@/lib/toast";
import { useSettings } from "@/providers/SettingsProvider";
import type { Account, AccountType } from "@/shared/types/expense";
import { DEFAULT_BILL_REMINDER_FREQUENCY } from "@/shared/types/creditCardBill";
import { getAccountKind } from "@/shared/utils/accountKind";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type CreateCreditCardBillModalProps = {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  accountTypes: AccountType[];
  defaultAccountId?: string;
};

export function CreateCreditCardBillModal({
  isOpen,
  onClose,
  accounts,
  accountTypes,
  defaultAccountId,
}: CreateCreditCardBillModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings } = useSettings();
  const { createBill } = useCreditCardBills();

  const creditCards = useMemo(() => {
    const typeMap = new Map(accountTypes.map((t) => [t.id, t.name]));
    return accounts.filter(
      (a) => getAccountKind(typeMap.get(a.typeId) || "") === "credit"
    );
  }, [accounts, accountTypes]);

  const [accountId, setAccountId] = useState(defaultAccountId || "");
  const [statementAmount, setStatementAmount] = useState("");
  const [minimumDue, setMinimumDue] = useState("");
  const [statementDate, setStatementDate] = useState(formatDateKey(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [note, setNote] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAccountId(defaultAccountId || creditCards[0]?.id || "");
    setStatementAmount("");
    setMinimumDue("");
    setStatementDate(formatDateKey(new Date()));
    setDueDate("");
    setPeriodStart("");
    setPeriodEnd("");
    setNote("");
    setReminderEnabled(settings.creditCardBillReminders.enabled);
  }, [isOpen, defaultAccountId, creditCards, settings.creditCardBillReminders.enabled]);

  const handleSubmit = async () => {
    const parsedStatement = parseFloat(statementAmount);
    const parsedMin = parseFloat(minimumDue || "0");
    setSaving(true);
    try {
      const id = await createBill({
        accountId,
        statementAmount: parsedStatement,
        minimumDueAmount: Number.isFinite(parsedMin) ? parsedMin : 0,
        statementDate: statementDate.trim(),
        dueDate: dueDate.trim(),
        billingPeriodStart: periodStart.trim() || undefined,
        billingPeriodEnd: periodEnd.trim() || undefined,
        note: note.trim() || undefined,
        currency: settings.currency,
        reminderEnabled,
        reminderFrequency: {
          ...DEFAULT_BILL_REMINDER_FREQUENCY,
          daysBefore: settings.creditCardBillReminders.daysBefore,
          onDueDate: settings.creditCardBillReminders.onDueDate,
          overdueEveryDays: settings.creditCardBillReminders.overdueEveryDays,
        },
      });
      if (id) {
        toast.success("Credit card bill created");
        onClose();
      } else {
        toast.error("Failed to create bill");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Credit Card Bill">
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6 }}>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: theme.typography.sm,
            }}
          >
            Credit Card *
          </Text>
          {creditCards.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              No credit card accounts found. Create a Credit Card account first.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {creditCards.map((c) => {
                const selected = accountId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setAccountId(c.id);
                    }}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: selected
                          ? theme.colors.primary
                          : isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                  >
                    <CreditCard
                      size={14}
                      color={
                        selected ? "#fff" : theme.colors.mutedForeground
                      }
                    />
                    <Text
                      style={{
                        color: selected ? "#fff" : theme.colors.foreground,
                        fontSize: theme.typography.sm,
                      }}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        <Input
          label="Statement Amount *"
          value={statementAmount}
          onChangeText={setStatementAmount}
          keyboardType="decimal-pad"
          placeholder="8450"
        />
        <Input
          label="Minimum Due *"
          value={minimumDue}
          onChangeText={setMinimumDue}
          keyboardType="decimal-pad"
          placeholder="850"
        />
        <Input
          label="Statement Date * (YYYY-MM-DD)"
          value={statementDate}
          onChangeText={setStatementDate}
          placeholder="2026-08-01"
          autoCapitalize="none"
        />
        <Input
          label="Due Date * (YYYY-MM-DD)"
          value={dueDate}
          onChangeText={setDueDate}
          placeholder="2026-08-21"
          autoCapitalize="none"
        />
        <Input
          label="Billing Period Start (optional)"
          value={periodStart}
          onChangeText={setPeriodStart}
          placeholder="2026-07-01"
          autoCapitalize="none"
        />
        <Input
          label="Billing Period End (optional)"
          value={periodEnd}
          onChangeText={setPeriodEnd}
          placeholder="2026-07-31"
          autoCapitalize="none"
        />
        <Input
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="July statement"
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={{ color: theme.colors.foreground, flex: 1 }}>
            Reminder enabled
          </Text>
          <Switch
            value={reminderEnabled}
            onValueChange={setReminderEnabled}
            trackColor={{ true: theme.colors.primary }}
          />
        </View>

        <Button
          size="lg"
          onPress={() => void handleSubmit()}
          disabled={saving || creditCards.length === 0}
        >
          {saving ? "Saving…" : "Create Bill"}
        </Button>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
  },
});

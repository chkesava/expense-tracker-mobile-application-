import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { CreditCard, Landmark, Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useExpenses } from "@/hooks/useExpenses";
import { toast } from "@/lib/toast";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Account, AccountType } from "@/shared/types/expense";
import { computeCreditUsage } from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface PayCreditBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCreditCardId?: string;
  accounts: Account[];
  accountTypes: AccountType[];
}

export function PayCreditBillModal({
  isOpen,
  onClose,
  defaultCreditCardId,
  accounts,
  accountTypes,
}: PayCreditBillModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { addPayment, addExternalPayment, payments } = useAccountPayments();
  const { expenses } = useExpenses();

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  // Split into credit cards and payment source accounts
  const creditCards = useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) === "credit";
    });
  }, [accounts, typeMap]);

  const bankAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) !== "credit";
    });
  }, [accounts, typeMap]);

  const [toCardId, setToCardId] = useState(
    defaultCreditCardId || creditCards[0]?.id || ""
  );
  const [fromAccountId, setFromAccountId] = useState(
    bankAccounts[0]?.id || "external"
  );
  const [isExternal, setIsExternal] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [note, setNote] = useState("Credit card bill payment");
  const [saving, setSaving] = useState(false);

  // Sync default credit card
  useEffect(() => {
    if (defaultCreditCardId) {
      setToCardId(defaultCreditCardId);
    } else if (creditCards[0]?.id && !toCardId) {
      setToCardId(creditCards[0].id);
    }
  }, [defaultCreditCardId, creditCards, toCardId]);

  // Selected card usage
  const selectedCard = useMemo(() => {
    return creditCards.find((c) => c.id === toCardId);
  }, [creditCards, toCardId]);

  const usageInfo = useMemo(() => {
    if (!selectedCard) return null;
    return computeCreditUsage(selectedCard, expenses, payments);
  }, [selectedCard, expenses, payments]);

  const handleFillOutstanding = () => {
    if (usageInfo && usageInfo.usedThisCycle > 0) {
      setAmount(String(usageInfo.usedThisCycle));
    }
  };

  const handleSubmit = async () => {
    if (!toCardId) {
      toast.error("Please select a credit card");
      return;
    }
    if (!isExternal && !fromAccountId) {
      toast.error("Please select a payment source bank account");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!date.trim()) {
      toast.error("Please enter a payment date");
      return;
    }

    setSaving(true);
    try {
      let ok = false;
      if (isExternal || fromAccountId === "external") {
        ok = await addExternalPayment(
          toCardId,
          parsedAmount,
          date.trim(),
          note.trim() || undefined
        );
      } else {
        ok = await addPayment(
          fromAccountId,
          toCardId,
          parsedAmount,
          date.trim(),
          note.trim() || undefined
        );
      }

      if (ok) {
        toast.success("Bill payment recorded");
        setAmount("");
        onClose();
      } else {
        toast.error("Failed to record payment");
      }
    } catch (err) {
      console.error("Save bill payment error:", err);
      toast.error("Failed to save bill payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pay Credit Card Bill">
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Credit Card Selector */}
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
              const isSelected = toCardId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setToCardId(c.id);
                  }}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
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

        {/* Current Cycle Usage Card */}
        {usageInfo ? (
          <View
            style={[
              styles.usageCard,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.02)",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  color: theme.colors.mutedForeground,
                }}
              >
                Current Cycle Used
              </Text>
              <Amount
                value={usageInfo.usedThisCycle}
                currency={system.defaultCurrency}
                style={{
                  fontSize: theme.typography.md,
                  fontWeight: "700",
                  color: theme.colors.destructive,
                }}
              />
            </View>

            {usageInfo.usedThisCycle > 0 ? (
              <Pressable
                onPress={handleFillOutstanding}
                style={[
                  styles.quickPayBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.primaryForeground,
                    fontSize: theme.typography.xs,
                    fontWeight: "700",
                  }}
                >
                  Pay Full
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Paid From Source */}
        <View style={{ gap: 6 }}>
          <View style={styles.sourceHeader}>
            <Text
              style={[
                styles.label,
                {
                  color: theme.colors.foreground,
                  fontSize: theme.typography.sm,
                },
              ]}
            >
              Paid From Account
            </Text>
            <Pressable
              onPress={() => setIsExternal((prev) => !prev)}
              style={[
                styles.externalToggle,
                {
                  backgroundColor: isExternal
                    ? theme.colors.primary
                    : isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.04)",
                  borderColor: isExternal
                    ? theme.colors.primary
                    : theme.colors.border,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: isExternal
                    ? theme.colors.primaryForeground
                    : theme.colors.mutedForeground,
                }}
              >
                Already Paid / External
              </Text>
            </Pressable>
          </View>

          {!isExternal ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {bankAccounts.map((b) => {
                const isSelected = fromAccountId === b.id;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setFromAccountId(b.id);
                    }}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                  >
                    <Landmark
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
                      {b.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
                fontStyle: "italic",
              }}
            >
              This payment will not deduct funds from any tracked bank account.
            </Text>
          )}
        </View>

        {/* Amount */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Payment Amount *
          </Text>
          <Input
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </View>

        {/* Date */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Date (YYYY-MM-DD) *
          </Text>
          <Input
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        {/* Note */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Note
          </Text>
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Card statement payment"
          />
        </View>

        {/* Submit */}
        <Button
          onPress={handleSubmit}
          disabled={saving}
          size="lg"
          style={{ marginTop: 8 }}
        >
          {saving ? "Processing..." : "Record Bill Payment"}
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
  },
  pillText: {
    fontWeight: "700",
  },
  usageCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickPayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  sourceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  externalToggle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
});

import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import type { Split } from "@/shared/types/split";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  computeCollectSpendBreakdown,
  uniqueCollectedAccountIds,
} from "@/shared/utils/splitMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface UseGiftMoneyModalProps {
  visible: boolean;
  split: Split | null;
  onClose: () => void;
  onConfirm: (spendAmount: number, payingAccountId: string) => Promise<boolean>;
}

export function UseGiftMoneyModal({
  visible,
  split,
  onClose,
  onConfirm,
}: UseGiftMoneyModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible && split) {
      setAmount(String(split.totalAmount));
      const collectedIds = uniqueCollectedAccountIds(split);
      setAccountId(collectedIds[0] || accounts[0]?.id || "");
    }
  }, [visible, split, accounts]);

  const spendAmount = parseFloat(amount) || 0;
  const breakdown = useMemo(() => {
    if (!split) {
      return { othersCollected: 0, passThroughDebit: 0, ownExpense: 0 };
    }
    return computeCollectSpendBreakdown(split, spendAmount);
  }, [split, spendAmount]);

  const collectedIds = split ? uniqueCollectedAccountIds(split) : [];
  const mismatch =
    accountId && collectedIds.length > 0 && !collectedIds.includes(accountId);

  const typeMap = useMemo(
    () => new Map(accountTypes.map((t) => [t.id, t.name])),
    [accountTypes]
  );
  const mismatchNames = accounts
    .filter((a) => collectedIds.includes(a.id))
    .map((a) => a.name)
    .join(", ");
  const payingName = accounts.find((a) => a.id === accountId)?.name || "this account";

  const handleConfirm = async () => {
    if (!split || spendAmount <= 0 || !accountId) return;
    haptic.selection().catch(() => undefined);
    setSubmitting(true);
    try {
      const ok = await onConfirm(spendAmount, accountId);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!split) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.cardForeground }]}>
              Use money for gift
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
            Record the purchase. Only your out-of-pocket amount becomes an
            expense; friends&apos; money leaves the account without counting as
            spending.
          </Text>

          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            ACTUAL GIFT AMOUNT ({displayCurrency})
          </Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.colors.mutedForeground}
            style={[
              styles.input,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.02)",
                borderColor: theme.colors.border,
                color: theme.colors.foreground,
              },
            ]}
          />

          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            PAID FROM ACCOUNT
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {accounts.map((acc) => {
              const isSelected = accountId === acc.id;
              const kind = getAccountKind(typeMap.get(acc.typeId) || "");
              return (
                <Pressable
                  key={acc.id}
                  onPress={() => setAccountId(acc.id)}
                  style={[
                    styles.chip,
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
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: isSelected ? "700" : "500",
                      color: isSelected
                        ? theme.colors.primaryForeground
                        : theme.colors.foreground,
                    }}
                  >
                    {acc.name}
                    {kind === "credit" ? " (card)" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {mismatch ? (
            <Text style={[styles.warn, { color: theme.colors.destructive }]}>
              Money was collected into {mismatchNames || "another account"}.
              You&apos;re paying from {payingName} — transfer first or pick the
              collection account.
            </Text>
          ) : null}

          <View
            style={[
              styles.breakdown,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Row
              label="Collected from friends"
              value={`${displayCurrency} ${breakdown.othersCollected.toFixed(2)}`}
              color={theme.colors.mutedForeground}
            />
            <Row
              label="Friends' money used (not expense)"
              value={`${displayCurrency} ${breakdown.passThroughDebit.toFixed(2)}`}
              color={theme.colors.mutedForeground}
            />
            <Row
              label="Your expense"
              value={`${displayCurrency} ${breakdown.ownExpense.toFixed(2)}`}
              color={theme.colors.foreground}
            />
          </View>

          <View style={styles.footer}>
            <Button variant="outline" onPress={onClose} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={handleConfirm}
              disabled={submitting || spendAmount <= 0 || !accountId}
              style={{ flex: 2 }}
            >
              {submitting ? "Recording..." : "Record purchase"}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "700",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  warn: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  breakdown: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rowLabel: {
    fontSize: 12,
    flex: 1,
  },
  rowValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});

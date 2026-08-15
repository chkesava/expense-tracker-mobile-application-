import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ArrowRight, TrendingUp, Wallet } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { usePortfolio } from "@/hooks/usePortfolio";
import { logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { Account } from "@/shared/types/expense";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export const DEMAT_ACCOUNT_ID = "stocks_demat";

export interface TransferFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFromAccountId?: string;
  defaultToAccountId?: string;
  accounts: Account[];
}

export function TransferFundsModal({
  isOpen,
  onClose,
  defaultFromAccountId,
  defaultToAccountId,
  accounts,
}: TransferFundsModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { addTransfer } = useAccountTransfers();
  const { addEntry } = useAccountEntries();
  const { depositCash, withdrawCash } = usePortfolio();

  const selectableOptions = useMemo(() => {
    return [
      ...accounts,
      {
        id: DEMAT_ACCOUNT_ID,
        name: "Stocks Demat Cash",
        typeId: "demat",
        createdAt: "",
      } as Account,
    ];
  }, [accounts]);

  const [fromAccountId, setFromAccountId] = useState(
    defaultFromAccountId || accounts[0]?.id || ""
  );
  const [toAccountId, setToAccountId] = useState(
    defaultToAccountId || DEMAT_ACCOUNT_ID
  );
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [note, setNote] = useState("Account fund transfer");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultFromAccountId) {
      setFromAccountId(defaultFromAccountId);
    }
    if (defaultToAccountId) {
      setToAccountId(defaultToAccountId);
    }
  }, [defaultFromAccountId, defaultToAccountId, isOpen]);

  const handleSubmit = async () => {
    if (!fromAccountId) {
      toast.error("Please select a source account");
      return;
    }
    if (!toAccountId) {
      toast.error("Please select a destination account");
      return;
    }
    if (fromAccountId === toAccountId) {
      toast.error("Source and destination accounts must be different");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Please enter a valid transfer amount");
      return;
    }
    if (!date.trim()) {
      toast.error("Please enter a date");
      return;
    }

    setSaving(true);
    try {
      if (fromAccountId === DEMAT_ACCOUNT_ID) {
        // Stocks Demat -> Bank Account
        const withdrawOk = await withdrawCash(
          parsedAmount,
          note.trim() || `Transfer from Stocks Demat`
        );
        if (!withdrawOk) {
          setSaving(false);
          return;
        }

        await addEntry(
          toAccountId,
          parsedAmount,
          "credit",
          date.trim(),
          note.trim() || `Transfer from Stocks Demat`
        );

        toast.success("Transferred funds from Stocks Demat to Account");
        setAmount("");
        onClose();
      } else if (toAccountId === DEMAT_ACCOUNT_ID) {
        // Bank Account -> Stocks Demat
        const fromAccount = accounts.find((a) => a.id === fromAccountId);
        const entryOk = await addEntry(
          fromAccountId,
          parsedAmount,
          "debit",
          date.trim(),
          note.trim() || `Transfer to Stocks Demat (${fromAccount?.name ?? "Bank"})`
        );

        if (!entryOk) {
          setSaving(false);
          return;
        }

        await depositCash(
          parsedAmount,
          note.trim() || `Transfer from ${fromAccount?.name ?? "Bank Account"}`
        );

        toast.success("Transferred funds to Stocks Demat");
        setAmount("");
        onClose();
      } else {
        // Regular Bank -> Bank Transfer
        const ok = await addTransfer(
          fromAccountId,
          toAccountId,
          parsedAmount,
          date.trim(),
          note.trim() || undefined
        );

        if (ok) {
          toast.success("Transfer recorded successfully");
          setAmount("");
          onClose();
        } else {
          toast.error("Failed to record transfer");
        }
      }
    } catch (err) {
      logError("transferFundsModal.saveTransfer", err);
      toast.error("Failed to save transfer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer Funds">
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Source Account */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            From Account (Source) *
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {selectableOptions.map((a) => {
              const isSelected = fromAccountId === a.id;
              const isDemat = a.id === DEMAT_ACCOUNT_ID;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setFromAccountId(a.id);
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
                  {isDemat ? (
                    <TrendingUp
                      size={14}
                      color={
                        isSelected
                          ? theme.colors.primaryForeground
                          : theme.colors.mutedForeground
                      }
                    />
                  ) : (
                    <Wallet
                      size={14}
                      color={
                        isSelected
                          ? theme.colors.primaryForeground
                          : theme.colors.mutedForeground
                      }
                    />
                  )}
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
                    {a.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Transfer Icon Divider */}
        <View style={styles.arrowRow}>
          <View
            style={[styles.arrowDivider, { backgroundColor: theme.colors.border }]}
          />
          <View
            style={[
              styles.arrowCircle,
              {
                backgroundColor: theme.colors.muted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <ArrowRight size={16} color={theme.colors.primary} />
          </View>
          <View
            style={[styles.arrowDivider, { backgroundColor: theme.colors.border }]}
          />
        </View>

        {/* Destination Account */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            To Account (Destination) *
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {selectableOptions
              .filter((a) => a.id !== fromAccountId)
              .map((a) => {
                const isSelected = toAccountId === a.id;
                const isDemat = a.id === DEMAT_ACCOUNT_ID;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setToAccountId(a.id);
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
                    {isDemat ? (
                      <TrendingUp
                        size={14}
                        color={
                          isSelected
                            ? theme.colors.primaryForeground
                            : theme.colors.mutedForeground
                        }
                      />
                    ) : (
                      <Wallet
                        size={14}
                        color={
                          isSelected
                            ? theme.colors.primaryForeground
                            : theme.colors.mutedForeground
                        }
                      />
                    )}
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
                      {a.name}
                    </Text>
                  </Pressable>
                );
              })}
          </ScrollView>
        </View>

        {/* Amount */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Transfer Amount *
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
            Note / Purpose
          </Text>
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Stocks investment fund, ATM withdrawal"
          />
        </View>

        {/* Submit */}
        <Button
          onPress={handleSubmit}
          disabled={saving}
          size="lg"
          style={{ marginTop: 8 }}
        >
          {saving ? "Transferring..." : "Complete Transfer"}
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
  arrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -4,
  },
  arrowDivider: {
    flex: 1,
    height: 1,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
  },
});

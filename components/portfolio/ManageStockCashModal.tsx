import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { usePortfolio } from "@/hooks/usePortfolio";
import { toast } from "@/lib/toast";
import { getAccountKind } from "@/shared/utils/accountKind";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

interface ManageStockCashModalProps {
  visible: boolean;
  onClose: () => void;
  currency: string;
}

type Mode = "deposit" | "withdraw" | "adjust";

export function ManageStockCashModal({
  visible,
  onClose,
  currency,
}: ManageStockCashModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const { settings, depositCash, withdrawCash } = usePortfolio();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { addEntry } = useAccountEntries();

  const [mode, setMode] = useState<Mode>("deposit");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(formatDateKey(new Date()));
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const currentCash = settings?.cashBalance ?? 0;

  const typeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  // Only non-credit bank accounts
  const bankAccounts = React.useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) !== "credit";
    });
  }, [accounts, typeMap]);

  React.useEffect(() => {
    if (visible) {
      if (bankAccounts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(bankAccounts[0].id);
      }
      setAmount("");
      setDate(formatDateKey(new Date()));
      setNote("");
    }
  }, [visible, bankAccounts, selectedAccountId]);

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      if (mode === "deposit") {
        // Transfer from Bank Account to Demat Stocks Cash
        if (!selectedAccountId) {
          toast.error("Please select a source bank account");
          setLoading(false);
          return;
        }

        const bankAcc = bankAccounts.find((a) => a.id === selectedAccountId);
        const transferNote = note.trim() || `Transfer to Stocks Demat (${bankAcc?.name ?? "Bank"})`;

        // 1. Debit Bank Account
        const entryOk = await addEntry(
          selectedAccountId,
          numAmount,
          "debit",
          date,
          transferNote
        );

        if (!entryOk) {
          toast.error("Failed to debit bank account");
          setLoading(false);
          return;
        }

        // 2. Credit Stocks Demat
        const depositOk = await depositCash(numAmount, transferNote);
        if (depositOk) {
          toast.success(`Transferred ${currency} ${numAmount} to Stocks Demat`);
          onClose();
        }
      } else if (mode === "withdraw") {
        // Transfer from Demat Stocks Cash to Bank Account
        if (numAmount > currentCash) {
          toast.error("Insufficient Demat cash balance");
          setLoading(false);
          return;
        }
        if (!selectedAccountId) {
          toast.error("Please select a destination bank account");
          setLoading(false);
          return;
        }

        const bankAcc = bankAccounts.find((a) => a.id === selectedAccountId);
        const transferNote = note.trim() || `Withdrawal from Stocks Demat to ${bankAcc?.name ?? "Bank"}`;

        // 1. Debit Stocks Demat Cash
        const withdrawOk = await withdrawCash(numAmount, transferNote);
        if (!withdrawOk) {
          setLoading(false);
          return;
        }

        // 2. Credit Bank Account
        await addEntry(
          selectedAccountId,
          numAmount,
          "credit",
          date,
          transferNote
        );

        toast.success(`Transferred ${currency} ${numAmount} to ${bankAcc?.name ?? "Bank"}`);
        onClose();
      } else if (mode === "adjust") {
        // Direct Demat Cash Deposit/Adjustment
        const depositOk = await depositCash(
          numAmount,
          note.trim() || "Direct Demat cash adjustment"
        );
        if (depositOk) {
          toast.success("Demat balance updated");
          onClose();
        }
      }
    } catch (err: any) {
      console.error("Manage stock cash error:", err);
      toast.error(err.message || "Failed to update balance");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Card
          style={[
            styles.contentCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ gap: 2 }}>
              <Text
                style={[
                  styles.title,
                  { color: theme.colors.foreground, fontSize: theme.typography.lg },
                ]}
              >
                Stocks Demat Cash
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: theme.colors.mutedForeground,
                    fontSize: theme.typography.xs,
                  },
                ]}
              >
                Manage uninvested trading & portfolio funds
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[
                styles.closeButton,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.05)",
                },
              ]}
            >
              <X size={18} color={theme.colors.foreground} />
            </Pressable>
          </View>

          {/* Current Balance Banner */}
          <View
            style={[
              styles.balanceBanner,
              {
                backgroundColor: isDark
                  ? "rgba(99, 102, 241, 0.12)"
                  : "rgba(99, 102, 241, 0.08)",
                borderColor: theme.colors.primary,
              },
            ]}
          >
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
                fontWeight: "600",
              }}
            >
              Current Cash Balance
            </Text>
            <Amount
              value={currentCash}
              currency={currency}
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: theme.colors.foreground,
              }}
            />
          </View>

          {/* Mode Tabs */}
          <View style={styles.modeTabsRow}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setMode("deposit");
              }}
              style={[
                styles.modeTab,
                {
                  backgroundColor:
                    mode === "deposit"
                      ? theme.colors.primary
                      : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                  borderColor:
                    mode === "deposit"
                      ? theme.colors.primary
                      : theme.colors.border,
                },
              ]}
            >
              <ArrowDownLeft
                size={14}
                color={
                  mode === "deposit"
                    ? theme.colors.primaryForeground
                    : theme.colors.foreground
                }
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color:
                    mode === "deposit"
                      ? theme.colors.primaryForeground
                      : theme.colors.foreground,
                }}
              >
                Add from Bank
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setMode("withdraw");
              }}
              style={[
                styles.modeTab,
                {
                  backgroundColor:
                    mode === "withdraw"
                      ? theme.colors.primary
                      : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                  borderColor:
                    mode === "withdraw"
                      ? theme.colors.primary
                      : theme.colors.border,
                },
              ]}
            >
              <ArrowUpRight
                size={14}
                color={
                  mode === "withdraw"
                    ? theme.colors.primaryForeground
                    : theme.colors.foreground
                }
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color:
                    mode === "withdraw"
                      ? theme.colors.primaryForeground
                      : theme.colors.foreground,
                }}
              >
                Withdraw to Bank
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setMode("adjust");
              }}
              style={[
                styles.modeTab,
                {
                  backgroundColor:
                    mode === "adjust"
                      ? theme.colors.primary
                      : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                  borderColor:
                    mode === "adjust"
                      ? theme.colors.primary
                      : theme.colors.border,
                },
              ]}
            >
              <SlidersHorizontal
                size={14}
                color={
                  mode === "adjust"
                    ? theme.colors.primaryForeground
                    : theme.colors.foreground
                }
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color:
                    mode === "adjust"
                      ? theme.colors.primaryForeground
                      : theme.colors.foreground,
                }}
              >
                Direct Credit
              </Text>
            </Pressable>
          </View>

          {/* Form Fields */}
          <ScrollView
            contentContainerStyle={{ gap: 14, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {mode !== "adjust" && (
              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    fontSize: theme.typography.sm,
                    fontWeight: "600",
                    color: theme.colors.foreground,
                  }}
                >
                  {mode === "deposit"
                    ? "Source Bank Account"
                    : "Destination Bank Account"}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {bankAccounts.map((a) => {
                    const isSelected = selectedAccountId === a.id;
                    return (
                      <Pressable
                        key={a.id}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => undefined);
                          setSelectedAccountId(a.id);
                        }}
                        style={[
                          styles.accountPill,
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
                          size={13}
                          color={
                            isSelected
                              ? theme.colors.primaryForeground
                              : theme.colors.mutedForeground
                          }
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isSelected ? "700" : "500",
                            color: isSelected
                              ? theme.colors.primaryForeground
                              : theme.colors.foreground,
                          }}
                        >
                          {a.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: theme.typography.sm,
                  fontWeight: "600",
                  color: theme.colors.foreground,
                }}
              >
                Amount ({currency}) *
              </Text>
              <Input
                placeholder="0.00"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: theme.typography.sm,
                  fontWeight: "600",
                  color: theme.colors.foreground,
                }}
              >
                Date *
              </Text>
              <Input
                placeholder="YYYY-MM-DD"
                value={date}
                onChangeText={setDate}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: theme.typography.sm,
                  fontWeight: "600",
                  color: theme.colors.foreground,
                }}
              >
                Notes (Optional)
              </Text>
              <Input
                placeholder="E.g. Trading fund allocation"
                value={note}
                onChangeText={setNote}
              />
            </View>

            <Button
              onPress={handleSubmit}
              loading={loading}
              style={{ marginTop: 8 }}
            >
              {mode === "deposit"
                ? "Transfer to Demat"
                : mode === "withdraw"
                  ? "Withdraw to Bank"
                  : "Add Direct Credit"}
            </Button>
          </ScrollView>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  contentCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 20,
    maxHeight: "85%",
    borderWidth: 1,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontWeight: "800",
  },
  subtitle: {
    fontWeight: "500",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeTabsRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  accountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
});

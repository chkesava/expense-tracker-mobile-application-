import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Landmark,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { InvestmentCashHistoryModal } from "@/components/portfolio/InvestmentCashHistoryModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { usePortfolio } from "@/hooks/usePortfolio";
import { newId } from "@/lib/id";
import { recordInvestmentCashAdjustment } from "@/services/portfolio/investmentCash";
import { investmentCashAdjustmentSchema } from "@/shared/features/portfolio/schemas";
import { findRecentDuplicateAdjustment } from "@/shared/features/portfolio/utils/investmentCash";
import { useAuth } from "@/providers/AuthProvider";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { getAccountKind } from "@/shared/utils/accountKind";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

interface ManageStockCashModalProps {
  visible: boolean;
  onClose: () => void;
  currency: string;
}

type Mode = "deposit" | "withdraw" | "adjust";

const ADJUST_DIRECTIONS: { value: "credit" | "debit"; label: string }[] = [
  { value: "debit", label: "Decrease" },
  { value: "credit", label: "Increase" },
];

export function ManageStockCashModal({
  visible,
  onClose,
  currency,
}: ManageStockCashModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const { cashBalance, availableCash, cashEntries, depositCash, withdrawCash } = usePortfolio();
  const { user } = useAuth();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { addEntry } = useAccountEntries();

  const [mode, setMode] = useState<Mode>("deposit");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(formatDateKey(new Date()));
  const [note, setNote] = useState<string>("");
  const [adjustDirection, setAdjustDirection] = useState<"credit" | "debit">("debit");
  const [reason, setReason] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [historyVisible, setHistoryVisible] = useState(false);

  /** Minted once per open so a retried save rewrites the same adjustment. */
  const adjustmentId = React.useRef(newId());

  const currentCash = cashBalance;

  /** Shows the user what the balance becomes before they commit the correction. */
  const adjustedPreview = React.useMemo(() => {
    const numAmount = parseFloat(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) return null;
    return adjustDirection === "credit"
      ? currentCash + numAmount
      : currentCash - numAmount;
  }, [amount, adjustDirection, currentCash]);

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

  // Clearing the form is tied to the modal opening, not to every dependency of
  // this effect: `selectedAccountId` is in it, so picking a source account used to
  // wipe the amount the user had already typed.
  React.useEffect(() => {
    if (!visible) return;
    setAmount("");
    setDate(formatDateKey(new Date()));
    setNote("");
    setReason("");
    setAdjustDirection("debit");
    adjustmentId.current = newId();
  }, [visible]);

  React.useEffect(() => {
    if (!visible) return;
    if (bankAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(bankAccounts[0].id);
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
        const depositOk = await depositCash(numAmount, transferNote, {
          date,
          accountId: selectedAccountId,
        });
        if (depositOk) {
          toast.success(`Transferred ${currency} ${numAmount} to Stocks Demat`);
          onClose();
        }
      } else if (mode === "withdraw") {
        // Transfer from Demat Stocks Cash to Bank Account
        if (numAmount > availableCash) {
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
        const withdrawOk = await withdrawCash(numAmount, transferNote, {
          date,
          accountId: selectedAccountId,
        });
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
        // A manual correction of the balance itself — used to repair the drift
        // left by holdings that were added before purchases deducted cash. It
        // writes only a new ledger entry; the original holding and transfer
        // records are never touched.
        if (!user?.uid) {
          toast.error("Please sign in again");
          setLoading(false);
          return;
        }

        const parsed = investmentCashAdjustmentSchema.safeParse({
          amount: numAmount,
          direction: adjustDirection,
          date,
          reason,
        });
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Check the adjustment details");
          setLoading(false);
          return;
        }

        if (adjustDirection === "debit" && numAmount > cashBalance) {
          toast.error(
            `A decrease of ${currency} ${numAmount} would take the balance below zero`
          );
          setLoading(false);
          return;
        }

        // A double-tap can land two distinct ids, which the write-level
        // idempotency key cannot catch — so an identical adjustment moments ago
        // is worth confirming rather than silently doubling the correction.
        const duplicate = findRecentDuplicateAdjustment(
          cashEntries,
          { amount: numAmount, direction: adjustDirection, reason: parsed.data.reason },
          Date.now()
        );
        if (duplicate) {
          toast.error("You just made an identical adjustment. Change the reason to record another.");
          setLoading(false);
          return;
        }

        const result = await recordInvestmentCashAdjustment(user.uid, {
          ...parsed.data,
          entryId: adjustmentId.current,
        });
        toast.success(writeSavedMessage(result.outcome, "Investment cash balance adjusted"));
        onClose();
      }
    } catch (err: any) {
      logError("manageStockCashModal.manageStockCash", err);
      logError("portfolio.manageCash", err);
      toast.error(friendlyErrorMessage(err, "Couldn't update the balance."));
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

          <Pressable
            onPress={() => setHistoryVisible(true)}
            accessibilityRole="button"
            style={styles.historyLinkRow}
          >
            <History size={14} color={theme.colors.primary} />
            <Text
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: theme.colors.primary,
              }}
            >
              View cash history
            </Text>
          </Pressable>

          {/* Mode Tabs */}
          <View style={styles.modeTabsRow}>
            <Pressable
              onPress={() => {
                haptic.selection().catch(() => undefined);
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
                haptic.selection().catch(() => undefined);
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
                haptic.selection().catch(() => undefined);
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
                Adjust Balance
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
                          haptic.selection().catch(() => undefined);
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

            {mode === "adjust" && (
              <>
                <View
                  style={[
                    styles.warningBanner,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: isDark
                        ? "rgba(234, 179, 8, 0.12)"
                        : "rgba(234, 179, 8, 0.10)",
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: theme.typography.xs,
                      color: theme.colors.foreground,
                      lineHeight: 17,
                    }}
                  >
                    This changes your available investment cash. It records a separate
                    correction entry and does not alter any holding or bank transfer.
                  </Text>
                </View>

                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontSize: theme.typography.sm,
                      fontWeight: "600",
                      color: theme.colors.foreground,
                    }}
                  >
                    Direction *
                  </Text>
                  <View style={styles.modeTabsRow}>
                    {ADJUST_DIRECTIONS.map((option) => {
                      const isSelected = adjustDirection === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => {
                            haptic.selection().catch(() => undefined);
                            setAdjustDirection(option.value);
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                          style={[
                            styles.modeTab,
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
                              fontWeight: "700",
                              color: isSelected
                                ? theme.colors.primaryForeground
                                : theme.colors.foreground,
                            }}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </>
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

            {mode === "adjust" ? (
              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    fontSize: theme.typography.sm,
                    fontWeight: "600",
                    color: theme.colors.foreground,
                  }}
                >
                  Reason *
                </Text>
                <Input
                  placeholder="E.g. Correcting cash not deducted when a holding was added"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                />
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Shown in your cash history so this correction can be understood later.
                </Text>
              </View>
            ) : (
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
            )}

            {mode === "adjust" && adjustedPreview !== null && (
              <View style={styles.previewRow}>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                    fontWeight: "600",
                  }}
                >
                  Balance after adjustment
                </Text>
                <Amount
                  value={adjustedPreview}
                  currency={currency}
                  style={{ fontSize: 16, fontWeight: "800", color: theme.colors.foreground }}
                />
              </View>
            )}

            <Button
              onPress={handleSubmit}
              loading={loading}
              // An adjustment with no explanation is indistinguishable from the
              // drift it is meant to correct, so the reason gates the save.
              disabled={mode === "adjust" && reason.trim().length < 3}
              style={{ marginTop: 8 }}
            >
              {mode === "deposit"
                ? "Transfer to Demat"
                : mode === "withdraw"
                  ? "Withdraw to Bank"
                  : "Save Adjustment"}
            </Button>
          </ScrollView>
        </Card>
      </View>

      <InvestmentCashHistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        currency={currency}
      />
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
  historyLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 2,
  },
  warningBanner: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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

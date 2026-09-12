import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Landmark,
  SlidersHorizontal,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { InvestmentCashHistoryModal } from "@/components/portfolio/InvestmentCashHistoryModal";
import { Button } from "@/components/ui/Button";
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

const MODE_OPTIONS: Array<{
  id: Mode;
  label: string;
  hint: string;
  Icon: typeof ArrowDownLeft;
}> = [
  {
    id: "deposit",
    label: "Add from Bank",
    hint: "Move money from a bank account into demat cash",
    Icon: ArrowDownLeft,
  },
  {
    id: "withdraw",
    label: "Withdraw to Bank",
    hint: "Move demat cash back to a bank account",
    Icon: ArrowUpRight,
  },
  {
    id: "adjust",
    label: "Adjust Balance",
    hint: "Record a correction without a bank transfer",
    Icon: SlidersHorizontal,
  },
];

export function ManageStockCashModal({
  visible,
  onClose,
  currency,
}: ManageStockCashModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const insets = useSafeAreaInsets();

  const { cashBalance, availableCash, cashEntries, depositCash, withdrawCash } =
    usePortfolio();
  const { user } = useAuth();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { addEntry } = useAccountEntries();

  const [mode, setMode] = useState<Mode>("deposit");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(formatDateKey(new Date()));
  const [note, setNote] = useState<string>("");
  const [adjustDirection, setAdjustDirection] = useState<"credit" | "debit">(
    "debit"
  );
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
        const transferNote =
          note.trim() ||
          `Transfer to Stocks Demat (${bankAcc?.name ?? "Bank"})`;

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
        const transferNote =
          note.trim() ||
          `Withdrawal from Stocks Demat to ${bankAcc?.name ?? "Bank"}`;

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

        toast.success(
          `Transferred ${currency} ${numAmount} to ${bankAcc?.name ?? "Bank"}`
        );
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
          toast.error(
            parsed.error.issues[0]?.message ?? "Check the adjustment details"
          );
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
          {
            amount: numAmount,
            direction: adjustDirection,
            reason: parsed.data.reason,
          },
          Date.now()
        );
        if (duplicate) {
          toast.error(
            "You just made an identical adjustment. Change the reason to record another."
          );
          setLoading(false);
          return;
        }

        const result = await recordInvestmentCashAdjustment(user.uid, {
          ...parsed.data,
          entryId: adjustmentId.current,
        });
        toast.success(
          writeSavedMessage(result.outcome, "Investment cash balance adjusted")
        );
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

  const submitLabel =
    mode === "deposit"
      ? "Transfer to Demat"
      : mode === "withdraw"
        ? "Withdraw to Bank"
        : "Save Adjustment";

  const canSubmit = mode !== "adjust" || reason.trim().length >= 3;

  const inactiveChipBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetAvoider}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text
                  style={[
                    styles.title,
                    {
                      color: theme.colors.foreground,
                      fontSize: theme.typography.lg,
                      fontFamily: theme.fontFamily.bold,
                    },
                  ]}
                >
                  Stocks Demat Cash
                </Text>
                <Text
                  style={{
                    color: theme.colors.mutedForeground,
                    fontSize: theme.typography.xs,
                    fontFamily: theme.fontFamily.medium,
                  }}
                >
                  Manage uninvested trading & portfolio funds
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
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
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  color: theme.colors.mutedForeground,
                  fontFamily: theme.fontFamily.semibold,
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
                  fontFamily: theme.fontFamily.bold,
                  color: theme.colors.primary,
                }}
              >
                View cash history
              </Text>
            </Pressable>

            {/* Mode options — full-width stacked chips so labels never overlap */}
            <View style={styles.modeList}>
              {MODE_OPTIONS.map((option) => {
                const selected = mode === option.id;
                const Icon = option.Icon;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      haptic.selection().catch(() => undefined);
                      setMode(option.id);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                    style={[
                      styles.modeChip,
                      {
                        backgroundColor: selected
                          ? theme.colors.primary
                          : inactiveChipBg,
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.modeIconWrap,
                        {
                          backgroundColor: selected
                            ? "rgba(255,255,255,0.18)"
                            : isDark
                              ? "rgba(255,255,255,0.08)"
                              : "rgba(0,0,0,0.06)",
                        },
                      ]}
                    >
                      <Icon
                        size={16}
                        color={
                          selected
                            ? theme.colors.primaryForeground
                            : theme.colors.foreground
                        }
                      />
                    </View>
                    <View style={styles.modeCopy}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: theme.fontFamily.semibold,
                          color: selected
                            ? theme.colors.primaryForeground
                            : theme.colors.foreground,
                        }}
                      >
                        {option.label}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 11,
                          fontFamily: theme.fontFamily.regular,
                          color: selected
                            ? theme.colors.primaryForeground
                            : theme.colors.mutedForeground,
                          opacity: selected ? 0.9 : 1,
                        }}
                      >
                        {option.hint}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Form Fields */}
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {mode !== "adjust" ? (
                <View style={styles.fieldBlock}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.colors.foreground },
                    ]}
                  >
                    {mode === "deposit"
                      ? "Source Bank Account"
                      : "Destination Bank Account"}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.accountRow}
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
                                : inactiveChipBg,
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
                              fontFamily: isSelected
                                ? theme.fontFamily.bold
                                : theme.fontFamily.medium,
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
              ) : (
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
                        fontFamily: theme.fontFamily.regular,
                      }}
                    >
                      This changes your available investment cash. It records a
                      separate correction entry and does not alter any holding or
                      bank transfer.
                    </Text>
                  </View>

                  <View style={styles.fieldBlock}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: theme.colors.foreground },
                      ]}
                    >
                      Direction *
                    </Text>
                    <View style={styles.directionRow}>
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
                              styles.directionChip,
                              {
                                backgroundColor: isSelected
                                  ? theme.colors.primary
                                  : inactiveChipBg,
                                borderColor: isSelected
                                  ? theme.colors.primary
                                  : theme.colors.border,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontFamily: theme.fontFamily.semibold,
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

              <View style={styles.fieldBlock}>
                <Text
                  style={[styles.fieldLabel, { color: theme.colors.foreground }]}
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

              <View style={styles.fieldBlock}>
                <Text
                  style={[styles.fieldLabel, { color: theme.colors.foreground }]}
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
                <View style={styles.fieldBlock}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.colors.foreground },
                    ]}
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
                      fontFamily: theme.fontFamily.regular,
                    }}
                  >
                    Shown in your cash history so this correction can be
                    understood later.
                  </Text>
                </View>
              ) : (
                <View style={styles.fieldBlock}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.colors.foreground },
                    ]}
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

              {mode === "adjust" && adjustedPreview !== null ? (
                <View
                  style={[
                    styles.previewRow,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: inactiveChipBg,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: theme.typography.xs,
                      color: theme.colors.mutedForeground,
                      fontFamily: theme.fontFamily.semibold,
                    }}
                  >
                    Balance after adjustment
                  </Text>
                  <Amount
                    value={adjustedPreview}
                    currency={currency}
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: theme.colors.foreground,
                    }}
                  />
                </View>
              ) : null}
            </ScrollView>

            {/* Always-visible primary action — was previously scrolled off-screen */}
            <View style={styles.footer}>
              <Button
                onPress={handleSubmit}
                loading={loading}
                disabled={!canSubmit}
              >
                {submitLabel}
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  sheetAvoider: {
    width: "100%",
    maxHeight: "92%",
  },
  sheet: {
    width: "100%",
    maxHeight: "100%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderCurve: "continuous",
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    letterSpacing: -0.2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  historyLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 2,
  },
  modeList: {
    gap: 8,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
  },
  modeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  formScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  formContent: {
    gap: 14,
    paddingTop: 2,
    paddingBottom: 8,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  accountRow: {
    gap: 8,
    paddingVertical: 2,
  },
  accountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
  },
  warningBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
  },
  directionRow: {
    flexDirection: "row",
    gap: 8,
  },
  directionChip: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
    paddingHorizontal: 12,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
  },
  footer: {
    paddingTop: 4,
  },
});

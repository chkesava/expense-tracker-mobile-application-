import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { CheckCircle2, Trash2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAccounts } from "@/hooks/useAccounts";
import type { AddRepaymentInput } from "@/hooks/useBorrowings";
import { toast } from "@/lib/toast";
import type {
  Borrowing,
  BorrowingRepayment,
} from "@/shared/types/borrowing";
import {
  BORROWING_STATUS_LABELS,
  INTEREST_BASIS_LABELS,
  LENDER_TYPE_LABELS,
} from "@/shared/types/borrowing";
import {
  allocateRepayment,
  describeInterest,
  validateRepayment,
  type BorrowingSummary,
} from "@/shared/utils/borrowingMath";
import { isValidDateKey, todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface BorrowingDetailModalProps {
  visible: boolean;
  borrowing: Borrowing | null;
  summary: BorrowingSummary | null;
  repayments: BorrowingRepayment[];
  currency?: string;
  onClose: () => void;
  onAddRepayment: (input: AddRepaymentInput) => Promise<string | null>;
  onDeleteRepayment: (
    repaymentId: string,
    borrowingId: string
  ) => Promise<boolean>;
  onDeleteBorrowing: (id: string) => Promise<boolean>;
  startRepaying?: boolean;
}

export function BorrowingDetailModal({
  visible,
  borrowing,
  summary,
  repayments,
  currency,
  onClose,
  onAddRepayment,
  onDeleteRepayment,
  onDeleteBorrowing,
  startRepaying = false,
}: BorrowingDetailModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { accounts } = useAccounts();

  const [isRepaying, setIsRepaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [date, setDate] = useState(todayDateKey());
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setIsRepaying(false);
      setAmount("");
      setPaymentAccountId("");
      setDate(todayDateKey());
      setNote("");
      return;
    }
    if (startRepaying) setIsRepaying(true);
  }, [visible, startRepaying]);

  const numericAmount = Number(amount);

  const preview = useMemo(() => {
    if (!summary || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return null;
    }
    return allocateRepayment(numericAmount, summary);
  }, [summary, numericAmount]);

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((account) => map.set(account.id, account.name));
    return map;
  }, [accounts]);

  if (!borrowing || !summary) {
    return (
      <Modal isOpen={visible} onClose={onClose} title="Borrowing">
        <View />
      </Modal>
    );
  }

  const isSettled =
    summary.status === "FULLY_SETTLED" || summary.status === "CLOSED";

  const resetRepaymentForm = () => {
    setAmount("");
    setPaymentAccountId("");
    setDate(todayDateKey());
    setNote("");
    setIsRepaying(false);
  };

  const handleRepay = async () => {
    if (!borrowing.id) return;

    if (!isValidDateKey(date)) {
      toast.error("Repayment date must be YYYY-MM-DD");
      return;
    }

    const validation = validateRepayment(numericAmount, summary);
    if (!validation.ok) {
      toast.error(validation.error ?? "Invalid repayment");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await onAddRepayment({
        borrowingId: borrowing.id,
        amount: numericAmount,
        paymentAccountId: paymentAccountId || null,
        date,
        note: note.trim(),
      });
      if (created) resetRepaymentForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteBorrowing = () => {
    if (!borrowing.id) return;
    Alert.alert(
      "Delete borrowing?",
      "This removes the borrowing and all of its repayment records. Expenses and accounts are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void onDeleteBorrowing(borrowing.id as string);
          },
        },
      ]
    );
  };

  const confirmDeleteRepayment = (repaymentId: string) => {
    if (!borrowing.id) return;
    Alert.alert("Remove repayment?", "The outstanding balance will go back up.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void onDeleteRepayment(repaymentId, borrowing.id as string);
        },
      },
    ]);
  };

  const pillStyle = (isActive: boolean) => ({
    backgroundColor: isActive
      ? theme.colors.primary
      : isDark
        ? "rgba(255,255,255,0.06)"
        : "rgba(0,0,0,0.04)",
    borderColor: isActive ? theme.colors.primary : theme.colors.border,
  });

  const pillTextStyle = (isActive: boolean) => ({
    color: isActive ? theme.colors.primaryForeground : theme.colors.foreground,
    fontWeight: isActive ? ("700" as const) : ("500" as const),
  });

  const rows: { label: string; value: number; tone?: string }[] = [
    { label: "Principal borrowed", value: summary.principalAmount },
    { label: "Principal paid", value: summary.principalPaid },
    { label: "Outstanding principal", value: summary.outstandingPrincipal },
    { label: "Accrued interest", value: summary.interestAccrued },
  ];

  if (summary.interestPaid > 0) {
    rows.push({ label: "Interest paid", value: summary.interestPaid });
  }

  return (
    <Modal isOpen={visible} onClose={onClose} title={borrowing.lenderName}>
      <View style={styles.body}>
        <View style={styles.headerMeta}>
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            {LENDER_TYPE_LABELS[borrowing.lenderType]} ·{" "}
            {describeInterest(borrowing)}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            Borrowed on {borrowing.borrowedDate}
            {borrowing.dueDate ? ` · Due ${borrowing.dueDate}` : ""}
          </Text>
          {borrowing.interestType === "NONE" ? null : (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              {INTEREST_BASIS_LABELS[borrowing.interestBasis]}
            </Text>
          )}
          {borrowing.creditedAccountId ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              Credited to{" "}
              {accountNameById.get(borrowing.creditedAccountId) ?? "an account"}
            </Text>
          ) : null}
          {borrowing.note ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              {borrowing.note}
            </Text>
          ) : null}
        </View>

        {isSettled ? (
          <View
            style={[styles.settledBanner, { backgroundColor: "rgba(16,185,129,0.14)" }]}
          >
            <CheckCircle2 size={18} color="#10B981" />
            <View>
              <Text style={[styles.settledTitle, { color: "#10B981" }]}>
                Borrowing settled
              </Text>
              {summary.settledDate ? (
                <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
                  Settled on {summary.settledDate}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.breakdown}>
          {rows.map((row) => (
            <View key={row.label} style={styles.breakdownRow}>
              <Text
                style={[styles.rowLabel, { color: theme.colors.mutedForeground }]}
              >
                {row.label}
              </Text>
              <Amount
                value={row.value}
                currency={currency}
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: theme.colors.foreground,
                }}
              />
            </View>
          ))}

          <View
            style={[styles.totalRow, { borderTopColor: theme.colors.border }]}
          >
            <Text style={[styles.totalLabel, { color: theme.colors.foreground }]}>
              Total outstanding
            </Text>
            <Amount
              value={summary.totalOutstanding}
              currency={currency}
              style={{
                fontSize: 18,
                fontWeight: "900",
                color: theme.colors.foreground,
              }}
            />
          </View>

          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            Status: {BORROWING_STATUS_LABELS[summary.status]}
          </Text>
        </View>

        {isSettled ? null : isRepaying ? (
          <View style={styles.repayForm}>
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              Make Repayment
            </Text>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Repayment Amount
              </Text>
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder={`Up to ${summary.totalOutstanding}`}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Payment Account
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                <Pressable
                  onPress={() => setPaymentAccountId("")}
                  style={[styles.pill, pillStyle(paymentAccountId === "")]}
                >
                  <Text
                    style={[styles.pillText, pillTextStyle(paymentAccountId === "")]}
                  >
                    None
                  </Text>
                </Pressable>
                {accounts.map((account) => {
                  const isActive = paymentAccountId === account.id;
                  return (
                    <Pressable
                      key={account.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setPaymentAccountId(account.id);
                      }}
                      style={[styles.pill, pillStyle(isActive)]}
                    >
                      <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                        {account.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Date
              </Text>
              <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Note (optional)
              </Text>
              <Input
                value={note}
                onChangeText={setNote}
                placeholder="e.g. Partial settlement"
              />
            </View>

            {preview ? (
              <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
                Applies {preview.interestComponent} to interest and{" "}
                {preview.principalComponent} to principal.
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              <Button
                onPress={handleRepay}
                loading={isSubmitting}
                disabled={!amount || isSubmitting}
                style={{ flex: 1 }}
              >
                <Text
                  style={{ fontWeight: "800", color: theme.colors.primaryForeground }}
                >
                  Save Repayment
                </Text>
              </Button>
              <Button variant="outline" onPress={resetRepaymentForm}>
                <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
                  Cancel
                </Text>
              </Button>
            </View>
          </View>
        ) : (
          <Button onPress={() => setIsRepaying(true)}>
            <Text
              style={{ fontWeight: "800", color: theme.colors.primaryForeground }}
            >
              Make Repayment
            </Text>
          </Button>
        )}

        <View style={styles.group}>
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Repayment History
          </Text>

          {repayments.length === 0 ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              No repayments recorded yet.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {repayments.map((repayment) => (
                <View
                  key={repayment.id}
                  style={[
                    styles.historyRow,
                    { borderColor: theme.colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Amount
                      value={repayment.amount}
                      currency={currency}
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: theme.colors.foreground,
                      }}
                    />
                    <Text
                      style={[styles.meta, { color: theme.colors.mutedForeground }]}
                    >
                      {repayment.date}
                      {repayment.paymentAccountId
                        ? ` · ${accountNameById.get(repayment.paymentAccountId) ?? "Account"}`
                        : ""}
                      {repayment.interestComponent
                        ? ` · ${repayment.interestComponent} interest`
                        : ""}
                    </Text>
                    {repayment.note ? (
                      <Text
                        style={[styles.meta, { color: theme.colors.mutedForeground }]}
                      >
                        {repayment.note}
                      </Text>
                    ) : null}
                  </View>

                  <Pressable
                    onPress={() => confirmDeleteRepayment(repayment.id as string)}
                    hitSlop={8}
                    accessibilityLabel="Remove repayment"
                    accessibilityRole="button"
                  >
                    <Trash2 size={16} color={theme.colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <Button variant="outline" onPress={confirmDeleteBorrowing}>
          <Trash2 size={16} color={theme.colors.destructive} />
          <Text style={{ fontWeight: "700", color: theme.colors.destructive }}>
            Delete Borrowing
          </Text>
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 18,
  },
  headerMeta: {
    gap: 2,
  },
  meta: {
    fontSize: 11,
  },
  settledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  settledTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  breakdown: {
    gap: 8,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 12,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  repayForm: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  group: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    padding: 12,
  },
});

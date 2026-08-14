import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { toast } from "@/lib/toast";
import type { CreditCardBill } from "@/shared/types/creditCardBill";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

export type MarkBillPaidModalProps = {
  isOpen: boolean;
  onClose: () => void;
  bill: CreditCardBill | null;
  /** When true, also create an external AccountPayment. */
  createExternalPayment?: boolean;
};

/**
 * Mark as paid without silently inventing a bank transfer.
 * Default: updates bill settlement only.
 * Optional: records an external AccountPayment (no bank balance change).
 */
export function MarkBillPaidModal({
  isOpen,
  onClose,
  bill,
  createExternalPayment = false,
}: MarkBillPaidModalProps) {
  const { theme } = useTheme();
  const { markBillPaid } = useCreditCardBills();
  const { addExternalPayment } = useAccountPayments();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(formatDateKey(new Date()));
  const [recordExternal, setRecordExternal] = useState(createExternalPayment);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !bill) return;
    setAmount(String(bill.remainingAmount || bill.statementAmount));
    setPaymentDate(formatDateKey(new Date()));
    setRecordExternal(createExternalPayment);
  }, [isOpen, bill, createExternalPayment]);

  const explanation = useMemo(() => {
    if (recordExternal) {
      return "This will mark the bill paid and record an external payment (no bank account balance change). It will not create a fake bank transfer.";
    }
    return "This will mark the bill as paid in bill history only. No bank transaction will be created. Use Pay Bill if you want to move money from a bank account.";
  }, [recordExternal]);

  const handleSubmit = async () => {
    if (!bill) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      let paymentId: string | undefined;
      if (recordExternal) {
        const ok = await addExternalPayment(
          bill.accountId,
          parsed,
          paymentDate.trim(),
          `Bill ${bill.id} marked paid`
        );
        if (!ok) {
          toast.error("Failed to record external payment");
          return;
        }
      }
      const ok = await markBillPaid(bill.id, {
        amount: Math.max(parsed, bill.statementAmount),
        paymentDate: paymentDate.trim(),
        paymentId,
        recordPaymentOnlyOnBill: !recordExternal,
      });
      if (ok) {
        toast.success("Bill marked as paid");
        onClose();
      } else {
        toast.error("Failed to update bill");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark paid");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mark Bill as Paid">
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 20 }}>
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
          {explanation}
        </Text>
        <Input
          label="Amount *"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
        <Input
          label="Payment Date * (YYYY-MM-DD)"
          value={paymentDate}
          onChangeText={setPaymentDate}
          autoCapitalize="none"
        />
        <Button
          variant={recordExternal ? "primary" : "outline"}
          onPress={() => setRecordExternal((v) => !v)}
        >
          {recordExternal
            ? "Also record external payment: ON"
            : "Also record external payment: OFF"}
        </Button>
        <Button size="lg" onPress={() => void handleSubmit()} disabled={saving}>
          {saving ? "Saving…" : "Confirm Mark as Paid"}
        </Button>
      </ScrollView>
    </Modal>
  );
}

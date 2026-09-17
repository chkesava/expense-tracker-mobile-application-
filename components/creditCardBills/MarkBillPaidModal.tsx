import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { toast } from "@/lib/toast";
import { useSettings } from "@/providers/SettingsProvider";
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
  const { settings } = useSettings();
  const { markBillPaid, recordBillPayment } = useCreditCardBills();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(formatDateKey(new Date()));
  const [recordExternal, setRecordExternal] = useState(createExternalPayment);
  const [saving, setSaving] = useState(false);
  const paymentIdRef = useRef(newId());

  useEffect(() => {
    if (!isOpen || !bill) return;
    setAmount(String(bill.remainingAmount || bill.statementAmount));
    setPaymentDate(formatDateKey(new Date()));
    setRecordExternal(createExternalPayment);
    paymentIdRef.current = newId();
  }, [isOpen, bill, createExternalPayment]);

  const explanation = useMemo(() => {
    if (recordExternal) {
      return "This will mark the bill paid and record an external payment (no bank account balance change). It will not create a fake bank transfer.";
    }
    return "This will mark the bill as paid in bill history only. No bank transaction will be created. Use Pay Bill if you want to move money from a bank account.";
  }, [recordExternal]);

  const handleSubmit = async () => {
    if (saving) return;
    if (!bill) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      if (recordExternal) {
        const settleable = Math.max(
          0,
          Math.max(parsed, bill.statementAmount) - bill.amountPaid
        );
        const paymentId = await recordBillPayment({
          fromAccountId: "external",
          toAccountId: bill.accountId,
          amount: parsed,
          date: paymentDate.trim(),
          note: `Bill ${bill.id} marked paid`,
          sourceType: "external",
          paymentId: paymentIdRef.current,
          bill: {
            id: bill.id,
            statementAmount: bill.statementAmount,
            amountPaid: bill.amountPaid,
            dueDate: bill.dueDate,
            status: bill.status,
            settleable,
            timezone: settings.timezone,
          },
        });
        if (paymentId) {
          onClose();
        }
        return;
      }
      const ok = await markBillPaid(bill.id, {
        amount: Math.max(parsed, bill.statementAmount),
        paymentDate: paymentDate.trim(),
        recordPaymentOnlyOnBill: true,
      });
      if (ok) {
        toast.success("Bill marked as paid");
        onClose();
      } else {
        toast.error("Failed to update bill");
      }
    } catch (err) {
      logError("creditCardBill.markPaid", err);
      toast.error(friendlyErrorMessage(err, "Couldn't mark the bill as paid."));
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

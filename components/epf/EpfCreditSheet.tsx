import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RotateCcw, XCircle } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { appDialog } from "@/lib/appDialog";
import { epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import { epfCreditFormSchema } from "@/shared/features/epf/schemas";
import type { EpfContribution } from "@/shared/features/epf/types";
import { contributionStatusMeta } from "@/shared/features/epf/utils/contributions";
import { isReconciled } from "@/shared/features/epf/utils/lifecycle";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { fieldErrorsFromIssues } from "@/shared/utils/fieldErrors";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  row: EpfContribution | null;
  monthLabel: string;
  currency: string;
  onRecordCredit: (month: string, input: { amount: number; date: string }) => Promise<boolean>;
  onMarkMissed: (month: string, reason: string) => Promise<boolean>;
  onMarkReversed: (month: string, reason: string) => Promise<boolean>;
};

/**
 * Record what actually happened to a month — KAN-68.
 *
 * Everything here is user-asserted. The app cannot see an EPFO account, so
 * marking a month missed or reversed is a claim only a person can make, and
 * both are confirmed before they are written.
 */
export function EpfCreditSheet({
  isOpen,
  onClose,
  row,
  monthLabel,
  currency,
  onRecordCredit,
  onMarkMissed,
  onMarkReversed,
}: Props) {
  const { theme } = useTheme();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !row) return;
    setAmount(String(row.creditedAmount ?? row.epfCredit ?? ""));
    setDate(row.creditDate ?? epfTodayKey());
    setReason(row.statusReason ?? "");
    setErrors({});
  }, [isOpen, row]);

  if (!row) return null;

  const meta = contributionStatusMeta(row.status, row.source, isReconciled(row));
  const money = (value: number) => formatAmount(value, currency);

  const run = async (action: () => Promise<boolean>) => {
    setSaving(true);
    const ok = await action();
    setSaving(false);
    if (ok) onClose();
  };

  const handleRecord = () => {
    const parsed = epfCreditFormSchema.safeParse({
      amount: Number(amount),
      date,
      month: row.month,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    void run(() =>
      onRecordCredit(row.month, { amount: parsed.data.amount, date: parsed.data.date })
    );
  };

  const confirmMissed = () => {
    appDialog.alert(
      "Mark as missed",
      `Record that no EPF contribution reached your account for ${monthLabel}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark missed",
          style: "destructive",
          onPress: () => {
            void run(() => onMarkMissed(row.month, reason || "Not credited"));
          },
        },
      ]
    );
  };

  const confirmReversed = () => {
    appDialog.alert(
      "Mark as reversed",
      `Record that the ${monthLabel} credit was reversed? The original contribution is kept for audit.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark reversed",
          style: "destructive",
          onPress: () => {
            void run(() => onMarkReversed(row.month, reason || "Reversed"));
          },
        },
      ]
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={monthLabel}>
      <View style={styles.form}>
        <View style={[styles.statusBox, { backgroundColor: theme.colors.muted }]}>
          <Text style={[styles.statusLabel, { color: theme.colors.mutedForeground }]}>
            Current status
          </Text>
          <Text style={[styles.statusValue, { color: theme.colors.foreground }]}>
            {meta.label}
          </Text>
          <Text style={[styles.statusHint, { color: theme.colors.mutedForeground }]}>
            {meta.simulated
              ? `Projected ${money(row.epfCredit)} into EPF. Record the actual credit to confirm it.`
              : `Expected ${money(row.epfCredit)} into EPF.`}
            {row.expectedCreditFrom
              ? ` Due ${row.expectedCreditFrom} – ${row.expectedCreditTo}.`
              : ""}
          </Text>
        </View>

        <Input
          label="Amount actually credited"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          error={errors.amount}
          helperText="Less than expected marks the month partial."
        />

        <Input
          label="Credit date (YYYY-MM-DD)"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          error={errors.date}
        />

        <Input
          label="Note"
          value={reason}
          onChangeText={setReason}
          placeholder="Optional — used when marking missed or reversed"
          error={errors.reason}
        />

        <Button onPress={handleRecord} loading={saving}>
          Record credit
        </Button>

        <Pressable onPress={confirmMissed} disabled={saving} style={styles.actionRow}>
          <XCircle size={theme.iconSize.sm} color={theme.colors.destructive} />
          <Text style={[styles.actionText, { color: theme.colors.destructive }]}>
            Mark as missed
          </Text>
        </Pressable>

        {row.status === "credited" || row.status === "partial" ? (
          <Pressable onPress={confirmReversed} disabled={saving} style={styles.actionRow}>
            <RotateCcw size={theme.iconSize.sm} color={theme.colors.destructive} />
            <Text style={[styles.actionText, { color: theme.colors.destructive }]}>
              Mark as reversed
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14, paddingBottom: 12 },
  statusBox: { borderRadius: 12, padding: 12, gap: 2 },
  statusLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  statusValue: { fontSize: 16, fontWeight: "700" },
  statusHint: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  actionText: { fontSize: 14, fontWeight: "500" },
});

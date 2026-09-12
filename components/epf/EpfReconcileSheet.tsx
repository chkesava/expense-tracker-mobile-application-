import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import { epfReconciliationFormSchema } from "@/shared/features/epf/schemas";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import {
  calculateVariance,
  validateReconciliation,
  type EpfReconciliationInput,
} from "@/shared/features/epf/utils/reconciliation";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { fieldErrorsFromIssues } from "@/shared/utils/fieldErrors";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  establishment: EpfEstablishment;
  calculatedBalance: number;
  currency: string;
  onSubmit: (input: EpfReconciliationInput) => Promise<boolean>;
};

/**
 * Record the balance EPFO actually shows — KAN-70.
 *
 * The variance is shown before confirming, so the size of the correction is
 * never a surprise. Contribution history is untouched: the difference becomes a
 * labelled adjustment.
 */
export function EpfReconcileSheet({
  isOpen,
  onClose,
  establishment,
  calculatedBalance,
  currency,
  onSubmit,
}: Props) {
  const { theme } = useTheme();

  const [actualBalance, setActualBalance] = useState("");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActualBalance("");
    setDate(epfTodayKey());
    setReference("");
    setNotes("");
    setErrors({});
  }, [isOpen]);

  const money = (value: number) => formatAmount(value, currency);
  const parsed = Number(actualBalance);
  const hasAmount = actualBalance !== "" && Number.isFinite(parsed);
  const variance = useMemo(
    () => (hasAmount ? calculateVariance(parsed, calculatedBalance) : 0),
    [hasAmount, parsed, calculatedBalance]
  );

  const handleSubmit = async () => {
    const result = epfReconciliationFormSchema.safeParse({
      actualBalance: parsed,
      date,
      reference,
      notes,
    });
    if (!result.success) {
      setErrors(fieldErrorsFromIssues(result.error.issues));
      return;
    }

    const input: EpfReconciliationInput = {
      establishmentId: establishment.id,
      date: result.data.date,
      actualBalance: result.data.actualBalance,
      calculatedBalance,
      reference: result.data.reference || undefined,
      notes: result.data.notes || undefined,
    };

    const issues = validateReconciliation(input, {
      knownEstablishmentIds: [establishment.id],
      todayKey: epfTodayKey(),
    });
    if (issues.length > 0) {
      setErrors(fieldErrorsFromIssues(issues));
      return;
    }

    setSaving(true);
    const ok = await onSubmit(input);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reconcile with EPFO">
      <View style={styles.form}>
        <View style={[styles.compare, { backgroundColor: theme.colors.muted }]}>
          <Text style={[styles.compareLabel, { color: theme.colors.mutedForeground }]}>
            Spendly calculates
          </Text>
          <Text style={[styles.compareValue, { color: theme.colors.foreground }]}>
            {money(calculatedBalance)}
          </Text>
        </View>

        <Input
          label="Balance shown by EPFO"
          value={actualBalance}
          onChangeText={setActualBalance}
          keyboardType="numeric"
          error={errors.actualBalance}
          helperText="From your passbook or the EPFO portal."
        />

        {hasAmount ? (
          <View
            style={[
              styles.variance,
              {
                borderColor:
                  variance === 0 ? theme.colors.success : theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.varianceLabel, { color: theme.colors.mutedForeground }]}>
              {variance === 0 ? "They agree" : "Difference"}
            </Text>
            {variance !== 0 ? (
              <>
                <Text
                  style={[
                    styles.varianceValue,
                    {
                      color:
                        variance > 0 ? theme.colors.success : theme.colors.destructive,
                    },
                  ]}
                >
                  {variance > 0 ? "+" : "−"}
                  {money(Math.abs(variance))}
                </Text>
                <Text style={[styles.varianceHint, { color: theme.colors.mutedForeground }]}>
                  Recorded as an adjustment so your balance matches EPFO. Your monthly
                  contribution history is not changed.
                </Text>
              </>
            ) : null}
          </View>
        ) : null}

        <Input
          label="Date observed (YYYY-MM-DD)"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          error={errors.date}
        />

        <Input
          label="Reference"
          value={reference}
          onChangeText={setReference}
          placeholder="Passbook or statement reference"
          error={errors.reference}
        />

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          error={errors.notes}
          multiline
        />

        <Button onPress={handleSubmit} loading={saving} disabled={!hasAmount}>
          Record balance
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14, paddingBottom: 12 },
  compare: { borderRadius: 12, padding: 12, gap: 2 },
  compareLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  compareValue: { fontSize: 20, fontWeight: "700" },
  variance: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 2,
  },
  varianceLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  varianceValue: { fontSize: 20, fontWeight: "700" },
  varianceHint: { fontSize: 12, lineHeight: 18, marginTop: 4 },
});

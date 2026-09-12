import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowRight } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { EpfTransferInput } from "@/hooks/useEpfTransfers";
import { epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import { epfTransferFormSchema } from "@/shared/features/epf/schemas";
import type {
  EpfContribution,
  EpfEstablishment,
  EpfInterestEntry,
  EpfReconciliation,
  EpfTransfer,
} from "@/shared/features/epf/types";
import { transferableBalance, validateTransfer } from "@/shared/features/epf/utils/transfers";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  establishments: EpfEstablishment[];
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  interestEntries: EpfInterestEntry[];
  adjustments: EpfReconciliation[];
  currency: string;
  /** Preselected source, when opened from an establishment. */
  defaultSourceId?: string;
  onSubmit: (input: EpfTransferInput) => Promise<string | null>;
};

/**
 * Record a transfer between two employers — KAN-69.
 *
 * The summary line is the point of this form: source balance → amount →
 * destination impact, so the consequence is visible before confirming.
 */
export function EpfTransferFormModal({
  isOpen,
  onClose,
  establishments,
  contributions,
  transfers,
  interestEntries,
  adjustments,
  currency,
  defaultSourceId,
  onSubmit,
}: Props) {
  const { theme } = useTheme();

  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSourceId(defaultSourceId ?? "");
    setDestinationId("");
    setAmount("");
    setDate(epfTodayKey());
    setReference("");
    setAdjustmentReason("");
    setErrors({});
  }, [isOpen, defaultSourceId]);

  const money = (value: number) => formatAmount(value, currency);

  const sourceBalance = useMemo(() => {
    if (!sourceId) return 0;
    return transferableBalance({
      contributions,
      transfers,
      establishmentId: sourceId,
      interestEntries,
      adjustments,
    });
  }, [sourceId, contributions, transfers, interestEntries, adjustments]);

  const parsedAmount = Number(amount) || 0;

  /** Live issues from the same guard the write path uses. */
  const issues = useMemo(() => {
    if (!sourceId || !destinationId) return [];
    return validateTransfer(
      {
        sourceEstablishmentId: sourceId,
        destinationEstablishmentId: destinationId,
        amount: parsedAmount,
        date,
        adjustmentReason: adjustmentReason || undefined,
      },
      {
        knownEstablishmentIds: establishments.map((item) => item.id),
        availableBalance: sourceBalance,
        todayKey: epfTodayKey(),
      }
    );
  }, [
    sourceId,
    destinationId,
    parsedAmount,
    date,
    adjustmentReason,
    establishments,
    sourceBalance,
  ]);

  const needsAdjustmentReason = issues.some((issue) => issue.code === "exceeds_balance");

  const handleSubmit = async () => {
    const parsed = epfTransferFormSchema.safeParse({
      sourceEstablishmentId: sourceId,
      destinationEstablishmentId: destinationId,
      amount: parsedAmount,
      date,
      reference,
      adjustmentReason,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0].toString()] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (issues.some((issue) => issue.severity === "error")) {
      const fieldErrors: Record<string, string> = {};
      issues.forEach((issue) => {
        if (issue.field) fieldErrors[issue.field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    const id = await onSubmit({
      sourceEstablishmentId: parsed.data.sourceEstablishmentId,
      destinationEstablishmentId: parsed.data.destinationEstablishmentId,
      amount: parsed.data.amount,
      date: parsed.data.date,
      reference: parsed.data.reference || undefined,
      adjustmentReason: parsed.data.adjustmentReason || undefined,
    });
    setSaving(false);
    if (id) onClose();
  };

  const picker = (
    label: string,
    selected: string,
    onSelect: (id: string) => void,
    excludeId: string,
    error?: string
  ) => (
    <View style={styles.pickerBlock}>
      <Text style={[styles.pickerLabel, { color: theme.colors.foreground }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
        {establishments
          .filter((item) => item.id !== excludeId)
          .map((item) => {
            const active = selected === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.colors.primary + "1A" : theme.colors.muted,
                    borderColor: active ? theme.colors.primary : "transparent",
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={item.employerName}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? theme.colors.primary : theme.colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {item.employerName}
                </Text>
              </Pressable>
            );
          })}
      </ScrollView>
      {error ? (
        <Text style={[styles.error, { color: theme.colors.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer EPF balance">
      <View style={styles.form}>
        {picker("From", sourceId, setSourceId, destinationId, errors.sourceEstablishmentId)}
        {picker(
          "To",
          destinationId,
          setDestinationId,
          sourceId,
          errors.destinationEstablishmentId
        )}

        {sourceId ? (
          <View style={[styles.summary, { backgroundColor: theme.colors.muted }]}>
            <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
              Available at source
            </Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryValue, { color: theme.colors.foreground }]}>
                {money(sourceBalance)}
              </Text>
              {parsedAmount > 0 ? (
                <>
                  <ArrowRight size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
                  <Text style={[styles.summaryValue, { color: theme.colors.foreground }]}>
                    {money(Math.max(0, sourceBalance - parsedAmount))}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        <Input
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          error={errors.amount}
        />

        <Input
          label="Transfer date (YYYY-MM-DD)"
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
          placeholder="EPFO claim number"
          error={errors.reference}
        />

        {needsAdjustmentReason ? (
          <Input
            label="Reason for exceeding the balance *"
            value={adjustmentReason}
            onChangeText={setAdjustmentReason}
            placeholder="e.g. EPFO statement shows more than Spendly projected"
            error={errors.amount}
            helperText="Recorded as an adjustment so the difference stays visible."
          />
        ) : null}

        <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
          Recorded in Spendly only. File the actual transfer with EPFO, then confirm it here
          once it lands.
        </Text>

        <Button onPress={handleSubmit} loading={saving}>
          Record transfer
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14, paddingBottom: 12 },
  pickerBlock: { gap: 6 },
  pickerLabel: { fontSize: 13, fontWeight: "600" },
  pickerRow: { flexGrow: 0 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    maxWidth: 200,
  },
  chipText: { fontSize: 13, fontWeight: "500" },
  summary: { borderRadius: 12, padding: 12, gap: 4 },
  summaryLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryValue: { fontSize: 18, fontWeight: "700" },
  error: { fontSize: 12 },
  note: { fontSize: 12, lineHeight: 18 },
});

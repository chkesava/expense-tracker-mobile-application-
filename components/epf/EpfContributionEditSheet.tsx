import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RotateCcw, Trash2 } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { appDialog } from "@/lib/appDialog";
import { epfContributionRowFormSchema } from "@/shared/features/epf/schemas";
import type { EpfBackfillRow } from "@/shared/features/epf/types";
import { computeEpfContribution } from "@/shared/features/epf/utils/contributions";
import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  row: EpfBackfillRow | null;
  monthLabel: string;
  onApply: (row: EpfBackfillRow) => void;
  onRemove: (month: string) => void;
};

const numeric = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Per-month editor — the override path.
 *
 * Everything the ticket requires editable lives here rather than on the list
 * row, which keeps the virtualized list free of controlled inputs.
 */
export function EpfContributionEditSheet({
  isOpen,
  onClose,
  row,
  monthLabel,
  onApply,
  onRemove,
}: Props) {
  const { theme } = useTheme();

  const [wage, setWage] = useState("");
  const [employeeShare, setEmployeeShare] = useState("");
  const [employerShare, setEmployerShare] = useState("");
  const [epsShare, setEpsShare] = useState("");
  const [employerEpfShare, setEmployerEpfShare] = useState("");
  const [creditDate, setCreditDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [zeroReason, setZeroReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !row) return;
    setWage(String(row.wage || ""));
    setEmployeeShare(String(row.employeeShare || 0));
    setEmployerShare(String(row.employerShare || 0));
    setEpsShare(String(row.epsShare || 0));
    setEmployerEpfShare(String(row.employerEpfShare || 0));
    setCreditDate(row.creditDate ?? "");
    setReference(row.reference ?? "");
    setNotes(row.notes ?? "");
    setZeroReason(row.zeroReason ?? "");
    setErrors({});
  }, [isOpen, row]);

  if (!row) return null;

  /** Discard hand-edits and fall back to the statutory split for the wage. */
  const recomputeFromWage = () => {
    const computed = computeEpfContribution({
      wage: numeric(wage),
      month: row.month,
      epsEligible: row.epsEligible,
    });
    setEmployeeShare(String(computed.employeeShare));
    setEmployerShare(String(computed.employerShare));
    setEpsShare(String(computed.epsShare));
    setEmployerEpfShare(String(computed.employerEpfShare));
    setErrors({});
  };

  const handleApply = () => {
    const parsed = epfContributionRowFormSchema.safeParse({
      month: row.month,
      wage: numeric(wage),
      employeeShare: numeric(employeeShare),
      employerShare: numeric(employerShare),
      epsShare: numeric(epsShare),
      employerEpfShare: numeric(employerEpfShare),
      creditDate,
      reference,
      notes,
      zeroReason,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0].toString()] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const computed = computeEpfContribution({
      wage: parsed.data.wage ?? 0,
      month: row.month,
      epsEligible: row.epsEligible,
    });
    const overridden =
      parsed.data.employeeShare !== computed.employeeShare ||
      parsed.data.employerShare !== computed.employerShare ||
      parsed.data.epsShare !== computed.epsShare;

    onApply({
      ...row,
      wage: parsed.data.wage ?? 0,
      employeeShare: parsed.data.employeeShare,
      employerShare: parsed.data.employerShare,
      epsShare: parsed.data.epsShare,
      employerEpfShare: parsed.data.employerEpfShare,
      totalContribution: parsed.data.employeeShare + parsed.data.employerShare,
      epfCredit: parsed.data.employeeShare + parsed.data.employerEpfShare,
      overridden: overridden || undefined,
      creditDate: parsed.data.creditDate || undefined,
      reference: parsed.data.reference || undefined,
      notes: parsed.data.notes || undefined,
      zeroReason: parsed.data.zeroReason || undefined,
    });
    onClose();
  };

  const confirmRemove = () => {
    appDialog.alert(
      "Remove this month",
      `Remove the ${monthLabel} contribution? You can add it again later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            onRemove(row.month);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={monthLabel}>
      <View style={styles.form}>
        <Input
          label="EPF wage (basic + DA)"
          value={wage}
          onChangeText={setWage}
          keyboardType="numeric"
          error={errors.wage}
          helperText="Used to recompute the split below."
        />

        <Pressable onPress={recomputeFromWage} style={styles.recompute}>
          <RotateCcw size={theme.iconSize.sm} color={theme.colors.primary} />
          <Text style={[styles.recomputeText, { color: theme.colors.primary }]}>
            Recompute from wage
          </Text>
        </Pressable>

        <Input
          label="Your contribution"
          value={employeeShare}
          onChangeText={setEmployeeShare}
          keyboardType="numeric"
          error={errors.employeeShare}
        />
        <Input
          label="Employer contribution"
          value={employerShare}
          onChangeText={setEmployerShare}
          keyboardType="numeric"
          error={errors.employerShare}
        />
        <Input
          label="Pension (EPS) share"
          value={epsShare}
          onChangeText={setEpsShare}
          keyboardType="numeric"
          error={errors.epsShare}
          helperText="Diverted to pension — not added to the EPF balance."
        />
        <Input
          label="Employer share to EPF"
          value={employerEpfShare}
          onChangeText={setEmployerEpfShare}
          keyboardType="numeric"
          error={errors.employerEpfShare}
        />

        <Input
          label="Credit date (YYYY-MM-DD)"
          value={creditDate}
          onChangeText={setCreditDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          error={errors.creditDate}
        />
        <Input
          label="Reference"
          value={reference}
          onChangeText={setReference}
          placeholder="Passbook or challan reference"
          error={errors.reference}
        />
        <Input
          label="Reason for a zero month"
          value={zeroReason}
          onChangeText={setZeroReason}
          placeholder="e.g. loss of pay"
          error={errors.zeroReason}
        />
        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          error={errors.notes}
          multiline
        />

        {row.rulesVersion ? (
          <Text style={[styles.rulesNote, { color: theme.colors.mutedForeground }]}>
            Computed using the {row.rulesVersion} contribution rules.
          </Text>
        ) : null}

        <Button onPress={handleApply}>Apply</Button>

        {row.persisted ? (
          <Pressable onPress={confirmRemove} style={styles.removeRow}>
            <Trash2 size={theme.iconSize.sm} color={theme.colors.destructive} />
            <Text style={[styles.removeText, { color: theme.colors.destructive }]}>
              Remove this month
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
    paddingBottom: 12,
  },
  recompute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  recomputeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  rulesNote: {
    fontSize: 12,
  },
  removeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  removeText: {
    fontSize: 14,
    fontWeight: "500",
  },
});

import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { appDialog } from "@/lib/appDialog";
import { epfWageChangeFormSchema } from "@/shared/features/epf/schemas";
import type {
  EpfContribution,
  EpfEstablishment,
  EpfWageHistoryEntry,
} from "@/shared/features/epf/types";
import {
  previewWageChange,
  validateWageChange,
  wageChangeNeedsConfirmation,
  wageForMonth,
} from "@/shared/features/epf/utils/wageHistory";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { fieldErrorsFromIssues } from "@/shared/utils/fieldErrors";
import { monthLabel } from "@/shared/utils/monthLabel";
import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  establishment: EpfEstablishment;
  currentMonth: string;
  currency: string;
  history: EpfWageHistoryEntry[];
  /** `wageForProjection(contributions)` — the wage in force before any history entry. */
  fallbackWage: number;
  contributions: EpfContribution[];
  onSave: (
    entry: Omit<EpfWageHistoryEntry, "id" | "createdAtMs" | "updatedAtMs">
  ) => Promise<boolean>;
};

const numeric = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Record a salary/EPF-wage change with an effective month — SPENDLY-389.
 *
 * Previous months are never touched here: this only ever writes a new
 * `epfWageHistory` entry. The scheduler (`planScheduledContributions`) picks
 * it up from its `effectiveFromMonth` onward the next time it runs — for
 * still-simulated/draft months that is automatic and silent, which is why
 * this sheet only warns before saving when the chosen month already holds a
 * hand-entered, confirmed or credited contribution that will *not* move.
 */
export function EpfWageChangeSheet({
  isOpen,
  onClose,
  establishment,
  currentMonth,
  currency,
  history,
  fallbackWage,
  contributions,
  onSave,
}: Props) {
  const { theme } = useTheme();
  const [effectiveFromMonth, setEffectiveFromMonth] = useState(currentMonth);
  const [wage, setWage] = useState("");
  const [epsEligible, setEpsEligible] = useState(establishment.epsMember !== false);
  const [showOverrides, setShowOverrides] = useState(false);
  const [employeeShareOverride, setEmployeeShareOverride] = useState("");
  const [employerShareOverride, setEmployerShareOverride] = useState("");
  const [epsShareOverride, setEpsShareOverride] = useState("");
  const [employerEpfShareOverride, setEmployerEpfShareOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEffectiveFromMonth(currentMonth);
    setWage("");
    setEpsEligible(establishment.epsMember !== false);
    setShowOverrides(false);
    setEmployeeShareOverride("");
    setEmployerShareOverride("");
    setEpsShareOverride("");
    setEmployerEpfShareOverride("");
    setNotes("");
    setErrors({});
  }, [isOpen, currentMonth, establishment.epsMember]);

  const money = (value: number) => formatAmount(value, currency);
  const currentWage = wageForMonth(history, currentMonth, fallbackWage);

  const preview = useMemo(
    () =>
      previewWageChange({
        wage: numeric(wage),
        effectiveFromMonth,
        epsEligible,
      }),
    [wage, effectiveFromMonth, epsEligible]
  );

  const effectiveEmployeeShare = employeeShareOverride
    ? numeric(employeeShareOverride)
    : preview.employeeShare;
  const effectiveEmployerShare = employerShareOverride
    ? numeric(employerShareOverride)
    : preview.employerShare;
  const effectiveEpsShare = epsShareOverride ? numeric(epsShareOverride) : preview.epsShare;
  const effectiveEmployerEpfShare = employerEpfShareOverride
    ? numeric(employerEpfShareOverride)
    : preview.employerEpfShare;
  const effectiveCredit = effectiveEmployeeShare + effectiveEmployerEpfShare;

  const existingAtEffectiveMonth = useMemo(
    () => contributions.find((row) => row.month === effectiveFromMonth),
    [contributions, effectiveFromMonth]
  );

  const save = async () => {
    const parsed = epfWageChangeFormSchema.safeParse({
      effectiveFromMonth,
      wage: wage || "0",
      epsEligible,
      employeeShareOverride: employeeShareOverride || undefined,
      employerShareOverride: employerShareOverride || undefined,
      epsShareOverride: epsShareOverride || undefined,
      employerEpfShareOverride: employerEpfShareOverride || undefined,
      notes,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }

    const entry: Omit<EpfWageHistoryEntry, "id" | "createdAtMs" | "updatedAtMs"> = {
      establishmentId: establishment.id,
      effectiveFromMonth: parsed.data.effectiveFromMonth,
      wage: parsed.data.wage,
      epsEligible: parsed.data.epsEligible,
      employeeShareOverride: parsed.data.employeeShareOverride,
      employerShareOverride: parsed.data.employerShareOverride,
      epsShareOverride: parsed.data.epsShareOverride,
      employerEpfShareOverride: parsed.data.employerEpfShareOverride,
      rulesVersion: preview.rulesVersion,
      notes: parsed.data.notes || undefined,
    };

    const contextIssues = validateWageChange(entry, history);
    if (contextIssues.length > 0) {
      const byField: Record<string, string> = {};
      for (const issue of contextIssues) byField[issue.field ?? "effectiveFromMonth"] = issue.message;
      setErrors(byField);
      return;
    }

    const commit = async () => {
      setSaving(true);
      const ok = await onSave(entry);
      setSaving(false);
      if (ok) onClose();
    };

    if (wageChangeNeedsConfirmation(existingAtEffectiveMonth)) {
      appDialog.alert(
        "Keep the recorded month as is?",
        `${monthLabel(effectiveFromMonth)} already has a recorded contribution. It will not change — the new wage only applies to months that are still a projection. Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => void commit() },
        ]
      );
      return;
    }

    void commit();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change EPF wage">
      <View style={styles.form}>
        <View style={[styles.statusBox, { backgroundColor: theme.colors.muted }]}>
          <Text style={[styles.statusLabel, { color: theme.colors.mutedForeground }]}>
            Current EPF wage
          </Text>
          <Text style={[styles.statusValue, { color: theme.colors.foreground }]}>
            {currentWage > 0 ? money(currentWage) : "Not recorded yet"}
          </Text>
          <Text style={[styles.statusHint, { color: theme.colors.mutedForeground }]}>
            Months before the effective month below keep their existing contribution values.
          </Text>
        </View>

        <Input
          label="New EPF wage (basic + DA)"
          value={wage}
          onChangeText={setWage}
          keyboardType="numeric"
          error={errors.wage}
          helperText="Enter the EPF wage shown on your payslip, not gross salary."
        />

        <Input
          label="Effective from month (YYYY-MM)"
          value={effectiveFromMonth}
          onChangeText={setEffectiveFromMonth}
          placeholder="YYYY-MM"
          autoCapitalize="none"
          error={errors.effectiveFromMonth}
          helperText="The first month this wage applies to."
        />

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.colors.foreground }]}>
            Pension (EPS) member
          </Text>
          <Switch value={epsEligible} onValueChange={setEpsEligible} />
        </View>

        <View style={[styles.previewBox, { borderColor: theme.colors.border }]}>
          <Text style={[styles.previewTitle, { color: theme.colors.foreground }]}>
            Calculated for {monthLabel(effectiveFromMonth)}
          </Text>
          <PreviewRow label="Your contribution" value={money(effectiveEmployeeShare)} theme={theme} />
          <PreviewRow label="Employer contribution" value={money(effectiveEmployerShare)} theme={theme} />
          <PreviewRow label="Pension (EPS) share" value={money(effectiveEpsShare)} theme={theme} />
          <PreviewRow
            label="Employer share to EPF"
            value={money(effectiveEmployerEpfShare)}
            theme={theme}
          />
          <PreviewRow label="EPF credit" value={money(effectiveCredit)} theme={theme} emphasis />
        </View>

        <Button variant="outline" size="sm" onPress={() => setShowOverrides((v) => !v)}>
          <Text style={{ color: theme.colors.primary }}>
            {showOverrides ? "Hide manual overrides" : "Actual payroll differs? Override amounts"}
          </Text>
        </Button>

        {showOverrides ? (
          <>
            <Input
              label="Your contribution (override)"
              value={employeeShareOverride}
              onChangeText={setEmployeeShareOverride}
              keyboardType="numeric"
              placeholder={String(preview.employeeShare)}
              error={errors.employeeShareOverride}
            />
            <Input
              label="Employer contribution (override)"
              value={employerShareOverride}
              onChangeText={setEmployerShareOverride}
              keyboardType="numeric"
              placeholder={String(preview.employerShare)}
              error={errors.employerShareOverride}
            />
            <Input
              label="Pension (EPS) share (override)"
              value={epsShareOverride}
              onChangeText={setEpsShareOverride}
              keyboardType="numeric"
              placeholder={String(preview.epsShare)}
              error={errors.epsShareOverride}
            />
            <Input
              label="Employer share to EPF (override)"
              value={employerEpfShareOverride}
              onChangeText={setEmployerEpfShareOverride}
              keyboardType="numeric"
              placeholder={String(preview.employerEpfShare)}
              error={errors.employerEpfShareOverride}
            />
          </>
        ) : null}

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          multiline
          error={errors.notes}
        />

        <Button onPress={() => void save()} loading={saving}>
          Save wage change
        </Button>
      </View>
    </Modal>
  );
}

function PreviewRow({
  label,
  value,
  theme,
  emphasis,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>["theme"];
  emphasis?: boolean;
}) {
  return (
    <View style={styles.previewRow}>
      <Text style={[styles.previewLabel, { color: theme.colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[
          styles.previewValue,
          { color: theme.colors.foreground, fontWeight: emphasis ? "700" : "500" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14, paddingBottom: 12 },
  statusBox: { borderRadius: 12, padding: 12, gap: 2 },
  statusLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  statusValue: { fontSize: 16, fontWeight: "700" },
  statusHint: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { fontSize: 14, fontWeight: "500" },
  previewBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 6 },
  previewTitle: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  previewRow: { flexDirection: "row", justifyContent: "space-between" },
  previewLabel: { fontSize: 13 },
  previewValue: { fontSize: 13 },
});

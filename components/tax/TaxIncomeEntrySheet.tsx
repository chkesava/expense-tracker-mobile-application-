import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DateField } from "@/components/common/DateField";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import type { FinancialYearKey, TaxEntry, TaxEntryOf, TaxIncomeFields } from "@/shared/features/tax/types";
import { categoryLabel } from "@/shared/features/tax/utils/incomePresentation";
import {
  duplicateIncomeEntry,
  EMPTY_INCOME_ENTRY_FORM,
  INCOME_ENTRY_CATEGORIES,
  incomeFormFromEntry,
  incomeFormToFields,
  type IncomeEntryForm,
} from "@/shared/features/tax/utils/incomeEntryForm";
import { taxIssueMessage } from "@/shared/features/tax/utils/issueMessages";
import { financialYearDateBounds, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Add or correct an income the user enters (SPENDLY-290): rent received in
 * cash, an interest certificate total, gross salary without a Form 16. It is
 * a tax record only: it never becomes a Spendly income or moves a balance.
 */
export function TaxIncomeEntrySheet({
  isOpen,
  fy,
  todayKey,
  editing,
  entries,
  saving,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  fy: FinancialYearKey;
  todayKey: string;
  /** The entry being corrected; `null` to add a new one. */
  editing: TaxEntryOf<"income"> | null;
  entries: readonly TaxEntry[];
  saving: boolean;
  onSave: (input: { id?: string; fields: TaxIncomeFields; note?: string; duplicateConfirmed?: boolean }) => Promise<boolean>;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [form, setForm] = useState<IncomeEntryForm>(EMPTY_INCOME_ENTRY_FORM);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(editing ? incomeFormFromEntry(editing) : EMPTY_INCOME_ENTRY_FORM);
    setShowErrors(false);
  }, [isOpen, editing]);

  const bounds = financialYearDateBounds(fy);
  const maxDate = bounds ? (bounds.endDate < todayKey ? bounds.endDate : todayKey) : undefined;
  const parsed = useMemo(() => incomeFormToFields(form, fy, todayKey), [form, fy, todayKey]);
  const duplicate = parsed.fields ? duplicateIncomeEntry(parsed.fields, fy, entries, editing?.id) : undefined;

  const submit = async () => {
    setShowErrors(true);
    if (!parsed.fields) return;
    const ok = await onSave({
      id: editing?.id,
      fields: parsed.fields,
      note: form.note.trim() || undefined,
      duplicateConfirmed: duplicate ? true : undefined,
    });
    if (ok) onClose();
  };

  const label = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };
  const helper = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? "Edit income" : "Add income"}
      density="compact"
      footer={
        <SheetActions
          primary={{
            // The duplicate warning shows as the user types, so one tap saves.
            label: duplicate ? "Save anyway" : "Save",
            onPress: () => void submit(),
            loading: saving,
            disabled: saving,
          }}
          secondary={{ label: "Cancel", onPress: onClose }}
        />
      }
    >
      <View style={{ gap: theme.space.lg }}>
        <Text style={helper}>
          For {taxYearLabel(fy)}. This is a tax record only: it doesn't add a Spendly income or change any balance.
        </Text>

        <View style={{ gap: theme.space.sm }}>
          <Text style={label}>Kind of income</Text>
          <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
            {INCOME_ENTRY_CATEGORIES.map((id) => (
              <Chip
                key={id}
                label={categoryLabel(id)}
                selected={form.category === id}
                onPress={() => setForm({ ...form, category: id })}
                appearance="outline"
                size="sm"
                accessibilityRole="radio"
              />
            ))}
          </View>
          {form.category === "salary" ? (
            <Text style={helper}>Enter gross salary (before tax and deductions), as on Form 16 or your salary slips.</Text>
          ) : null}
        </View>

        <Input
          label="Amount"
          value={form.amount}
          onChangeText={(amount) => setForm({ ...form, amount })}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <DateField
          label="Date (optional)"
          value={form.date}
          onChange={(date) => setForm({ ...form, date })}
          minDate={bounds?.startDate}
          maxDate={maxDate}
          clearable
          helperText="Leave empty for a yearly total"
        />
        <Input
          label="Paid by (optional)"
          value={form.payer}
          onChangeText={(payer) => setForm({ ...form, payer })}
          maxLength={120}
          placeholder="e.g. tenant, bank name"
        />
        <Input
          label="Note (optional)"
          value={form.note}
          onChangeText={(note) => setForm({ ...form, note })}
          maxLength={500}
        />

        {showErrors && parsed.issues.length > 0 ? (
          <View style={{ gap: 2 }} accessibilityLiveRegion="polite">
            {parsed.issues.map((issue) => (
              <Text key={`${issue.field}:${issue.code}`} style={{ color: theme.colors.destructive, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.medium }}>
                {taxIssueMessage(issue)}
              </Text>
            ))}
          </View>
        ) : null}

        {duplicate ? (
          <TaxNotice tone="warning">
            You already added the same income for this year. Save it again only if it is a different payment: both will be counted.
          </TaxNotice>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});

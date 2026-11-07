import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DateField } from "@/components/common/DateField";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { TaxDocumentAttachField } from "@/components/tax/TaxDocumentAttachField";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import type { FinancialYearKey, TaxDocument, TaxEntry } from "@/shared/features/tax/types";
import {
  duplicateTaxEntry,
  emptyEntryForm,
  entryFormLabels,
  entryFormToDraft,
  entryToForm,
  type EntryFormSpec,
  type EntryFormValues,
  type FormField,
} from "@/shared/features/tax/utils/entryForms";
import { taxIssueMessage } from "@/shared/features/tax/utils/issueMessages";
import type { TaxEntryDraft } from "@/shared/features/tax/utils/validation";
import { financialYearDateBounds, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One sheet for every spec-driven tax record (SPENDLY-291): Form 16, TDS
 * certificates, AIS/26AS lines, and the kinds later stories add. Values are
 * what the user reads off their documents; Spendly computes nothing here.
 */
export function TaxEntryFormSheet({
  spec,
  fy,
  todayKey,
  editing,
  entries,
  documents,
  documentsLoading,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  /** `null` closes the sheet. */
  spec: EntryFormSpec | null;
  fy: FinancialYearKey;
  todayKey: string;
  editing: TaxEntry | null;
  entries: readonly TaxEntry[];
  documents: readonly TaxDocument[];
  documentsLoading?: boolean;
  saving: boolean;
  onSave: (input: { id?: string; draft: TaxEntryDraft; duplicateConfirmed?: boolean; labels: Record<string, string> }) => Promise<boolean>;
  onDelete: (entry: TaxEntry) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [values, setValues] = useState<EntryFormValues>({});
  const [note, setNote] = useState("");
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!spec) return;
    setValues(editing ? entryToForm(spec, editing) : emptyEntryForm(spec));
    setNote(editing?.note ?? "");
    setDocumentIds(editing?.documentIds ? [...editing.documentIds] : []);
    setShowErrors(false);
  }, [spec, editing]);

  const labels = useMemo(() => (spec ? entryFormLabels(spec) : {}), [spec]);
  const parsed = useMemo(
    () => (spec ? entryFormToDraft(spec, values, fy, { note, documentIds }, todayKey) : { draft: null, issues: [] }),
    [spec, values, fy, note, documentIds, todayKey]
  );
  const duplicate = parsed.draft ? duplicateTaxEntry(parsed.draft, entries, editing?.id) : undefined;

  if (!spec) return null;
  const bounds = financialYearDateBounds(fy);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    setShowErrors(true);
    if (!parsed.draft) return;
    const ok = await onSave({ id: editing?.id, draft: parsed.draft, duplicateConfirmed: duplicate ? true : undefined, labels });
    if (ok) onClose();
  };

  const field = (f: FormField) => {
    const value = values[f.key] ?? "";
    if (f.type === "option") {
      return (
        <View key={f.key} style={{ gap: theme.space.sm }}>
          <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{f.label}</Text>
          <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
            {(f.options ?? []).map((o) => (
              <Chip
                key={o.id}
                label={o.label}
                selected={value === o.id}
                // An optional choice can be cleared by tapping it again.
                onPress={() => set(f.key, value === o.id && !f.required ? "" : o.id)}
                appearance="outline"
                size="sm"
                accessibilityRole="radio"
              />
            ))}
          </View>
        </View>
      );
    }
    if (f.type === "date") {
      return (
        <DateField
          key={f.key}
          label={f.label}
          value={value}
          onChange={(date) => set(f.key, date)}
          minDate={bounds?.startDate}
          maxDate={bounds?.endDate}
          clearable={!f.required}
          helperText={f.helper}
        />
      );
    }
    return (
      <Input
        key={f.key}
        label={f.label}
        value={value}
        onChangeText={(text) => set(f.key, text)}
        placeholder={f.placeholder}
        helperText={f.helper}
        keyboardType={f.type === "money" ? "decimal-pad" : "default"}
        autoCapitalize={f.type === "tan" || f.type === "section" ? "characters" : "sentences"}
        maxLength={f.type === "tan" ? 10 : f.type === "section" ? 24 : 120}
      />
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editing ? `Edit ${spec.title}` : `Add ${spec.title}`}
      density="compact"
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose }}
          primary={{ label: duplicate ? "Save anyway" : "Save", onPress: () => void submit(), loading: saving, disabled: saving }}
        />
      }
    >
      <View style={{ gap: theme.space.lg }}>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          For {taxYearLabel(fy)}. Enter the figures as printed; Spendly doesn't change them.
        </Text>
        {spec.fields.map(field)}
        <Input label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} />
        <TaxDocumentAttachField documents={documents} value={documentIds} onChange={setDocumentIds} loading={documentsLoading} />

        {showErrors && parsed.issues.length > 0 ? (
          <View style={{ gap: 2 }} accessibilityLiveRegion="polite">
            {parsed.issues.map((issue) => (
              <Text key={`${issue.field}:${issue.code}`} style={{ color: theme.colors.destructive, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.medium }}>
                {taxIssueMessage(issue, labels)}
              </Text>
            ))}
          </View>
        ) : null}
        {duplicate ? (
          <TaxNotice tone="warning">
            This looks like a {spec.title} you already added for this year. Save it again only if it's a different one: both
            will be counted.
          </TaxNotice>
        ) : null}
        {editing ? (
          <Button variant="ghost" size="sm" onPress={() => (onClose(), onDelete(editing))} accessibilityLabel={`Delete this ${spec.title}`}>
            Delete
          </Button>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});

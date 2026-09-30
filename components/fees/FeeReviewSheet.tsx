import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Info, Link2, WifiOff } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { FEE_TAXONOMY, feeTypeDef } from "@/shared/data/feeTaxonomy";
import type { FeeRecord, FeeReview, FeeRole } from "@/shared/types/fee";
import type { FeeClassificationInput } from "@/shared/utils/feeModel";
import {
  decisionFor,
  describeHistoryEntry,
  draftForRole,
  draftFromRecord,
  draftRemainder,
  draftToClassification,
  draftWithFeeType,
  draftWithGstIncluded,
  feeIssueMessage,
  feeLinkOptions,
  feeRecordTitle,
  feeRoleLabel,
  feeRolesFor,
  uncertainReasonText,
  type FeeReviewDraft,
} from "@/shared/utils/feeReviewForm";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";
import type { FeeReviewDecision } from "@/shared/types/fee";

export interface FeeReviewSubmit {
  record: FeeRecord;
  decision: FeeReviewDecision;
  classification: FeeClassificationInput;
  note: string;
}

export interface FeeReviewSheetProps {
  record: FeeRecord | null;
  review?: FeeReview;
  records: readonly FeeRecord[];
  currency: string;
  accountName?: string;
  online: boolean;
  saving: boolean;
  onSubmit: (submit: FeeReviewSubmit) => void;
  onClose: () => void;
}

/**
 * Review and correct one fee record (SPENDLY-315): confirm, "not a fee",
 * change type/subtype, split fee vs GST (vs principal), link or unlink the fee
 * a GST row / reversal belongs to, with the evidence and correction history.
 *
 * Presentational: validation and the confirm/correct decision come from
 * `feeReviewForm`; persistence is the caller's.
 */
export function FeeReviewSheet({
  record,
  review,
  records,
  currency,
  accountName,
  online,
  saving,
  onSubmit,
  onClose,
}: FeeReviewSheetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const [draft, setDraft] = useState<FeeReviewDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    setDraft(record ? draftFromRecord(record, review?.note ?? "") : null);
    setShowErrors(false);
  }, [record, review?.note]);

  const parsed = useMemo(() => (record && draft ? draftToClassification(draft, record) : null), [draft, record]);
  const linkOptions = useMemo(
    () => (record && draft ? feeLinkOptions(record, records, draft.role) : []),
    [draft, record, records]
  );

  if (!record || !draft) return <Modal isOpen={false} onClose={onClose}>{null}</Modal>;

  const amount = record.source.amount;
  const remainder = draftRemainder(draft, amount);
  const decision = parsed?.ok ? decisionFor(record, parsed.classification) : null;
  const typeDef = draft.feeType ? feeTypeDef(draft.feeType) : undefined;
  const showsType = draft.role === "fee" || draft.role === "reversal" || draft.role === "refund" || draft.role === "tax_on_fee";
  const showsLink = draft.role === "tax_on_fee" || draft.role === "reversal" || draft.role === "refund";
  const reason = record.status === "uncertain" ? uncertainReasonText(record.uncertainReason) : undefined;

  const submit = (forced?: "not_fee") => {
    if (forced === "not_fee") {
      const out = draftToClassification(draftForRole(draft, "not_fee", amount), record);
      if (out.ok) onSubmit({ record, decision: "not_fee", classification: out.classification, note: draft.note });
      return;
    }
    if (!parsed?.ok) {
      setShowErrors(true);
      return;
    }
    onSubmit({ record, decision: decisionFor(record, parsed.classification), classification: parsed.classification, note: draft.note });
  };

  const sectionTitle = (label: string) => (
    <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold }]}>
      {label}
    </Text>
  );

  const amountField = (key: "principal" | "fee" | "tax" | "interest", label: string) => (
    <Input
      key={key}
      label={label}
      value={draft[key]}
      onChangeText={(value) => setDraft({ ...draft, [key]: value })}
      keyboardType="decimal-pad"
      placeholder="0"
      containerStyle={styles.amountField}
      accessibilityLabel={`${label} amount`}
    />
  );

  return (
    <Modal isOpen onClose={onClose} title="Review fee" density="compact">
      <View style={{ gap: theme.space.lg }}>
        {/* What Spendly saw */}
        <View style={{ gap: theme.space.xs }}>
          <View style={styles.headerRow}>
            <Text style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.md }}>
              {feeRecordTitle(record)}
            </Text>
            <Amount value={amount} currency={currency} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.md }} />
          </View>
          {record.source.merchant ? (
            <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }}>
              {record.source.merchant}
            </Text>
          ) : null}
          <View style={[styles.headerRow, { gap: theme.space.sm }]}>
            <FeeStatusBadge status={record.status} />
            <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
              {[record.source.date, accountName, record.source.direction === "credit" ? "Money in" : "Money out"].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {reason ? (
            <View style={[styles.notice, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md, gap: theme.space.sm }]}>
              <Info size={16} color={theme.colors.warning} />
              <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                {reason}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Why */}
        {record.evidence.length > 0 ? (
          <View style={{ gap: theme.space.xs }}>
            {sectionTitle("Why Spendly thinks so")}
            {record.evidence.map((e, i) => (
              <Text key={`${e.ruleId}-${i}`} style={{ color: e.weight < 0 ? theme.colors.mutedForeground : theme.colors.foreground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                {e.weight < 0 ? "− " : "• "}
                {e.detail}
              </Text>
            ))}
            {record.provenance.origin === "rule" ? (
              <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                Confidence {Math.round(record.confidence * 100)}%
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* What it is */}
        <View style={{ gap: theme.space.sm }}>
          {sectionTitle("This transaction is")}
          <View style={[styles.wrap, { gap: theme.space.sm }]}>
            {feeRolesFor(record.source.direction).map((role: FeeRole) => (
              <Chip
                key={role}
                label={feeRoleLabel(role)}
                selected={draft.role === role}
                onPress={() => setDraft(draftForRole(draft, role, amount))}
                accessibilityRole="radio"
              />
            ))}
          </View>
        </View>

        {showsType ? (
          <View style={{ gap: theme.space.sm }}>
            {sectionTitle("Fee type")}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
              {FEE_TAXONOMY.map((def) => (
                <Chip
                  key={def.id}
                  label={def.label}
                  selected={draft.feeType === def.id}
                  onPress={() => setDraft(draftWithFeeType(draft, def.id))}
                  accessibilityRole="radio"
                  size="sm"
                />
              ))}
            </ScrollView>
            {draft.role === "fee" && typeDef && typeDef.subtypes.length > 0 ? (
              <View style={[styles.wrap, { gap: theme.space.sm }]}>
                {typeDef.subtypes.map((sub) => (
                  <Chip
                    key={sub.id}
                    label={sub.label}
                    size="sm"
                    appearance="outline"
                    selected={draft.subtype === sub.id}
                    onPress={() => setDraft({ ...draft, subtype: draft.subtype === sub.id ? undefined : sub.id })}
                    accessibilityRole="radio"
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {draft.role !== "not_fee" ? (
          <View style={{ gap: theme.space.sm }}>
            {sectionTitle("How the amount splits")}
            <View style={[styles.wrap, { gap: theme.space.sm }]}>
              {draft.role === "fee" ? amountField("principal", "Purchase") : null}
              {draft.role !== "tax_on_fee" && draft.role !== "interest" ? amountField("fee", "Fee") : null}
              {draft.role !== "interest" ? amountField("tax", "GST / tax") : null}
              {draft.role === "interest" || draft.role === "reversal" || draft.role === "refund" ? amountField("interest", "Interest") : null}
            </View>
            <View style={[styles.headerRow, { gap: theme.space.sm }]}>
              {draft.role === "fee" || draft.role === "reversal" || draft.role === "refund" ? (
                <Button variant="tonal" size="sm" onPress={() => setDraft(draftWithGstIncluded(draft))}>
                  GST 18% included
                </Button>
              ) : null}
              <Text style={{ flex: 1, textAlign: "right", fontSize: theme.typography.xs, fontFamily: theme.fontFamily.medium, color: remainder === 0 ? theme.colors.success : theme.colors.destructive }}>
                {remainder === null ? "Check the amounts" : remainder === 0 ? "Adds up" : `${remainder > 0 ? "Left" : "Over"}: ${formatAmount(Math.abs(remainder), currency)}`}
              </Text>
            </View>
          </View>
        ) : null}

        {showsLink ? (
          <View style={{ gap: theme.space.sm }}>
            {sectionTitle(draft.role === "tax_on_fee" ? "GST on which fee" : "Gives back which fee")}
            {linkOptions.length === 0 ? (
              <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                No confirmed fee nearby to link to.
              </Text>
            ) : null}
            <View style={[styles.wrap, { gap: theme.space.sm }]}>
              {draft.role !== "tax_on_fee" ? (
                <Chip label="Not linked" selected={draft.linkedKey === null} onPress={() => setDraft({ ...draft, linkedKey: null })} size="sm" appearance="outline" accessibilityRole="radio" />
              ) : null}
              {linkOptions.map((option) => (
                <Chip
                  key={option.key}
                  label={`${option.source.date} · ${formatAmount(option.source.amount, currency)}`}
                  icon={(color) => <Link2 size={14} color={color} />}
                  selected={draft.linkedKey === option.key}
                  onPress={() => setDraft({ ...draft, linkedKey: option.key })}
                  size="sm"
                  accessibilityRole="radio"
                  accessibilityLabel={`Link to ${feeRecordTitle(option)} of ${formatAmount(option.source.amount, currency)} on ${option.source.date}`}
                />
              ))}
            </View>
          </View>
        ) : null}

        <Input
          label="Note (optional)"
          value={draft.note}
          onChangeText={(note) => setDraft({ ...draft, note })}
          maxLength={500}
          placeholder="e.g. waived after I called the bank"
        />

        {showErrors && parsed && !parsed.ok ? (
          <View style={{ gap: 2 }} accessibilityLiveRegion="polite">
            {parsed.issues.map((issue) => (
              <Text key={issue} style={{ color: theme.colors.destructive, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.medium }}>
                {feeIssueMessage(issue)}
              </Text>
            ))}
          </View>
        ) : null}

        {!online ? (
          <View style={[styles.notice, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md, gap: theme.space.sm }]}>
            <WifiOff size={16} color={theme.colors.mutedForeground} />
            <Text style={{ flex: 1, color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
              You're offline. Your decision is saved on this device and syncs when you're back online.
            </Text>
          </View>
        ) : null}

        <View style={{ gap: theme.space.sm }}>
          <Button variant="primary" onPress={() => submit()} loading={saving} disabled={saving}>
            {decision === "correct" ? "Save correction" : draft.role === "not_fee" ? "Mark as not a fee" : "Confirm"}
          </Button>
          {draft.role !== "not_fee" ? (
            <Button variant="outline" onPress={() => submit("not_fee")} disabled={saving}>
              Not a fee
            </Button>
          ) : null}
        </View>

        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
          Your original transaction is never changed — this only affects how Spendly counts fees.
        </Text>

        {review?.history && review.history.length > 0 ? (
          <View style={{ gap: theme.space.xs }}>
            {sectionTitle("Correction history")}
            {[...review.history].reverse().map((entry) => (
              <Text key={entry.revision} style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                {describeHistoryEntry(entry)} · {new Date(entry.atMs).toLocaleDateString()}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  amountField: {
    minWidth: 130,
    flexGrow: 1,
    flexBasis: "45%",
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
  },
});

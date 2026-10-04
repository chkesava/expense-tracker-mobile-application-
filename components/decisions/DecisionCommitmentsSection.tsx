import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CalendarClock, Trash2 } from "lucide-react-native";

import { Section } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import type { MoneyDecision } from "@/shared/types/decision";
import { DECISION_LIMITS } from "@/shared/types/decision";
import { todayDateKey } from "@/shared/utils/dates";
import {
  DUE_LABELS,
  addCommitment,
  commitmentProgress,
  commitmentState,
  removeCommitment,
  reviewState,
  setCommitmentStatus,
  setReviewDate,
  validateCommitmentDraft,
  type CommitmentState,
  type ReviewState,
} from "@/shared/utils/decisionCommitments";
import { newItemId, reviewDateChoices } from "@/shared/utils/decisionForm";
import { withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export function DueBadge({ state }: { state: CommitmentState | ReviewState }) {
  const { theme } = useTheme();
  const label = DUE_LABELS[state];
  if (!label) return null;
  const color =
    state === "overdue" ? theme.colors.destructive : state === "due_today" || state === "upcoming" ? theme.colors.warning : state === "done" || state === "reviewed" ? theme.colors.success : theme.colors.mutedForeground;
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(color, 0.14), borderRadius: theme.radius.full }]} accessibilityLabel={label}>
      <Text style={{ color, fontFamily: theme.fontFamily.semibold, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

/**
 * Commitments and review date for one decision (SPENDLY-367). Every change
 * is saved through the audited decision write. The section says plainly that
 * finishing actions is not the same as the decision succeeding.
 */
export function DecisionCommitmentsSection({
  decision,
  busy,
  onSave,
}: {
  decision: MoneyDecision;
  busy: boolean;
  onSave: (next: MoneyDecision, message: string) => void;
}) {
  const { theme } = useTheme();
  const today = todayDateKey();
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [date, setDate] = useState("");
  const [showIssues, setShowIssues] = useState(false);
  const progress = commitmentProgress(decision.commitments, today);
  const review = reviewState(decision, today);
  const issues = validateCommitmentDraft({ text, owner, targetDate: date || undefined }, decision.commitments.length);
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const readOnly = decision.status === "archived";

  const add = () => {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    onSave(addCommitment(decision, { id: newItemId(), text, owner, targetDate: date || undefined }), "Commitment added");
    setText("");
    setOwner("");
    setDate("");
    setShowIssues(false);
  };

  return (
    <Section title="Follow-up" subtitle="What you'll do, and when you'll look back">
      <View style={{ gap: theme.space.md }}>
        <View style={{ gap: theme.space.xs }}>
          <View style={[styles.row, { gap: theme.space.sm }]}>
            <CalendarClock size={16} color={theme.colors.primary} />
            <Text style={[body, { flex: 1 }]}>{decision.reviewDate ? `Review on ${decision.reviewDate}` : "No review date"}</Text>
            <DueBadge state={review} />
          </View>
          {!readOnly ? (
            <View style={[styles.wrap, { gap: theme.space.xs }]}>
              {reviewDateChoices(today).map((c) => (
                <Chip key={c.label} label={c.label} size="sm" appearance="outline" selected={decision.reviewDate === c.date} disabled={busy} onPress={() => onSave(setReviewDate(decision, c.date), "Review date set")} />
              ))}
              {decision.reviewDate ? <Chip label="Clear" size="sm" appearance="outline" disabled={busy} onPress={() => onSave(setReviewDate(decision, null), "Review date cleared")} /> : null}
            </View>
          ) : null}
          <Text style={muted}>Review dates will show in the Financial Calendar once it's available.</Text>
        </View>

        <View style={{ gap: theme.space.sm }}>
          <Text style={[body, { fontFamily: theme.fontFamily.semibold }]}>Commitments</Text>
          {progress.total > 0 ? (
            <Text style={muted}>
              {progress.done} of {progress.total - progress.dropped} done{progress.overdue ? ` · ${progress.overdue} overdue` : ""}. {progress.caveat}
            </Text>
          ) : (
            <Text style={muted}>Actions you committed to as part of this decision — separate from any transaction.</Text>
          )}
          {decision.commitments.map((c) => {
            const state = commitmentState(c, today);
            return (
              <View key={c.id} style={[styles.item, { gap: theme.space.xs, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.space.sm }]}>
                <View style={[styles.row, { gap: theme.space.sm }]}>
                  <Text style={[body, { flex: 1, textDecorationLine: c.status === "dropped" ? "line-through" : "none" }]}>{c.text}</Text>
                  <DueBadge state={state} />
                </View>
                <Text style={muted}>
                  {[c.owner ? `By ${c.owner}` : null, c.targetDate ? `Target ${c.targetDate}` : null, c.completedAtMs ? `Done ${new Date(c.completedAtMs).toISOString().slice(0, 10)}` : null].filter(Boolean).join(" · ") || "No target date"}
                </Text>
                {!readOnly ? (
                  <View style={[styles.row, { gap: theme.space.xs }]} accessibilityRole="radiogroup">
                    {(["open", "done", "dropped"] as const).map((s) => (
                      <Chip key={s} label={s === "open" ? "To do" : s === "done" ? "Done" : "Dropped"} size="sm" selected={c.status === s} disabled={busy} onPress={() => onSave(setCommitmentStatus(decision, c.id, s, Date.now()), s === "done" ? "Marked done" : s === "dropped" ? "Marked dropped" : "Reopened")} accessibilityRole="radio" />
                    ))}
                    <View style={{ flex: 1 }} />
                    <Button variant="ghost" size="icon" disabled={busy} onPress={() => onSave(removeCommitment(decision, c.id), "Commitment removed")} accessibilityLabel={`Remove commitment: ${c.text}`}>
                      <Trash2 size={16} color={theme.colors.destructive} />
                    </Button>
                  </View>
                ) : null}
              </View>
            );
          })}

          {!readOnly && decision.commitments.length < DECISION_LIMITS.commitments ? (
            <View style={{ gap: theme.space.sm }}>
              <Input value={text} onChangeText={setText} placeholder="e.g. Ask the bank for a prepayment quote" maxLength={DECISION_LIMITS.text} accessibilityLabel="New commitment" error={showIssues && issues.includes("text_required") ? "Say what you'll do." : undefined} />
              <View style={[styles.row, { gap: theme.space.sm }]}>
                <Input value={owner} onChangeText={setOwner} placeholder="Who (optional)" maxLength={60} containerStyle={{ flex: 1 }} accessibilityLabel="Who will do it" />
                <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" containerStyle={{ flex: 1 }} accessibilityLabel="Target date" error={showIssues && issues.includes("invalid_date") ? "Use a date like 2026-10-15." : undefined} />
              </View>
              <Button variant="tonal" onPress={add} disabled={busy}>
                + Add commitment
              </Button>
            </View>
          ) : null}
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2 },
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  item: { borderWidth: StyleSheet.hairlineWidth },
});

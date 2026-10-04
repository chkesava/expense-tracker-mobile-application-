import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CheckCircle2, Target } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Section } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import type { DecisionOutcome, MoneyDecision } from "@/shared/types/decision";
import { DECISION_LIMITS } from "@/shared/types/decision";
import { todayDateKey } from "@/shared/utils/dates";
import {
  ASSESSMENT_LABELS,
  VARIANCE_REASON_TEXT,
  canRecordOutcome,
  draftToOutcome,
  expectedForReview,
  outcomeToDraft,
  outcomeVariance,
  recordOutcome,
  varianceSentence,
  type OutcomeDraft,
} from "@/shared/utils/decisionOutcome";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Expected vs actual for one decision (SPENDLY-369). Expected and actual are
 * two visibly different cards; the difference appears only when both are
 * comparable amounts; and the only verdict shown is the user's own.
 */
export function DecisionOutcomeSection({
  decision,
  busy,
  onSave,
}: {
  decision: MoneyDecision;
  busy: boolean;
  onSave: (next: MoneyDecision, message: string) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const [open, setOpen] = useState(false);
  const exp = expectedForReview(decision);
  const outcome = decision.outcome;
  const variance = outcome ? outcomeVariance(exp.expected, outcome) : null;
  const money = (n: number) => formatAmount(n, "INR");
  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const label = (t: string) => <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>{t}</Text>;

  if (!canRecordOutcome(decision) && !outcome) return null;
  const decidedOn = decision.decidedAtMs ? new Date(decision.decidedAtMs).toISOString().slice(0, 10) : null;

  return (
    <Section title="Expected vs what happened" subtitle="Your own record — Spendly doesn't judge the result">
      <View style={{ gap: theme.space.md }}>
        {/* Expected: dashed, neutral */}
        <View style={[styles.card, { borderStyle: "dashed", borderColor: theme.colors.outline, borderRadius: theme.radius.md, padding: theme.space.md, gap: 4 }]} accessible accessibilityLabel="What you expected">
          <View style={[styles.row, { gap: theme.space.xs }]}>
            <Target size={14} color={theme.colors.mutedForeground} />
            {label("What you expected")}
          </View>
          {exp.expected ? (
            <>
              {exp.expected.summary ? <Text style={body}>{exp.expected.summary}</Text> : null}
              {exp.expected.amount !== undefined ? <Text style={body}>{money(exp.expected.amount)} (your estimate)</Text> : null}
              {exp.expected.byDate ? <Text style={muted}>By {exp.expected.byDate}</Text> : null}
            </>
          ) : (
            <Text style={muted}>You didn't write down an expectation.</Text>
          )}
          <Text style={muted}>
            {exp.source === "snapshot" ? `As you expected it when you decided${decidedOn ? ` on ${decidedOn}` : ""}.` : "Your current expectation — it will be kept as it is once you decide."}
            {exp.editedSinceDecided ? " You edited it later; this is the original." : ""}
          </Text>
        </View>

        {/* Actual: solid, tinted */}
        <View style={[styles.card, { borderColor: theme.colors.primary, backgroundColor: withAlpha(theme.colors.primary, 0.06), borderRadius: theme.radius.md, padding: theme.space.md, gap: 4 }]} accessible accessibilityLabel="What actually happened">
          <View style={[styles.row, { gap: theme.space.xs }]}>
            <CheckCircle2 size={14} color={theme.colors.primary} />
            {label("What actually happened")}
          </View>
          {outcome ? (
            <>
              <Text style={body}>{outcome.summary}</Text>
              {outcome.amount !== undefined ? <Text style={body}>{money(outcome.amount)} (what you recorded)</Text> : null}
              {outcome.userAssessment ? <Text style={body}>Your assessment: {ASSESSMENT_LABELS[outcome.userAssessment]}</Text> : null}
              {outcome.lessons ? <Text style={body}>Lessons: {outcome.lessons}</Text> : null}
              {outcome.reviewNotes ? <Text style={muted}>Notes: {outcome.reviewNotes}</Text> : null}
              <Text style={muted}>
                Recorded {new Date(outcome.recordedAtMs).toISOString().slice(0, 10)}
                {outcome.outcomeDate ? ` · as of ${outcome.outcomeDate}` : ""}
              </Text>
            </>
          ) : (
            <Text style={muted}>Not recorded yet. When you look back, note what actually happened — words are enough.</Text>
          )}
        </View>

        {outcome ? (
          <View style={[styles.row, { gap: theme.space.xs, backgroundColor: surfaces.tile, borderRadius: theme.radius.md, padding: theme.space.sm }]}>
            <Text style={[body, { flex: 1 }]}>{variance?.ok ? `Difference: ${varianceSentence(variance, money)}` : variance ? VARIANCE_REASON_TEXT[variance.reason] : ""}</Text>
          </View>
        ) : null}

        {decision.status !== "archived" ? (
          <Button variant={outcome ? "outline" : "primary"} onPress={() => setOpen(true)} disabled={busy}>
            {outcome ? "Update what happened" : "Record what happened"}
          </Button>
        ) : null}
      </View>

      <OutcomeSheet
        isOpen={open}
        decision={decision}
        onClose={() => setOpen(false)}
        onSubmit={(o, complete) => {
          const r = recordOutcome(decision, o, complete, Date.now());
          if (!r.ok) return;
          onSave(r.decision, complete && r.decision.status === "reviewed" && decision.status !== "reviewed" ? "Review completed" : "Outcome saved");
          setOpen(false);
        }}
      />
    </Section>
  );
}

function OutcomeSheet({
  isOpen,
  decision,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  decision: MoneyDecision;
  onClose: () => void;
  onSubmit: (outcome: DecisionOutcome, completeReview: boolean) => void;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState<OutcomeDraft>(outcomeToDraft(decision.outcome));
  const [complete, setComplete] = useState(true);
  const [showIssues, setShowIssues] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setDraft(outcomeToDraft(decision.outcome));
      setComplete(decision.status === "decided" || decision.status === "tracking");
      setShowIssues(false);
    }
  }, [isOpen, decision.outcome, decision.status]);

  const expectedUnit = expectedForReview(decision).expected?.unit ?? "inr";
  const result = draftToOutcome(draft, Date.now(), expectedUnit);
  const issues = !result.ok ? result.issues : [];
  const canComplete = decision.status === "decided" || decision.status === "tracking";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="What happened?" density="compact">
      <View style={{ gap: theme.space.md }}>
        <Input label="In your words" value={draft.summary} onChangeText={(summary) => setDraft({ ...draft, summary })} multiline maxLength={DECISION_LIMITS.text} placeholder="e.g. Closed the loan 10 months early" error={showIssues && issues.includes("summary_required") ? "A sentence is enough." : undefined} />
        <View style={[styles.row, { gap: theme.space.sm }]}>
          <Input label="Amount, ₹ (optional)" value={draft.amount} onChangeText={(amount) => setDraft({ ...draft, amount })} keyboardType="numbers-and-punctuation" placeholder="0" containerStyle={{ flex: 1 }} helperText="What actually happened" error={showIssues && issues.includes("invalid_amount") ? "Enter a number like 11000" : undefined} />
          <Input label="As of (optional)" value={draft.outcomeDate} onChangeText={(outcomeDate) => setDraft({ ...draft, outcomeDate })} placeholder="YYYY-MM-DD" containerStyle={{ flex: 1 }} error={showIssues && issues.includes("invalid_date") ? "Use a date like 2027-03-31" : undefined} />
        </View>
        <Chip label="Today" size="sm" appearance="outline" selected={draft.outcomeDate === todayDateKey()} onPress={() => setDraft({ ...draft, outcomeDate: todayDateKey() })} />
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>How did it turn out for you? (optional)</Text>
        <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
          {(Object.keys(ASSESSMENT_LABELS) as Array<keyof typeof ASSESSMENT_LABELS>).map((k) => (
            <Chip key={k} label={ASSESSMENT_LABELS[k]} size="sm" selected={draft.userAssessment === k} onPress={() => setDraft({ ...draft, userAssessment: draft.userAssessment === k ? null : k })} accessibilityRole="radio" />
          ))}
        </View>
        <Input label="What did you learn? (optional)" value={draft.lessons} onChangeText={(lessons) => setDraft({ ...draft, lessons })} multiline maxLength={DECISION_LIMITS.text} placeholder="For next time…" />
        <Input label="Review notes (optional)" value={draft.reviewNotes} onChangeText={(reviewNotes) => setDraft({ ...draft, reviewNotes })} multiline maxLength={DECISION_LIMITS.text} />
        {canComplete ? (
          <Chip label="Mark this review complete" selected={complete} onPress={() => setComplete(!complete)} accessibilityRole="button" accessibilityLabel={`Mark this review complete: ${complete ? "on" : "off"}`} />
        ) : null}
        <Button
          variant="primary"
          onPress={() => {
            if (!result.ok) {
              setShowIssues(true);
              return;
            }
            onSubmit(result.outcome, canComplete && complete);
          }}
        >
          Save
        </Button>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          What you expected when you decided stays exactly as it was.
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});

import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ArrowDown, ArrowUp, Link2, Scale, Trash2, WifiOff } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { DecisionLinkPicker } from "@/components/decisions/DecisionLinkPicker";
import { DecisionListEditor } from "@/components/decisions/DecisionListEditor";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useDecisionLinkSources } from "@/hooks/useDecisionLinkSources";
import { useDecisions } from "@/hooks/useDecisions";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { DecisionInvalidError, newDecisionId, saveDecision } from "@/services/decisions/decisionStore";
import { DECISION_CATEGORIES, DECISION_LIMITS, type MoneyDecision } from "@/shared/types/decision";
import { todayDateKey } from "@/shared/utils/dates";
import {
  DECISION_STEPS,
  decisionStepIssues,
  decisionToForm,
  firstStepWithIssues,
  formToDecision,
  isDecisionFormDirty,
  addSuggestedAssumption,
  addSuggestedConstraint,
  addSuggestedOption,
  applyDecisionTemplate,
  moveItem,
  newItemId,
  unusedSuggestions,
  reviewDateChoices,
  type DecisionFormState,
} from "@/shared/utils/decisionForm";
import { DECISION_TEMPLATES, getDecisionTemplate } from "@/shared/data/decisionTemplates";
import { removeLink, addLink, linkFromRouteParams } from "@/shared/utils/decisionLinks";
import { decisionCategoryLabel, newDecisionDraft, transitionDecision } from "@/shared/utils/decisionModel";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Capture / edit a Money Decision (SPENDLY-363). Five short steps; only the
 * question is required. "Save draft" works from any step, so a decision can
 * be started now and finished later — the draft lives in Firestore (through
 * the offline outbox), not on the device.
 */
export default function DecisionEditScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; linkKind?: string; linkRef?: string; linkRefKind?: string }>();
  const { user } = useAuth();
  const uid = user?.uid;
  const { isOnline } = useNetwork();
  const { byId, loading, error, retry } = useDecisions();
  const keyboard = useKeyboardHeight();
  const bottomPadding = usePageListBottomPadding();

  const editingId = typeof params.id === "string" && params.id ? params.id : null;
  const existing = editingId ? byId.get(editingId) ?? null : null;

  // A brand-new decision gets its id up front so the draft can be saved and
  // resumed under the same document.
  const newBase = useRef<MoneyDecision | null>(null);
  if (!editingId && !newBase.current && uid) {
    newBase.current = newDecisionDraft({ id: newDecisionId(uid), title: "", category: "other", nowMs: Date.now() });
  }
  const base = existing ?? newBase.current;

  const [form, setForm] = useState<DecisionFormState | null>(null);
  const [savedForm, setSavedForm] = useState<DecisionFormState | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [showIssues, setShowIssues] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const linkSources = useDecisionLinkSources();
  const prelinked = useRef(false);

  useEffect(() => {
    if (!base || loadedFor.current === base.id) return;
    loadedFor.current = base.id;
    const f = decisionToForm(base);
    setForm(f);
    setSavedForm(f);
  }, [base]);

  // SPENDLY-366: "Log a decision about this" opens a new decision already
  // linked to the record it came from — as a reference, once.
  useEffect(() => {
    if (editingId || prelinked.current || !form || !params.linkRef) return;
    const kind = params.linkKind === "account" ? "account" : "transaction";
    if (!linkSources.ready[kind]) return;
    prelinked.current = true;
    const link = linkFromRouteParams(params, linkSources, newItemId(), Date.now());
    if (link) setForm({ ...form, links: addLink(form.links, link) });
  }, [editingId, form, params, linkSources]);

  const dirty = Boolean(form && savedForm && isDecisionFormDirty(form, savedForm));
  const { confirmLeave } = useUnsavedChangesGuard(dirty && !saving);
  const step = DECISION_STEPS[stepIndex];
  const issues = useMemo(() => (form ? decisionStepIssues(form, step.id) : []), [form, step.id]);
  const today = todayDateKey();

  const header = (
    <PageHeader
      title={editingId ? "Edit decision" : "New decision"}
      subtitle={`Step ${stepIndex + 1} of ${DECISION_STEPS.length} · ${step.title}`}
      icon={<Scale size={20} color={theme.colors.primary} />}
      onBack={() => confirmLeave(() => router.back())}
    />
  );

  if (error) {
    return (
      <PageShell scrollable={false}>
        {header}
        <ErrorState title="Couldn't load this decision" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageShell>
    );
  }
  if (!form || !base || (editingId && loading)) {
    return (
      <PageShell scrollable={false}>
        {header}
        <LoadingState variant="card" count={2} />
      </PageShell>
    );
  }
  if (editingId && !existing) {
    return (
      <PageShell scrollable={false}>
        {header}
        <ErrorState title="This decision isn't here any more" description="It may have been deleted on another device." onRetry={() => router.replace("/decisions" as Href)} retryLabel="Back to decisions" />
      </PageShell>
    );
  }

  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const set = (patch: Partial<DecisionFormState>) => setForm({ ...form, ...patch });
  // SPENDLY-364: prompts come from the template at the version this decision
  // was started with, so an older decision keeps its original structure.
  const template = getDecisionTemplate(form.templateId ?? undefined, form.templateVersion ?? undefined);
  const canChangeTemplate = base.status === "draft" || base.status === "considering";
  const suggestionChips = (items: string[], onAdd: (text: string) => void) =>
    items.length > 0 ? (
      <View style={[styles.wrap, { gap: theme.space.sm }]}>
        <Text style={[muted, { width: "100%" }]}>Suggestions - tap to add, or skip</Text>
        {items.map((text) => (
          <Chip key={text} label={`+ ${text}`} size="sm" appearance="outline" onPress={() => onAdd(text)} accessibilityLabel={`Add suggestion: ${text}`} />
        ))}
      </View>
    ) : null;
  const fieldError = (field: string) => (showIssues ? issues.find((i) => i.field === field)?.message : undefined);

  const save = async (markDecided: boolean) => {
    if (!uid || saving) return;
    const bad = firstStepWithIssues(form);
    if (bad) {
      setStepIndex(DECISION_STEPS.findIndex((s) => s.id === bad));
      setShowIssues(true);
      return;
    }
    let next = formToDecision(form, base);
    if (markDecided && next.status !== "decided") {
      const moved = transitionDecision(next, "decided", Date.now());
      if (!moved.ok) {
        toast.info(moved.issues.includes("selection_missing") ? "Pick the option you chose first." : "This decision can't be marked decided from here.");
        setStepIndex(DECISION_STEPS.findIndex((s) => s.id === "choice"));
        return;
      }
      next = moved.decision;
    }
    setSaving(true);
    try {
      const { outcome } = await saveDecision(uid, existing, next);
      setSavedForm(form);
      toast.success(writeSavedMessage(outcome, markDecided ? "Decision saved" : next.status === "draft" ? "Draft saved" : "Changes saved"));
      router.replace(`/decisions/${next.id}` as Href);
    } catch (err) {
      if (err instanceof DecisionInvalidError) {
        toast.error("Something in this decision can't be saved — check each step.");
      } else {
        logError("decisions.save", err);
        toast.error(friendlyErrorMessage(err, "Couldn't save your decision."));
      }
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    setShowIssues(false);
    setStepIndex(Math.min(stepIndex + 1, DECISION_STEPS.length - 1));
  };

  const sectionTitle = (text: string) => (
    <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{text}</Text>
  );

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      <View style={[styles.progress, { gap: 4, paddingHorizontal: theme.space.lg }]} accessibilityLabel={`Step ${stepIndex + 1} of ${DECISION_STEPS.length}`}>
        {DECISION_STEPS.map((s, i) => (
          <View key={s.id} style={[styles.dot, { backgroundColor: i <= stepIndex ? theme.colors.primary : surfaces.track, height: i === stepIndex ? 4 : 3 }]} />
        ))}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.lg, paddingBottom: bottomPadding + keyboard }}
      >
        {!isOnline ? (
          <View style={[styles.row, { gap: theme.space.sm }]}>
            <WifiOff size={16} color={theme.colors.mutedForeground} />
            <Text style={[muted, { flex: 1 }]}>You're offline. Saving keeps this on your device and syncs later.</Text>
          </View>
        ) : null}

        {step.id === "question" ? (
          <>
            {canChangeTemplate ? (
              <>
                {sectionTitle("Start from a template (optional)")}
                <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
                  {DECISION_TEMPLATES.map((t) => (
                    <Chip
                      key={t.id}
                      label={t.label}
                      selected={form.templateId === t.id}
                      onPress={() => setForm(applyDecisionTemplate(form, t))}
                      accessibilityRole="radio"
                      accessibilityLabel={`${t.label} template. ${t.description}`}
                    />
                  ))}
                </View>
                {form.templateId ? <Text style={muted}>{template.description} It only suggests prompts; you choose what to fill in.</Text> : null}
              </>
            ) : form.templateId ? (
              <Text style={muted}>Started from the {template.label} template.</Text>
            ) : null}
            <Input
              label="What are you deciding?"
              value={form.title}
              onChangeText={(title) => set({ title })}
              placeholder={template.prompts.title}
              maxLength={DECISION_LIMITS.title}
              error={fieldError("title")}
              autoFocus={!editingId}
            />
            {sectionTitle("Category")}
            <View style={[styles.wrap, { gap: theme.space.sm }]}>
              {DECISION_CATEGORIES.map((c) => (
                <Chip key={c} label={decisionCategoryLabel(c)} selected={form.category === c} onPress={() => set({ category: c })} accessibilityRole="radio" />
              ))}
            </View>
            <Text style={muted}>Only the question is required. You can save a draft at any step and finish later.</Text>
          </>
        ) : null}

        {step.id === "context" ? (
          <>
            <Input label="What's going on? (optional)" value={form.situation} onChangeText={(situation) => set({ situation })} multiline maxLength={DECISION_LIMITS.text} placeholder={template.prompts.situation} />
            <Input label="What do you want to achieve? (optional)" value={form.goal} onChangeText={(goal) => set({ goal })} multiline maxLength={DECISION_LIMITS.text} placeholder={template.prompts.goal} />
            {sectionTitle("Constraints (optional)")}
            <Text style={muted}>Limits you have to work within, like a budget or a date.</Text>
            <DecisionListEditor
              label="Constraint"
              items={form.constraints.map((text, i) => ({ id: `c${i}`, text }))}
              onChange={(items) => set({ constraints: items.map((i) => i.text) })}
              addLabel="Add a constraint"
              placeholder="e.g. Keep 3 months of expenses aside"
              newId={newItemId}
              max={DECISION_LIMITS.listItems}
            />
            {suggestionChips(unusedSuggestions(template.suggestedConstraints, form.constraints), (text) => setForm(addSuggestedConstraint(form, text)))}
            {sectionTitle("Assumptions (optional)")}
            <Text style={muted}>What you're taking as given. These are your assumptions, not facts from Spendly.</Text>
            <DecisionListEditor
              label="Assumption"
              items={form.assumptions}
              onChange={(assumptions) => set({ assumptions })}
              addLabel="Add an assumption"
              placeholder="e.g. Interest rates stay around 9%"
              newId={newItemId}
              max={DECISION_LIMITS.assumptions}
            />
            {suggestionChips(unusedSuggestions(template.suggestedAssumptions, form.assumptions.map((a) => a.text)), (text) => setForm(addSuggestedAssumption(form, text)))}
          </>
        ) : null}

        {step.id === "options" ? (
          <>
            <Text style={muted}>List the options you considered, if there's more than one. You can compare them in detail later.</Text>
            {form.alternatives.map((a, index) => (
              <View key={a.id} style={[styles.card, { borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.space.md, gap: theme.space.sm }]}>
                <View style={[styles.row, { gap: theme.space.xs }]}>
                  <Text style={[muted, { flex: 1, fontFamily: theme.fontFamily.semibold }]}>Option {index + 1}</Text>
                  <Button variant="ghost" size="icon" disabled={index === 0} onPress={() => set({ alternatives: moveItem(form.alternatives, index, -1) })} accessibilityLabel={`Move option ${index + 1} up`}>
                    <ArrowUp size={16} color={theme.colors.mutedForeground} />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={index === form.alternatives.length - 1} onPress={() => set({ alternatives: moveItem(form.alternatives, index, 1) })} accessibilityLabel={`Move option ${index + 1} down`}>
                    <ArrowDown size={16} color={theme.colors.mutedForeground} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onPress={() => set({ alternatives: form.alternatives.filter((x) => x.id !== a.id), selectedAlternativeId: form.selectedAlternativeId === a.id ? null : form.selectedAlternativeId })}
                    accessibilityLabel={`Remove option ${index + 1}`}
                  >
                    <Trash2 size={16} color={theme.colors.destructive} />
                  </Button>
                </View>
                <Input
                  value={a.title}
                  onChangeText={(title) => set({ alternatives: form.alternatives.map((x) => (x.id === a.id ? { ...x, title } : x)) })}
                  placeholder="e.g. Prepay ₹1 lakh now"
                  maxLength={DECISION_LIMITS.label}
                  error={fieldError(`alternative.${index}`)}
                  accessibilityLabel={`Option ${index + 1} name`}
                />
                <Input
                  value={a.notes}
                  onChangeText={(notes) => set({ alternatives: form.alternatives.map((x) => (x.id === a.id ? { ...x, notes } : x)) })}
                  placeholder="Notes (optional)"
                  multiline
                  maxLength={DECISION_LIMITS.text}
                  accessibilityLabel={`Option ${index + 1} notes`}
                />
              </View>
            ))}
            {form.alternatives.length < DECISION_LIMITS.alternatives ? (
              <Button variant="tonal" onPress={() => set({ alternatives: [...form.alternatives, { id: newItemId(), title: "", notes: "" }] })}>
                + Add an option
              </Button>
            ) : null}
            {form.alternatives.length < DECISION_LIMITS.alternatives
              ? suggestionChips(unusedSuggestions(template.suggestedOptions, form.alternatives.map((a) => a.title)), (text) => setForm(addSuggestedOption(form, text)))
              : null}
          </>
        ) : null}

        {step.id === "choice" ? (
          <>
            {form.alternatives.filter((a) => a.title.trim()).length > 0 ? (
              <>
                {sectionTitle("Which option did you choose?")}
                <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
                  <Chip label="Not decided yet" selected={!form.selectedAlternativeId} onPress={() => set({ selectedAlternativeId: null })} accessibilityRole="radio" appearance="outline" />
                  {form.alternatives.filter((a) => a.title.trim()).map((a) => (
                    <Chip key={a.id} label={a.title} selected={form.selectedAlternativeId === a.id} onPress={() => set({ selectedAlternativeId: a.id })} accessibilityRole="radio" />
                  ))}
                </View>
                {fieldError("selected") ? <Text style={{ color: theme.colors.destructive, fontSize: theme.typography.xs }}>{fieldError("selected")}</Text> : null}
              </>
            ) : (
              <Text style={muted}>No options listed — that's fine for a simple yes/no decision.</Text>
            )}
            <Input label="Why? (optional)" value={form.rationale} onChangeText={(rationale) => set({ rationale })} multiline maxLength={DECISION_LIMITS.text} placeholder={template.prompts.rationale} />
            {sectionTitle("How sure are you? (optional)")}
            <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip
                  key={n}
                  label={["Not sure", "Unsure", "Fairly", "Quite", "Very sure"][n - 1]}
                  selected={form.confidence === n}
                  onPress={() => set({ confidence: form.confidence === n ? null : n })}
                  accessibilityRole="radio"
                  size="sm"
                />
              ))}
            </View>
          </>
        ) : null}

        {step.id === "expected" ? (
          <>
            <Input label="What do you expect to happen? (optional)" value={form.expectedSummary} onChangeText={(expectedSummary) => set({ expectedSummary })} multiline maxLength={DECISION_LIMITS.text} placeholder={template.prompts.expected} />
            <View style={[styles.row, { gap: theme.space.sm }]}>
              <Input label="Expected amount, ₹ (optional)" value={form.expectedAmount} onChangeText={(expectedAmount) => set({ expectedAmount })} keyboardType="decimal-pad" placeholder="0" error={fieldError("expectedAmount")} containerStyle={{ flex: 1 }} helperText="Your estimate" />
              <Input label="By (optional)" value={form.expectedByDate} onChangeText={(expectedByDate) => set({ expectedByDate })} placeholder="YYYY-MM-DD" error={fieldError("expectedByDate")} containerStyle={{ flex: 1 }} />
            </View>
            {sectionTitle("When should you look back at this? (optional)")}
            <View style={[styles.wrap, { gap: theme.space.sm }]}>
              {reviewDateChoices(today).map((c) => (
                <Chip key={c.label} label={c.label} size="sm" selected={form.reviewDate === c.date} onPress={() => set({ reviewDate: form.reviewDate === c.date ? "" : c.date })} />
              ))}
            </View>
            <Input label="Review date" value={form.reviewDate} onChangeText={(reviewDate) => set({ reviewDate })} placeholder="YYYY-MM-DD" error={fieldError("reviewDate")} />

            {sectionTitle("Linked Spendly records (optional)")}
            <Text style={muted}>References only — the records themselves are never copied or changed.</Text>
            {form.links.map((l) => (
              <View key={l.id} style={[styles.row, { gap: theme.space.sm }]}>
                <Link2 size={16} color={theme.colors.primary} />
                <Text style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }} numberOfLines={1}>
                  {l.capturedLabel}
                </Text>
                <Button variant="ghost" size="icon" onPress={() => set({ links: removeLink(form.links, l.id) })} accessibilityLabel={`Remove link to ${l.capturedLabel}`}>
                  <Trash2 size={16} color={theme.colors.destructive} />
                </Button>
              </View>
            ))}
            {form.links.length < DECISION_LIMITS.links ? (
              <Button variant="tonal" onPress={() => setPickerOpen(true)}>
                + Link a transaction or account
              </Button>
            ) : null}
          </>
        ) : null}

        <View style={{ gap: theme.space.sm }}>
          <View style={[styles.row, { gap: theme.space.sm }]}>
            {stepIndex > 0 ? (
              <Button variant="outline" onPress={() => setStepIndex(stepIndex - 1)} style={{ flex: 1 }}>
                Back
              </Button>
            ) : null}
            {stepIndex < DECISION_STEPS.length - 1 ? (
              <Button variant="primary" onPress={goNext} style={{ flex: 1 }}>
                Next
              </Button>
            ) : (
              <Button variant="primary" onPress={() => void save(base.status === "draft" || base.status === "considering")} loading={saving} disabled={saving} style={{ flex: 1 }}>
                {base.status === "draft" || base.status === "considering" ? "Save & mark decided" : "Save changes"}
              </Button>
            )}
          </View>
          <Button variant="ghost" onPress={() => void save(false)} disabled={saving}>
            {base.status === "draft" ? "Save draft" : "Save"}
          </Button>
        </View>
      </ScrollView>

      <DecisionLinkPicker initialTab={template.linkHint} isOpen={pickerOpen} links={form.links} onAdd={(link) => set({ links: addLink(form.links, link) })} onClose={() => setPickerOpen(false)} />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", paddingBottom: 8 },
  dot: { flex: 1, borderRadius: 2 },
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  card: { borderWidth: StyleSheet.hairlineWidth },
});

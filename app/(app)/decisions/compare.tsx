import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Scale } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { AlternativeWorkspaceCard, type AlternativeWorkspaceState } from "@/components/decisions/AlternativeWorkspaceCard";
import { DecisionListEditor, type DecisionListItem } from "@/components/decisions/DecisionListEditor";
import { Section } from "@/components/dashboard/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { useDecisions } from "@/hooks/useDecisions";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { saveDecision } from "@/services/decisions/decisionStore";
import { DECISION_LIMITS, type MoneyDecision } from "@/shared/types/decision";
import { assumptionChangesSinceDecision, draftsToInputs, hasAssumptionChanges, inputToDraft } from "@/shared/utils/decisionComparison";
import { newItemId } from "@/shared/utils/decisionForm";
import { useTheme } from "@/theme/ThemeProvider";

interface WorkspaceState {
  alternatives: AlternativeWorkspaceState[];
  constraints: DecisionListItem[];
  assumptions: DecisionListItem[];
}

const toItems = (texts: string[]) => texts.map((text) => ({ id: newItemId(), text }));

function toWorkspace(d: MoneyDecision): WorkspaceState {
  return {
    alternatives: d.alternatives.map((a) => ({
      id: a.id,
      title: a.title,
      pros: toItems(a.pros),
      cons: toItems(a.cons),
      nonFinancial: a.nonFinancial ?? "",
      inputs: a.inputs.map(inputToDraft),
    })),
    constraints: toItems(d.context.constraints),
    assumptions: d.assumptions.filter((a) => a.source === "user").map((a) => ({ id: a.id, text: a.text })),
  };
}

/**
 * Options, assumptions and constraints side by side (SPENDLY-365). Wide
 * screens scroll horizontally through columns; phones stack the options.
 * No option is ever singled out as the right one — only the user's own pick
 * is labelled, as theirs.
 */
export default function DecisionCompareScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { user } = useAuth();
  const uid = user?.uid;
  const { byId, loading, error, retry } = useDecisions();
  const decision = byId.get(id);
  const keyboard = useKeyboardHeight();
  const bottomPadding = usePageListBottomPadding();

  const [ws, setWs] = useState<WorkspaceState | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!decision || loadedFor.current === decision.id) return;
    loadedFor.current = decision.id;
    const next = toWorkspace(decision);
    setWs(next);
    setSaved(JSON.stringify(next));
  }, [decision]);

  const dirty = Boolean(ws && JSON.stringify(ws) !== saved);
  const { confirmLeave } = useUnsavedChangesGuard(dirty && !saving);
  const changes = useMemo(() => (decision ? assumptionChangesSinceDecision(decision) : null), [decision]);

  const header = (
    <PageHeader
      title="Compare options"
      subtitle={decision?.title}
      icon={<Scale size={20} color={theme.colors.primary} />}
      onBack={() => confirmLeave(() => (router.canGoBack() ? router.back() : router.replace(`/decisions/${id}` as Href)))}
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
  if (loading || (decision && !ws)) {
    return (
      <PageShell scrollable={false}>
        {header}
        <LoadingState variant="card" count={2} />
      </PageShell>
    );
  }
  if (!decision || !ws) {
    return (
      <PageShell scrollable={false}>
        {header}
        <ErrorState title="This decision isn't here any more" onRetry={() => router.replace("/decisions" as Href)} retryLabel="Back to decisions" />
      </PageShell>
    );
  }

  const wide = width >= 720;
  const columnWidth = wide ? Math.min(360, Math.max(300, (width - 64) / Math.min(3, Math.max(1, ws.alternatives.length)))) : undefined;
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  const save = async () => {
    if (!uid || saving) return;
    const alternatives = [];
    for (const a of ws.alternatives) {
      const parsed = draftsToInputs(a.inputs);
      if (!parsed.ok) {
        toast.error(`Check the amounts under "${a.title}".`);
        return;
      }
      const prev = decision.alternatives.find((x) => x.id === a.id)!;
      alternatives.push({
        ...prev,
        pros: a.pros.map((p) => p.text.trim()).filter(Boolean),
        cons: a.cons.map((c) => c.text.trim()).filter(Boolean),
        inputs: parsed.inputs,
        ...(a.nonFinancial.trim() ? { nonFinancial: a.nonFinancial.trim() } : { nonFinancial: undefined }),
      });
    }
    const prevUser = new Map(decision.assumptions.filter((a) => a.source === "user").map((a) => [a.id, a] as const));
    const next: MoneyDecision = {
      ...decision,
      alternatives,
      context: { ...decision.context, constraints: ws.constraints.map((c) => c.text.trim()).filter(Boolean) },
      assumptions: [
        ...ws.assumptions.filter((a) => a.text.trim()).map((a) => ({ ...(prevUser.get(a.id) ?? {}), id: a.id, text: a.text.trim(), source: "user" as const })),
        ...decision.assumptions.filter((a) => a.source !== "user"),
      ],
    };
    setSaving(true);
    try {
      const { outcome } = await saveDecision(uid, decision, next);
      setSaved(JSON.stringify(ws));
      toast.success(writeSavedMessage(outcome, "Comparison saved"));
    } catch (err) {
      logError("decisions.compare.save", err);
      toast.error(friendlyErrorMessage(err, "Couldn't save the comparison."));
    } finally {
      setSaving(false);
    }
  };

  const cards = ws.alternatives.map((a) => (
    <AlternativeWorkspaceCard
      key={a.id}
      state={a}
      chosenByYou={a.id === decision.selectedAlternativeId}
      width={columnWidth}
      onChange={(next) => setWs({ ...ws, alternatives: ws.alternatives.map((x) => (x.id === next.id ? next : x)) })}
    />
  ));

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.lg, paddingBottom: bottomPadding + keyboard }}>
        <Text style={muted}>
          Everything here is your own reasoning. Amounts are the numbers you entered; totals are simple sums of them. Spendly doesn't pick an option for you.
        </Text>

        {ws.alternatives.length === 0 ? (
          <Section title="No options yet">
            <Text style={muted}>Add the options you're weighing up first.</Text>
            <Button variant="tonal" onPress={() => router.replace(`/decisions/edit?id=${decision.id}` as Href)}>
              Add options
            </Button>
          </Section>
        ) : wide ? (
          <ScrollView horizontal contentContainerStyle={{ gap: theme.space.md }} showsHorizontalScrollIndicator>
            {cards}
          </ScrollView>
        ) : (
          <View style={{ gap: theme.space.md }}>{cards}</View>
        )}

        <Section title="Assumptions" subtitle="What you're taking as given — edit them any time">
          <DecisionListEditor label="Assumption" items={ws.assumptions} onChange={(assumptions) => setWs({ ...ws, assumptions })} addLabel="Add an assumption" placeholder="e.g. My salary stays the same this year" newId={newItemId} max={DECISION_LIMITS.assumptions} />
          {hasAssumptionChanges(changes) ? (
            <View style={{ gap: 2, marginTop: theme.space.sm }}>
              <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>Changed since you decided</Text>
              {changes!.changed.map((c) => (
                <Text key={c.after.id} style={muted}>
                  • Was "{c.before.text}{c.before.value !== undefined ? ` (${c.before.value})` : ""}", now "{c.after.text}{c.after.value !== undefined ? ` (${c.after.value})` : ""}"
                </Text>
              ))}
              {changes!.added.map((a) => (
                <Text key={a.id} style={muted}>• Added: {a.text}</Text>
              ))}
              {changes!.removed.map((a) => (
                <Text key={a.id} style={muted}>• No longer assumed: {a.text}</Text>
              ))}
              <Text style={muted}>What you assumed when you decided is kept unchanged.</Text>
            </View>
          ) : null}
        </Section>

        <Section title="Constraints" subtitle="Limits every option has to respect">
          <DecisionListEditor label="Constraint" items={ws.constraints} onChange={(constraints) => setWs({ ...ws, constraints })} addLabel="Add a constraint" placeholder="e.g. Keep 3 months of expenses aside" newId={newItemId} max={DECISION_LIMITS.listItems} />
        </Section>

        <Button variant="primary" size="lg" onPress={() => void save()} loading={saving} disabled={saving || !dirty}>
          {dirty ? "Save comparison" : "Saved"}
        </Button>
      </ScrollView>
    </PageShell>
  );
}


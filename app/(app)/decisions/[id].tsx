import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Check, Pencil, Scale } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Section } from "@/components/dashboard/primitives";
import { DecisionCommitmentsSection } from "@/components/decisions/DecisionCommitmentsSection";
import { DecisionOutcomeSection } from "@/components/decisions/DecisionOutcomeSection";
import { DecisionStatusBadge } from "@/components/decisions/DecisionStatusBadge";
import { LinkedRecordRow } from "@/components/decisions/LinkedRecordRow";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { useDecisionLinkSources } from "@/hooks/useDecisionLinkSources";
import { useDecisions } from "@/hooks/useDecisions";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { appDialog } from "@/lib/appDialog";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { deleteDecision, saveDecision } from "@/services/decisions/decisionStore";
import type { DecisionStatus } from "@/shared/types/decision";
import {
  canTransitionDecision,
  decisionCategoryLabel,
  decisionStatusLabel,
  transitionDecision,
} from "@/shared/utils/decisionModel";
import { getDecisionTemplate } from "@/shared/data/decisionTemplates";
import { removeLink, resolveDecisionLink } from "@/shared/utils/decisionLinks";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

const ACTION_LABELS: Partial<Record<DecisionStatus, string>> = {
  draft: "Back to draft",
  considering: "Mark as considering",
  decided: "Mark decided",
  tracking: "Start tracking",
  reviewed: "Mark reviewed",
  closed: "Close",
};

/**
 * One Money Decision (SPENDLY-363): what was decided and why, with the
 * lifecycle actions the current state allows. Later stories add comparison
 * (365), linked-record context (366), commitments (367) and outcomes (369).
 */
export default function DecisionDetailScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { user } = useAuth();
  const uid = user?.uid;
  const { byId, loading, error, retry } = useDecisions();
  const decision = byId.get(id);
  const bottomPadding = usePageListBottomPadding();
  const [busy, setBusy] = useState(false);
  const linkSources = useDecisionLinkSources();
  const currency = useDisplayCurrency();
  const resolvedLinks = useMemo(() => (decision ? decision.links.map((l) => resolveDecisionLink(l, linkSources)) : []), [decision, linkSources]);

  const header = (
    <PageHeader
      title="Decision"
      icon={<Scale size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/decisions" as Href))}
      rightElement={
        decision ? (
          <Button variant="tonal" size="icon" onPress={() => router.push(`/decisions/edit?id=${decision.id}` as Href)} accessibilityLabel="Edit decision">
            <Pencil size={18} color={theme.colors.primary} />
          </Button>
        ) : undefined
      }
    />
  );

  const transitions = useMemo(() => {
    if (!decision) return [];
    if (decision.status === "archived") return [{ to: decision.archivedFromStatus ?? "draft", label: "Restore" }];
    return (Object.keys(ACTION_LABELS) as DecisionStatus[])
      .filter((to) => canTransitionDecision(decision, to))
      .map((to) => ({
        to,
        // SPENDLY-369: moving back from a finished review is a reopen, and says so.
        label:
          decision.status === "reviewed" && to === "tracking"
            ? "Reopen review"
            : decision.status === "closed" && to === "reviewed"
              ? "Reopen"
              : ACTION_LABELS[to]!,
      }));
  }, [decision]);

  if (error) {
    return (
      <PageShell scrollable={false}>
        {header}
        <ErrorState title="Couldn't load this decision" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageShell>
    );
  }
  if (loading) {
    return (
      <PageShell scrollable={false}>
        {header}
        <LoadingState variant="card" count={3} />
      </PageShell>
    );
  }
  if (!decision) {
    return (
      <PageShell scrollable={false}>
        {header}
        <EmptyState title="This decision isn't here any more" description="It may have been deleted." primaryAction={{ label: "Back to decisions", onPress: () => router.replace("/decisions" as Href) }} />
      </PageShell>
    );
  }

  const move = async (to: DecisionStatus) => {
    if (!uid || busy) return;
    const r = transitionDecision(decision, to, Date.now());
    if (!r.ok) {
      toast.info(r.issues.includes("selection_missing") ? "Pick the option you chose first — tap Edit." : "That isn't possible from here.");
      return;
    }
    setBusy(true);
    try {
      const { outcome } = await saveDecision(uid, decision, r.decision);
      toast.success(writeSavedMessage(outcome, `Marked ${decisionStatusLabel(to).toLowerCase()}`));
    } catch (err) {
      logError("decisions.transition", err);
      toast.error(friendlyErrorMessage(err, "Couldn't update the decision."));
    } finally {
      setBusy(false);
    }
  };

  const saveChange = (next: typeof decision, message: string) => {
    if (!uid || busy) return;
    setBusy(true);
    saveDecision(uid, decision, next)
      .then(({ outcome }) => toast.success(writeSavedMessage(outcome, message)))
      .catch((err) => {
        logError("decisions.change", err);
        toast.error(friendlyErrorMessage(err, "Couldn't save that change."));
      })
      .finally(() => setBusy(false));
  };

  const unlink = (linkId: string, title: string) => {
    appDialog.alert("Remove this link?", `"${title}" stays in Spendly exactly as it is. Only the link from this decision is removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove link",
        onPress: () => {
          if (!uid) return;
          void saveDecision(uid, decision, { ...decision, links: removeLink(decision.links, linkId) })
            .then(({ outcome }) => toast.success(writeSavedMessage(outcome, "Link removed")))
            .catch((err) => {
              logError("decisions.unlink", err);
              toast.error(friendlyErrorMessage(err, "Couldn't remove the link."));
            });
        },
      },
    ]);
  };

  const remove = () => {
    appDialog.alert("Delete this decision?", "This removes the decision and its reasoning. Linked transactions and accounts are not affected.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (!uid) return;
          void deleteDecision(uid, decision)
            .then((outcome) => {
              toast.success(writeSavedMessage(outcome, "Decision deleted"));
              router.replace("/decisions" as Href);
            })
            .catch((err) => {
              logError("decisions.delete", err);
              toast.error(friendlyErrorMessage(err, "Couldn't delete the decision."));
            });
        },
      },
    ]);
  };

  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const chosenId = decision.selectedAlternativeId;

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.lg }}>
        <Section>
          <View style={{ gap: theme.space.sm }}>
            <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.lg }}>
              {decision.title}
            </Text>
            <View style={[styles.row, { gap: theme.space.sm }]}>
              <DecisionStatusBadge status={decision.status} />
              <Text style={muted}>{decisionCategoryLabel(decision.category)}</Text>
            </View>
            <Text style={muted}>
              Started {new Date(decision.createdAtMs).toISOString().slice(0, 10)}
              {decision.decidedAtMs ? ` · Decided ${new Date(decision.decidedAtMs).toISOString().slice(0, 10)}` : ""}
              {decision.reviewDate ? ` · Review on ${decision.reviewDate}` : ""}
            </Text>
            {decision.templateId ? <Text style={muted}>Started from the {getDecisionTemplate(decision.templateId, decision.templateVersion).label} template</Text> : null}
            {decision.status === "draft" ? (
              <Button variant="primary" onPress={() => router.push(`/decisions/edit?id=${decision.id}` as Href)}>
                Continue this draft
              </Button>
            ) : null}
          </View>
        </Section>

        {decision.context.situation || decision.context.goal || decision.context.constraints.length > 0 ? (
          <Section title="Context">
            <View style={{ gap: theme.space.xs }}>
              {decision.context.situation ? <Text style={body}>{decision.context.situation}</Text> : null}
              {decision.context.goal ? <Text style={body}>Goal: {decision.context.goal}</Text> : null}
              {decision.context.constraints.map((c, i) => (
                <Text key={i} style={body}>• {c}</Text>
              ))}
            </View>
          </Section>
        ) : null}

        {decision.assumptions.length > 0 ? (
          <Section title="Assumptions" subtitle="What you took as given">
            <View style={{ gap: theme.space.xs }}>
              {decision.assumptions.map((a) => (
                <Text key={a.id} style={body}>• {a.text}</Text>
              ))}
            </View>
          </Section>
        ) : null}

        {decision.alternatives.length > 0 ? (
          <Section title="Options considered">
            <View style={{ gap: theme.space.sm }}>
              {decision.alternatives.map((a) => (
                <View key={a.id} style={{ gap: 2 }} accessible accessibilityLabel={`${a.title}${a.id === chosenId ? ", your choice" : ""}`}>
                  <View style={[styles.row, { gap: theme.space.xs }]}>
                    {a.id === chosenId ? <Check size={16} color={theme.colors.success} /> : null}
                    <Text style={[body, { fontFamily: theme.fontFamily.semibold }]}>{a.title}</Text>
                    {a.id === chosenId ? <Text style={[muted, { color: theme.colors.success }]}>Your choice</Text> : null}
                  </View>
                  {a.notes ? <Text style={muted}>{a.notes}</Text> : null}
                  {a.pros.length || a.cons.length || a.inputs.length ? (
                    <Text style={muted}>
                      {[
                        a.pros.length ? `${a.pros.length} pro${a.pros.length === 1 ? "" : "s"}` : null,
                        a.cons.length ? `${a.cons.length} con${a.cons.length === 1 ? "" : "s"}` : null,
                        a.inputs.length ? `${a.inputs.length} amount${a.inputs.length === 1 ? "" : "s"} entered` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </View>
              ))}
              <Button variant="tonal" onPress={() => router.push(`/decisions/compare?id=${decision.id}` as Href)}>
                Compare options
              </Button>
            </View>
          </Section>
        ) : null}

        {decision.rationale || decision.confidence ? (
          <Section title="Why">
            <View style={{ gap: theme.space.xs }}>
              {decision.rationale ? <Text style={body}>{decision.rationale}</Text> : null}
              {decision.confidence ? <Text style={muted}>Your confidence: {decision.confidence} of 5</Text> : null}
            </View>
          </Section>
        ) : null}

        {decision.expected && !decision.decisionSnapshot ? (
          <Section title="What you expected" subtitle="Your expectation at the time">
            <View style={{ gap: theme.space.xs }}>
              {decision.expected.summary ? <Text style={body}>{decision.expected.summary}</Text> : null}
              {decision.expected.amount !== undefined ? <Text style={body}>{formatAmount(decision.expected.amount, "INR")} (your estimate)</Text> : null}
              {decision.expected.byDate ? <Text style={muted}>By {decision.expected.byDate}</Text> : null}
            </View>
          </Section>
        ) : null}

        {decision.links.length > 0 ? (
          <Section title="Linked records" subtitle="Read-only context from Spendly — never copied or counted in this decision">
            <View>
              {resolvedLinks.map((r) => (
                <LinkedRecordRow
                  key={r.link.id}
                  resolved={r}
                  currency={currency}
                  onOpen={(href) => router.push(href as Href)}
                  onRemove={() => unlink(r.link.id, r.title)}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {decision.status !== "draft" ? <DecisionCommitmentsSection decision={decision} busy={busy} onSave={saveChange} /> : null}

        <DecisionOutcomeSection decision={decision} busy={busy} onSave={saveChange} />

        {decision.decisionSnapshot ? (
          <Text style={muted}>
            Your reasoning was saved as it stood on {new Date(decision.decisionSnapshot.frozenAtMs).toISOString().slice(0, 10)}. Later edits don't change that record.
          </Text>
        ) : null}

        <View style={{ gap: theme.space.sm }}>
          {transitions.map((t) => (
            <Button key={t.to} variant={t.to === "decided" ? "primary" : "outline"} onPress={() => void move(t.to)} disabled={busy}>
              {t.label}
            </Button>
          ))}
          {decision.status !== "archived" ? (
            <Button variant="ghost" onPress={() => void move("archived")} disabled={busy}>
              Archive
            </Button>
          ) : null}
          <Button variant="ghost" onPress={remove} disabled={busy}>
            Delete
          </Button>
        </View>
      </ScrollView>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
});

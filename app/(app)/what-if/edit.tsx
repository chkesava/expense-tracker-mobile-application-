import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { FlaskConical, Plus, Trash2 } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { ChipRow } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WhatIfChangeSheet } from "@/components/whatIf/WhatIfChangeSheet";
import { WhatIfResults } from "@/components/whatIf/WhatIfResults";
import { useWhatIfBaseline } from "@/hooks/useWhatIfBaseline";
import { useWhatIfScenarios } from "@/hooks/useWhatIfScenarios";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { createWhatIfScenario, updateWhatIfScenario } from "@/services/whatIf/whatIfScenarioStore";
import type { WhatIfScenarioDefinition } from "@/shared/types/whatIf";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { dateLabel } from "@/shared/utils/runwayView";
import {
  buildWhatIfChange,
  newWhatIfDraft,
  WHAT_IF_CHANGE_INFO,
  WHAT_IF_TEMPLATES,
  whatIfChangeGroups,
  whatIfChangeId,
  withoutWhatIfChange,
  withWhatIfChange,
  type WhatIfChangeForm,
  type WhatIfChangeGroup,
} from "@/shared/utils/whatIfDraft";
import { toWhatIfScenarioDefinition, WHAT_IF_SCENARIO_NAME_MAX } from "@/shared/utils/whatIfScenarios";
import { runWhatIf } from "@/shared/utils/whatIfView";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

type Draft = Omit<WhatIfScenarioDefinition, "id">;
const HORIZONS = ["3", "6", "12", "24"] as const;

const randomSuffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** One readable line per change: "₹10,000 a month from 1 Nov", "EMI ₹8,792 for 12 months". */
function changeSummary(group: WhatIfChangeGroup, fmt: (n: number) => string): string {
  if (group.type === "loan") {
    const emi = group.assumptions.find((a) => a.code.endsWith(":emi"))?.value;
    const tenure = group.assumptions.find((a) => a.code.endsWith(":tenure"))?.value;
    const funding = group.adjustments.find((a) => a.id.endsWith(":funding"));
    return `${funding ? fmt(funding.amount) : "Loan"} · EMI ${typeof emi === "number" ? fmt(emi) : "—"} for ${tenure ?? "?"} months`;
  }
  const a = group.adjustments[0];
  if (!a) return "";
  const sign = a.direction === "in" ? "+" : "−";
  if (a.schedule.kind === "once") return `${sign}${fmt(a.amount)} on ${dateLabel(a.schedule.date)}`;
  if (a.schedule.kind === "monthly") return `${sign}${fmt(a.amount)} a month from ${dateLabel(a.schedule.firstDate)}`;
  return `${sign}${fmt(a.amount)} every ${a.schedule.intervalDays} days`;
}

/**
 * Create or edit a What-If scenario (SPENDLY-387). `?id=` edits a saved
 * scenario; `?template=` starts a new one from an idea. The preview runs the
 * real engine on every change; saving writes only the scenario document.
 */
export default function WhatIfEditScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const bottomPadding = usePageListBottomPadding();
  const params = useLocalSearchParams<{ id?: string; template?: string }>();
  const { uid, baseline, threshold, today, displayCurrency, hasAccounts, loading: baseLoading, error: baseError, retry: baseRetry } = useWhatIfBaseline();
  const { scenarios, loading: listLoading, error: listError, retry: listRetry } = useWhatIfScenarios();
  const fmt = (n: number) => formatAmount(n, displayCurrency);

  const existing = params.id ? scenarios.find((s) => s.id === params.id) ?? null : null;
  const template = params.template ? WHAT_IF_TEMPLATES.find((t) => t.id === params.template) ?? null : null;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; initial: Partial<WhatIfChangeForm> | null }>({ open: false, initial: null });
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const seeded = useRef(false);

  // Seed once: from the saved scenario, or a fresh draft (opening the template's change sheet).
  useEffect(() => {
    if (seeded.current || baseLoading || listLoading) return;
    if (params.id && !existing) return;
    seeded.current = true;
    if (existing) {
      const { id: _id, ...definition } = toWhatIfScenarioDefinition(existing);
      void _id;
      setDraft(definition);
    } else {
      setDraft(newWhatIfDraft({ name: template?.title ?? "My scenario", reference: baseline.reference }));
      if (template) setSheet({ open: true, initial: template.form });
    }
  }, [baseLoading, listLoading, existing, params.id, template, baseline.reference]);

  const groups = useMemo(() => (draft ? whatIfChangeGroups(draft) : []), [draft]);
  const run = useMemo(
    () => (draft && groups.length && hasAccounts ? runWhatIf({ scenario: draft, baseline, threshold }) : null),
    [draft, groups.length, hasAccounts, baseline, threshold]
  );

  const addChange = (form: WhatIfChangeForm) => {
    if (!draft) return;
    const id = whatIfChangeId(form.type, randomSuffix());
    const built = buildWhatIfChange(id, form, today);
    if (built.issues.length) {
      toast.error(built.issues[0]);
      return;
    }
    setDraft(withWhatIfChange(draft, id, built));
    setSheet({ open: false, initial: null });
  };

  const save = async () => {
    if (!draft || !uid) return;
    const name = draft.name.trim();
    if (!name) {
      setNameError("Give the scenario a name.");
      return;
    }
    if (!groups.length) {
      toast.error("Add at least one change first.");
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        const outcome = await updateWhatIfScenario(uid, existing, { ...draft, name });
        if (outcome) toast.success(writeSavedMessage(outcome, "Scenario updated"));
        router.back();
      } else {
        const created = await createWhatIfScenario(uid, { ...draft, name, reference: baseline.reference });
        if (created) {
          toast.success(writeSavedMessage(created.outcome, "Scenario saved"));
          router.replace(`/what-if/${encodeURIComponent(created.id)}` as Href);
        }
      }
    } catch (e) {
      logError("whatIf.save", e);
      toast.error(friendlyErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const h2 = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md };
  const card = {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: theme.space.sm,
  };

  const error = baseError ?? listError;
  let body;
  if (error) {
    body = <ErrorState title="Couldn't open What If" description={error.message} onRetry={error.retryable ? () => { baseRetry(); listRetry(); } : undefined} />;
  } else if (!draft) {
    body = params.id && !listLoading && !existing ? (
      <ErrorState title="Scenario not found" description="It may have been deleted on another device." onRetry={() => router.replace("/what-if" as Href)} />
    ) : (
      <LoadingState variant="list" count={4} />
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.lg }} keyboardShouldPersistTaps="handled">
        <View style={card}>
          <Input
            label="Scenario name"
            value={draft.name}
            onChangeText={(name) => {
              setNameError(null);
              setDraft({ ...draft, name });
            }}
            maxLength={WHAT_IF_SCENARIO_NAME_MAX}
            error={nameError ?? undefined}
          />
          <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>Look ahead</Text>
          <ChipRow<(typeof HORIZONS)[number]>
            options={HORIZONS.map((h) => ({ value: h, label: `${h} months` }))}
            selected={(HORIZONS.find((h) => Number(h) === draft.durationMonths) ?? "12") as (typeof HORIZONS)[number]}
            onSelect={(h) => setDraft({ ...draft, durationMonths: Number(h) })}
          />
        </View>

        <View style={card}>
          <Text style={h2} accessibilityRole="header">Changes</Text>
          {groups.length === 0 ? <Text style={muted}>Add what you want to try — a raise, a purchase, a loan, a saving habit.</Text> : null}
          {groups.map((g) => (
            <View key={g.id} style={[styles.changeRow, { borderBottomColor: theme.colors.border }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[text, { fontFamily: theme.fontFamily.semibold }]} numberOfLines={1}>{g.label}</Text>
                <Text style={muted}>{`${g.type ? WHAT_IF_CHANGE_INFO[g.type].title : "Change"} · ${changeSummary(g, fmt)}`}</Text>
                {g.assumptions.filter((a) => !a.code.endsWith(":emi")).map((a) => (
                  <Text key={a.code} style={muted}>{`${a.label.split(": ").pop()}: ${a.value} (your assumption)`}</Text>
                ))}
              </View>
              <Pressable
                onPress={() => setDraft(withoutWhatIfChange(draft, g.id))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${g.label}`}
                hitSlop={8}
                style={styles.iconButton}
              >
                <Trash2 size={18} color={theme.colors.destructive} />
              </Pressable>
            </View>
          ))}
          <Button variant="outline" onPress={() => setSheet({ open: true, initial: null })} accessibilityLabel="Add a change">
            <View style={styles.rowStart}>
              <Plus size={18} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }}>Add a change</Text>
            </View>
          </Button>
        </View>

        {!hasAccounts ? (
          <View style={[card, { backgroundColor: surfaces.tile }]}>
            <Text style={text}>Add a bank, cash or wallet account so What If has a starting balance.</Text>
          </View>
        ) : run ? (
          <View style={{ gap: theme.space.sm }}>
            <Text style={h2} accessibilityRole="header">Preview</Text>
            <WhatIfResults run={run} fmt={fmt} compact />
          </View>
        ) : null}

        <Button onPress={() => void save()} loading={saving} disabled={saving || !groups.length} accessibilityLabel={existing ? "Save changes to scenario" : "Save scenario"}>
          {existing ? "Save changes" : "Save scenario"}
        </Button>
        <Text style={[muted, { textAlign: "center" }]}>Saving stores only your assumptions. Your real records stay exactly as they are.</Text>
      </ScrollView>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      <PageHeader
        title={existing ? "Edit scenario" : "New scenario"}
        subtitle="What If"
        icon={<FlaskConical size={20} color={theme.colors.primary} />}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/what-if" as Href))}
      />
      {body}
      <WhatIfChangeSheet
        isOpen={sheet.open}
        onClose={() => setSheet({ open: false, initial: null })}
        today={today}
        initial={sheet.initial}
        onAdd={addChange}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  changeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
});

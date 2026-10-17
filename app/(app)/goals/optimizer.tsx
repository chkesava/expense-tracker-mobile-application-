import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, FolderOpen, Scale, Target, Wallet } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { DataRow, HeroSection, Pill, Section, type Tone } from "@/components/dashboard/primitives";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/common/Modal";
import { GoalFundingPlansSheet } from "@/components/goals/GoalFundingPlansSheet";
import { GoalPlanInputsSheet } from "@/components/goals/GoalPlanInputsSheet";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { RowSwitch } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WhatIfEntryRow } from "@/components/whatIf/WhatIfEntryRow";
import { WhatIfScenarioPickerSheet } from "@/components/whatIf/WhatIfScenarioPickerSheet";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useGoalFunding } from "@/hooks/useGoalFunding";
import { useGoalFundingPlans } from "@/hooks/useGoalFundingPlans";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage, type WriteOutcome } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import {
  deleteGoalFundingPlan,
  duplicateGoalFundingPlan,
  renameGoalFundingPlan,
  saveGoalFundingPlan,
  setGoalFundingPlanArchived,
} from "@/services/goals/goalFundingPlanStore";
import { GOAL_FUNDING_MODES, type GoalFundingMode, type GoalPlanInput } from "@/shared/types/goalFunding";
import { inputsForGoals } from "@/shared/utils/goalFundingModel";
import { runGoalFundingScenario } from "@/shared/utils/goalFundingOptimizer";
import { GOAL_CHANGE_LABELS, goalFundingPlanDoc, goalsChangedSince, validatePlanName, type GoalFundingPlan } from "@/shared/utils/goalFundingPlans";
import {
  GOAL_FUNDING_MODE_INFO,
  GOAL_FUNDING_STATUS_LABELS,
  assumptionLines,
  capacitySourceLabel,
  comparisonText,
  goalRowAccessibilityLabel,
  monthsPhrase,
  tradeOffLines,
  whyLines,
} from "@/shared/utils/goalFundingView";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Goal Funding Optimizer (SPENDLY-218): compare your current goal plan with a
 * scenario. Planning only — nothing here is ever applied to your goals or
 * moves money. Plans can be saved and reopened (SPENDLY-220).
 */
export default function GoalFundingScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const currency = useDisplayCurrency();
  // SPENDLY-546: ghost-aware; every optimizer amount used to show in ghost mode.
  const fmt = useGhostMoney(currency);
  const { settings } = useSettings();
  const bottomPadding = usePageListBottomPadding();

  const [mode, setMode] = useState<GoalFundingMode>("balanced");
  const [plannedText, setPlannedText] = useState("");
  const [allowOver, setAllowOver] = useState(false);
  const [inputs, setInputs] = useState<GoalPlanInput[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  
  // SPENDLY-219: What-If scenario integration
  const [selectedWhatIf, setSelectedWhatIf] = useState<import("@/shared/utils/whatIfScenarios").WhatIfScenario | null>(null);
  const [whatIfPickerOpen, setWhatIfPickerOpen] = useState(false);

  const planned = plannedText.trim() ? Number(plannedText.replace(/,/g, "")) : null;
  const { today, goals, capacity, historyMonths, loading, error } = useGoalFunding({
    plannedMonthly: planned !== null && Number.isFinite(planned) ? planned : null,
    scenario: selectedWhatIf,
  });

  const allInputs = useMemo(() => inputsForGoals(goals, inputs), [goals, inputs]);

  // SPENDLY-220: saved plans. Results are always recalculated from today's goals.
  const { uid, plans } = useGoalFundingPlans();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [namePrompt, setNamePrompt] = useState<{ title: string; value: string; action: (name: string) => Promise<void> } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const openPlan = plans.find((p) => p.id === openPlanId) ?? null;
  const changes = useMemo(() => (openPlan ? goalsChangedSince(openPlan.goalSnapshot, goals) : []), [openPlan, goals]);

  const write = async <T,>(work: () => Promise<T>, message: (r: T) => WriteOutcome | null | undefined, text: string) => {
    try {
      const r = await work();
      const outcome = message(r);
      if (outcome) toast.success(writeSavedMessage(outcome, text));
      return r;
    } catch (e) {
      logError("goals.fundingPlan", e);
      toast.error(friendlyErrorMessage(e));
      return null;
    }
  };
  const currentDoc = (name: string, existing?: GoalFundingPlan) =>
    goalFundingPlanDoc({
      name,
      mode,
      plannedMonthly: planned !== null && Number.isFinite(planned) ? planned : null,
      allowOverAllocation: allowOver,
      inputs: allInputs,
      goals,
      nowMs: Date.now(),
      existing,
    });
  const loadPlan = (p: GoalFundingPlan) => {
    setMode(p.mode);
    setPlannedText(p.plannedMonthly !== undefined ? String(p.plannedMonthly) : "");
    setAllowOver(p.allowOverAllocation);
    setInputs(p.inputs);
    setOpenPlanId(p.id);
    setPlansOpen(false);
  };
  const askName = (title: string, value: string, action: (name: string) => Promise<void>) => {
    setNameError(null);
    setNamePrompt({ title, value, action });
  };
  const result = useMemo(
    () => runGoalFundingScenario({ goals, today, scenario: { mode, monthlyPool: capacity.monthly, allowOverAllocation: allowOver, inputs: allInputs } }),
    [goals, today, mode, capacity.monthly, allowOver, allInputs]
  );

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const figure = (value: string) => (
    <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm, fontVariant: ["tabular-nums"] }}>
      {value}
    </Text>
  );
  const statusTone = (status: string): Tone =>
    status === "behind" || status === "not_fundable" || status === "target_date_passed" ? "negative" : status === "on_track" || status === "ahead" || status === "funded" ? "positive" : "muted";

  const header = (
    <PageHeader
      title="Goal funding plan"
      subtitle="Planning only — your goals don't change"
      icon={<Target size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href))}
      rightElement={
        <Pressable onPress={() => setPlansOpen(true)} accessibilityRole="button" accessibilityLabel="Saved plans" hitSlop={8} style={{ padding: theme.space.sm }}>
          <FolderOpen size={20} color={theme.colors.foreground} />
        </Pressable>
      }
    />
  );

  let body;
  if (error) {
    body = <ErrorState title="Couldn't load your goals" description={error.message} onRetry={undefined} />;
  } else if (loading) {
    body = (
      <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
        <DashboardSkeleton variant="hero" />
        <DashboardSkeleton variant="section" rows={3} />
      </View>
    );
  } else if (!goals.length) {
    body = (
      <EmptyState
        illustration="expenses"
        title="Add a goal to plan its funding"
        description="Set a target and a date, and this screen shows what each goal needs each month and how your goals share what you can save."
        primaryAction={{ label: "Add a goal", onPress: () => router.push("/settings/money" as Href) }}
      />
    );
  } else {
    const editingGoal = goals.find((g) => g.goalId === editing) ?? null;
    const whyGoal = result.goals.find((g) => g.goalId === why) ?? null;
    body = (
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.lg }}>
        <Section
          title={openPlan ? openPlan.name : "Unsaved plan"}
          subtitle={openPlan ? "Results are recalculated from your goals as they are today." : "Save it to come back to it later."}
          badge={<Pill label={openPlan ? "Saved plan" : "Not saved"} tone={openPlan ? "accent" : "muted"} />}
          contentStyle={{ gap: theme.space.sm }}
        >
          {changes.length ? (
            <View accessibilityLiveRegion="polite">
              <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>Goals changed since this plan was saved:</Text>
              {changes.map((c) => (
                <Text key={c.goalId} style={muted}>{`• ${c.name}: ${c.kinds.map((k) => GOAL_CHANGE_LABELS[k]).join(", ")}`}</Text>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
            {openPlan ? (
              <Button
                size="sm"
                onPress={() => void write(() => saveGoalFundingPlan(uid!, currentDoc(openPlan.name, openPlan), openPlan.id), (r) => r?.outcome, "Plan updated")}
              >
                Update plan
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={openPlan ? "outline" : "primary"}
              onPress={() =>
                askName(openPlan ? "Save as a new plan" : "Save plan", openPlan ? `${openPlan.name} (copy)` : "", async (name) => {
                  const r = await write(() => saveGoalFundingPlan(uid!, currentDoc(name)), (x) => x?.outcome, "Plan saved");
                  if (r) setOpenPlanId(r.id);
                })
              }
            >
              {openPlan ? "Save as new" : "Save plan"}
            </Button>
          </View>
        </Section>
        <HeroSection variant="deep" title="Available for goals" subtitle={`Each month · ${capacitySourceLabel(capacity)}`} icon={<Wallet size={16} color={theme.colors.primary} />}>
          <View style={{ gap: theme.space.sm }}>
            <Text
              style={{
                color: capacity.status === "negative" ? theme.colors.destructive : theme.colors.foreground,
                fontFamily: theme.fontFamily.bold,
                fontSize: theme.typography.xxl,
                fontVariant: ["tabular-nums"],
              }}
            >
              {capacity.monthly === null ? "Not known yet" : fmt(capacity.monthly)}
            </Text>
            {capacity.parts.length ? (
              <View>
                {capacity.parts.map((p, i) => (
                  <View
                    key={p.key}
                    accessible
                    accessibilityLabel={`${p.label}: ${fmt(p.monthly)}`}
                    style={[styles.part, i < capacity.parts.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surfaces.divider }]}
                  >
                    <Text style={[text, { flex: 1 }]}>{p.label}</Text>
                    {figure(fmt(p.monthly))}
                  </View>
                ))}
              </View>
            ) : null}
            {capacity.alreadyToSavingsMonthly ? <Text style={muted}>{fmt(capacity.alreadyToSavingsMonthly)} a month already goes to savings — it's part of this amount, not extra.</Text> : null}
            {capacity.commitmentsWithoutAmount.length ? <Text style={muted}>{capacity.commitmentsWithoutAmount.length} upcoming commitment(s) have no amount and aren't included.</Text> : null}
            {historyMonths < 3 && !capacity.usesPlannedOverride ? <Text style={muted}>Based on {historyMonths} month(s) of records, so this may move a lot.</Text> : null}
            <Input label="Use my own monthly amount (optional)" value={plannedText} onChangeText={setPlannedText} keyboardType="numeric" helperText="Replaces the figure above for this plan only." />
          </View>
        </HeroSection>

        <Section title="How to share it" icon={<Scale size={16} color={theme.colors.primary} />} iconTint={surfaces.wash(theme.colors.primary)} contentStyle={{ gap: theme.space.sm }}>
          <View style={styles.chips}>
            {GOAL_FUNDING_MODES.map((m) => (
              <Chip
                key={m}
                label={GOAL_FUNDING_MODE_INFO[m].label}
                selected={mode === m}
                appearance="outline"
                accessibilityRole="tab"
                haptic={mode !== m}
                onPress={() => setMode(m)}
              />
            ))}
          </View>
          <Text style={muted}>{GOAL_FUNDING_MODE_INFO[mode].explanation}</Text>
          <RowSwitch
            label="Allow planning beyond what's available"
            description="A what-if only — shows the full amounts even if they're more than you have."
            value={allowOver}
            onValueChange={setAllowOver}
          />
        </Section>

        <Section title="This scenario">
          <View accessible accessibilityLabel={`Goals need ${fmt(result.totalRequired)} a month. Scenario allocates ${fmt(result.totalAllocated)}. ${result.unallocated === null ? "" : `Unallocated ${fmt(result.unallocated)}.`}`}>
            <DataRow divider title="Goals need each month" value={figure(fmt(result.totalRequired))} />
            <DataRow divider={result.unallocated !== null} title="Scenario allocates" value={figure(fmt(result.totalAllocated))} />
            {result.unallocated !== null ? (
              <DataRow
                title={result.unallocated < 0 ? "Over what's available (what-if)" : "Not allocated"}
                value={
                  <Text style={{ color: result.unallocated < 0 ? theme.colors.destructive : theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.sm, fontVariant: ["tabular-nums"] }}>
                    {fmt(Math.abs(result.unallocated))}
                  </Text>
                }
              />
            ) : null}
          </View>
        </Section>

        <Section title="Your goals" subtitle="Your current plan and this scenario side by side. Tap a goal to see why.">
          {result.goals.map((r, i) => (
            <View key={r.goalId} style={[styles.goal, i < result.goals.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surfaces.divider }]}>
              <Pressable onPress={() => setWhy(r.goalId)} accessibilityRole="button" accessibilityLabel={goalRowAccessibilityLabel(r, fmt)} accessibilityHint="Shows why" style={{ gap: 4 }}>
                <View style={styles.rowBetween}>
                  <Text style={[text, { fontFamily: theme.fontFamily.semibold, flex: 1 }]} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Pill label={GOAL_FUNDING_STATUS_LABELS[r.status]} tone={statusTone(r.status)} />
                  <ChevronRight size={14} color={theme.colors.mutedForeground} />
                </View>
                <Text style={muted}>{comparisonText(r, fmt)}</Text>
                {r.requiredMonthly !== null ? <Text style={muted}>Needs {fmt(r.requiredMonthly)} a month to finish on time</Text> : null}
                {r.projectedCompletion ? (
                  <Text style={muted}>
                    Finishes {formatDisplayDate(r.projectedCompletion, settings.dateFormat)}
                    {r.monthsAheadOfTarget !== null ? ` · ${monthsPhrase(r.monthsAheadOfTarget)}` : ""}
                  </Text>
                ) : null}
              </Pressable>
              <Pressable onPress={() => setEditing(r.goalId)} accessibilityRole="button" accessibilityLabel={`Plan settings for ${r.name}`} style={{ minHeight: 36, justifyContent: "center", alignSelf: "flex-start" }}>
                <Text style={[muted, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>Plan settings</Text>
              </Pressable>
            </View>
          ))}
        </Section>

        {result.tradeOffs.length ? (
          <Section title="Trade-offs" contentStyle={{ gap: 4 }}>
            {tradeOffLines(result, fmt).map((l) => (
              <Text key={l} style={muted}>{`• ${l}`}</Text>
            ))}
          </Section>
        ) : null}

        <View style={{ gap: theme.space.md }}>
          <WhatIfEntryRow subtitle="Test a monthly saving against your whole budget" template="goal" />
          <Button variant="outline" onPress={() => setWhatIfPickerOpen(true)}>
            {selectedWhatIf ? `Testing scenario: ${selectedWhatIf.name}` : "Test a What-If scenario"}
          </Button>
        </View>

        <Section title="Assumptions" contentStyle={{ gap: 4 }}>
          {assumptionLines(result).map((l) => (
            <Text key={l} style={muted}>{`• ${l}`}</Text>
          ))}
        </Section>

        <WhatIfScenarioPickerSheet
          isOpen={whatIfPickerOpen}
          onClose={() => setWhatIfPickerOpen(false)}
          selectedId={selectedWhatIf?.id ?? null}
          onSelect={(s) => {
            setSelectedWhatIf(s);
            setWhatIfPickerOpen(false);
          }}
        />

        <GoalPlanInputsSheet
          isOpen={editing !== null}
          goal={editingGoal}
          input={allInputs.find((i) => i.goalId === editing) ?? null}
          goalCount={goals.length}
          takenPriorities={allInputs.filter((i) => i.goalId !== editing && i.priority !== undefined).map((i) => i.priority!)}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setInputs((prev) => [...prev.filter((i) => i.goalId !== next.goalId), next]);
            setEditing(null);
          }}
        />
        <GoalFundingPlansSheet
          isOpen={plansOpen}
          plans={plans}
          openPlanId={openPlanId}
          onClose={() => setPlansOpen(false)}
          onOpen={loadPlan}
          onRename={(p) => askName("Rename plan", p.name, async (name) => void (await write(() => renameGoalFundingPlan(uid!, p.id, name), (x) => x, "Plan renamed")))}
          onDuplicate={(p) => askName("Duplicate plan", `${p.name} (copy)`, async (name) => void (await write(() => duplicateGoalFundingPlan(uid!, p, name), (x) => x?.outcome, "Plan duplicated")))}
          onArchive={(p, archived) => void write(() => setGoalFundingPlanArchived(uid!, p.id, archived), (x) => x, archived ? "Plan archived" : "Plan restored")}
          onDelete={(p) => {
            if (p.id === openPlanId) setOpenPlanId(null);
            void write(() => deleteGoalFundingPlan(uid!, p.id), (x) => x, "Plan deleted");
          }}
        />
        <Modal isOpen={namePrompt !== null} onClose={() => setNamePrompt(null)} title={namePrompt?.title} density="compact">
          <View style={{ gap: theme.space.md }}>
            <Input
              label="Plan name"
              value={namePrompt?.value ?? ""}
              onChangeText={(v) => setNamePrompt((p) => (p ? { ...p, value: v } : p))}
              error={nameError ?? undefined}
              maxLength={80}
            />
            <Button
              onPress={async () => {
                if (!namePrompt || !uid) return;
                const issue = validatePlanName(namePrompt.value);
                if (issue) {
                  setNameError(issue);
                  return;
                }
                const action = namePrompt.action;
                const value = namePrompt.value.trim();
                setNamePrompt(null);
                await action(value);
              }}
            >
              Save
            </Button>
          </View>
        </Modal>
        <Modal isOpen={whyGoal !== null} onClose={() => setWhy(null)} title={whyGoal ? `Why: ${whyGoal.name}` : undefined} density="compact">
          <View style={{ gap: theme.space.sm }}>
            {whyGoal ? whyLines(whyGoal, mode, fmt).map((l) => <Text key={l} style={text}>{`• ${l}`}</Text>) : null}
          </View>
        </Modal>
      </ScrollView>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      {body}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  goal: { paddingVertical: 10, gap: 2 },
  part: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingVertical: 8 },
});

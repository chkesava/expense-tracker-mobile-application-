import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Target } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Modal } from "@/components/common/Modal";
import { GoalPlanInputsSheet } from "@/components/goals/GoalPlanInputsSheet";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { ChipRow, RowSwitch } from "@/components/settings/SettingsControls";
import { Input } from "@/components/ui/Input";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGoalFunding } from "@/hooks/useGoalFunding";
import { GOAL_FUNDING_MODES, type GoalFundingMode, type GoalPlanInput } from "@/shared/types/goalFunding";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { inputsForGoals } from "@/shared/utils/goalFundingModel";
import { runGoalFundingScenario } from "@/shared/utils/goalFundingOptimizer";
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
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Goal Funding Optimizer (SPENDLY-218): compare your current goal plan with a
 * scenario. Planning only — nothing here is ever applied to your goals or
 * moves money. Saving plans arrives with SPENDLY-220.
 */
export default function GoalFundingScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const currency = useDisplayCurrency();
  const fmt = useCallback((n: number) => formatAmount(n, currency), [currency]);
  const bottomPadding = usePageListBottomPadding();

  const [mode, setMode] = useState<GoalFundingMode>("balanced");
  const [plannedText, setPlannedText] = useState("");
  const [allowOver, setAllowOver] = useState(false);
  const [inputs, setInputs] = useState<GoalPlanInput[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  const planned = plannedText.trim() ? Number(plannedText.replace(/,/g, "")) : null;
  const { today, goals, capacity, historyMonths, loading, error } = useGoalFunding({ plannedMonthly: planned !== null && Number.isFinite(planned) ? planned : null });

  const allInputs = useMemo(() => inputsForGoals(goals, inputs), [goals, inputs]);
  const result = useMemo(
    () => runGoalFundingScenario({ goals, today, scenario: { mode, monthlyPool: capacity.monthly, allowOverAllocation: allowOver, inputs: allInputs } }),
    [goals, today, mode, capacity.monthly, allowOver, allInputs]
  );

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const h2 = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md };
  const card = { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.space.md, gap: theme.space.sm, backgroundColor: theme.colors.card };

  const header = (
    <PageHeader
      title="Goal funding plan"
      subtitle="Planning only — your goals don't change"
      icon={<Target size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href))}
    />
  );

  let body;
  if (error) {
    body = <ErrorState title="Couldn't load your goals" description={error.message} onRetry={undefined} />;
  } else if (loading) {
    body = <LoadingState variant="list" count={4} />;
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
        <View style={card}>
          <View style={styles.rowBetween}>
            <Text style={muted}>Available each month for goals</Text>
            <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>{capacitySourceLabel(capacity).toUpperCase()}</Text>
          </View>
          <Text style={{ color: capacity.status === "negative" ? theme.colors.destructive : theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.xl }}>
            {capacity.monthly === null ? "Not known yet" : fmt(capacity.monthly)}
          </Text>
          {capacity.parts.map((p) => (
            <View key={p.key} style={styles.rowBetween} accessible accessibilityLabel={`${p.label}: ${fmt(p.monthly)}`}>
              <Text style={[muted, { flex: 1 }]}>{p.label}</Text>
              <Text style={text}>{fmt(p.monthly)}</Text>
            </View>
          ))}
          {capacity.alreadyToSavingsMonthly ? <Text style={muted}>{fmt(capacity.alreadyToSavingsMonthly)} a month already goes to savings — it's part of this amount, not extra.</Text> : null}
          {capacity.commitmentsWithoutAmount.length ? <Text style={muted}>{capacity.commitmentsWithoutAmount.length} upcoming commitment(s) have no amount and aren't included.</Text> : null}
          {historyMonths < 3 && !capacity.usesPlannedOverride ? <Text style={muted}>Based on {historyMonths} month(s) of records, so this may move a lot.</Text> : null}
          <Input label="Use my own monthly amount (optional)" value={plannedText} onChangeText={setPlannedText} keyboardType="numeric" helperText="Replaces the figure above for this plan only." />
        </View>

        <View style={{ gap: theme.space.xs }}>
          <Text style={h2} accessibilityRole="header">
            How to share it
          </Text>
          <ChipRow<GoalFundingMode> options={GOAL_FUNDING_MODES.map((m) => ({ value: m, label: GOAL_FUNDING_MODE_INFO[m].label }))} selected={mode} onSelect={setMode} />
          <Text style={muted}>{GOAL_FUNDING_MODE_INFO[mode].explanation}</Text>
          <RowSwitch
            label="Allow planning beyond what's available"
            description="A what-if only — shows the full amounts even if they're more than you have."
            value={allowOver}
            onValueChange={setAllowOver}
          />
        </View>

        <View style={[card, { backgroundColor: surfaces.tile }]} accessible accessibilityLabel={`Goals need ${fmt(result.totalRequired)} a month. Scenario allocates ${fmt(result.totalAllocated)}. ${result.unallocated === null ? "" : `Unallocated ${fmt(result.unallocated)}.`}`}>
          <View style={styles.rowBetween}>
            <Text style={muted}>Goals need each month</Text>
            <Text style={text}>{fmt(result.totalRequired)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={muted}>Scenario allocates</Text>
            <Text style={text}>{fmt(result.totalAllocated)}</Text>
          </View>
          {result.unallocated !== null ? (
            <View style={styles.rowBetween}>
              <Text style={muted}>{result.unallocated < 0 ? "Over what's available (what-if)" : "Not allocated"}</Text>
              <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>{fmt(Math.abs(result.unallocated))}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: theme.space.sm }}>
          <Text style={h2} accessibilityRole="header">
            Your goals
          </Text>
          <Text style={muted}>Each row shows your current plan and this scenario side by side. Tap a goal to see why.</Text>
          {result.goals.map((r) => (
            <View key={r.goalId} style={card}>
              <Pressable onPress={() => setWhy(r.goalId)} accessibilityRole="button" accessibilityLabel={goalRowAccessibilityLabel(r, fmt)} accessibilityHint="Shows why" style={{ gap: 4 }}>
                <View style={styles.rowBetween}>
                  <Text style={[text, { fontFamily: theme.fontFamily.semibold, flex: 1 }]}>{r.name}</Text>
                  <Text style={[muted, { fontFamily: theme.fontFamily.semibold, color: r.status === "behind" || r.status === "not_fundable" ? theme.colors.destructive : theme.colors.mutedForeground }]}>
                    {GOAL_FUNDING_STATUS_LABELS[r.status]}
                  </Text>
                  <ChevronRight size={14} color={theme.colors.mutedForeground} />
                </View>
                <Text style={muted}>{comparisonText(r, fmt)}</Text>
                {r.requiredMonthly !== null ? <Text style={muted}>Needs {fmt(r.requiredMonthly)} a month to finish on time</Text> : null}
                {r.projectedCompletion ? (
                  <Text style={muted}>
                    Finishes {r.projectedCompletion}
                    {r.monthsAheadOfTarget !== null ? ` · ${monthsPhrase(r.monthsAheadOfTarget)}` : ""}
                  </Text>
                ) : null}
              </Pressable>
              <Pressable onPress={() => setEditing(r.goalId)} accessibilityRole="button" accessibilityLabel={`Plan settings for ${r.name}`} style={{ minHeight: 36, justifyContent: "center" }}>
                <Text style={[muted, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>Plan settings</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {result.tradeOffs.length ? (
          <View style={{ gap: theme.space.xs }}>
            <Text style={h2} accessibilityRole="header">
              Trade-offs
            </Text>
            {tradeOffLines(result, fmt).map((l) => (
              <Text key={l} style={muted}>{`• ${l}`}</Text>
            ))}
          </View>
        ) : null}

        <View style={{ gap: theme.space.xs }}>
          <Text style={h2} accessibilityRole="header">
            Assumptions
          </Text>
          {assumptionLines(result).map((l) => (
            <Text key={l} style={muted}>{`• ${l}`}</Text>
          ))}
        </View>

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
});

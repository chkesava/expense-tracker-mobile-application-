import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { PartyPopper, Pencil, Target } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { Section } from "@/components/dashboard/primitives";
import { GoalFormSheet, type GoalFormSubmit } from "@/components/goals/GoalFormSheet";
import { GoalIcon } from "@/components/goals/GoalIcon";
import { GoalTargetSheet } from "@/components/goals/GoalTargetSheet";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useSaveGoalsEnabled } from "@/hooks/useSaveGoalsEnabled";
import { appDialog } from "@/lib/appDialog";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { actionTarget, availableGoalActions, type GoalAction } from "@/shared/utils/goalLifecycle";
import { GOAL_ACTION_DONE, GOAL_ACTION_LABELS, GOAL_STATUS_LABELS, goalActionNeedsConfirm } from "@/shared/utils/goalMessages";
import { goalProgress, goalStatus, isGoalInProgress } from "@/shared/utils/goalModel";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

const CONFIRM_COPY: Partial<Record<GoalAction, string>> = {
  complete: "The goal moves to Completed and stops accepting contributions. You can reopen it later if you need to.",
  cancel: "The goal stops accepting contributions. Its history is kept and you can restore it later.",
  archive: "The goal moves to Archived with its full history. You can unarchive it at any time.",
};

/**
 * One goal (SPENDLY-608): progress with remaining/surplus, details, the
 * confirmed target change and the lifecycle actions its state allows. There
 * is no delete — archive keeps the goal and its history (FRD FR-06).
 * Contributions and the history timeline arrive with SPENDLY-609.
 */
export default function GoalDetailScreen() {
  const enabled = useSaveGoalsEnabled();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { settings } = useSettings();
  const { goals, loading, error, retry, editGoal, changeTarget, changeStatus, updateSettings } = useFinancialGoals();
  const goal = useMemo(() => goals.find((g) => g.id === id), [goals, id]);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetSuggestion, setTargetSuggestion] = useState<number | undefined>();

  if (!enabled) return <Redirect href={"/settings/money" as Href} />;

  const back = () => (router.canGoBack() ? router.back() : router.replace("/goals" as Href));
  const header = (
    <PageHeader
      title={goal?.name ?? "Goal"}
      icon={goal ? <GoalIcon iconKey={goal.iconKey} size={28} /> : <Target size={20} color={theme.colors.primary} />}
      onBack={back}
      rightElement={
        goal ? (
          <Button variant="tonal" size="icon" onPress={() => setEditOpen(true)} accessibilityLabel="Edit goal">
            <Pencil size={18} color={theme.colors.primary} />
          </Button>
        ) : undefined
      }
    />
  );

  if (error) {
    return (
      <PageShell scrollable={false}>
        {header}
        <ErrorState title="Couldn't load this goal" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageShell>
    );
  }
  if (loading && !goal) {
    return (
      <PageShell scrollable={false}>
        {header}
        <LoadingState variant="card" count={2} />
      </PageShell>
    );
  }
  if (!goal) {
    return (
      <PageShell scrollable={false}>
        {header}
        <EmptyState title="This goal isn't here" description="It may belong to another account, or the link is out of date." primaryAction={{ label: "Back to goals", onPress: () => router.replace("/goals" as Href) }} />
      </PageShell>
    );
  }

  const p = goalProgress(goal);
  const status = goalStatus(goal);
  const inProgress = isGoalInProgress(goal);
  const actions = availableGoalActions(goal);
  const pct = Math.floor(p.percent);
  const meta = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };

  const runAction = async (action: GoalAction) => {
    if (busy) return;
    setBusy(true);
    try {
      await changeStatus(goal, actionTarget(goal, action), GOAL_ACTION_DONE[action]);
    } finally {
      setBusy(false);
    }
  };

  const onAction = (action: GoalAction) => {
    if (!goalActionNeedsConfirm(action)) return void runAction(action);
    appDialog.show({
      title: `${GOAL_ACTION_LABELS[action]}?`,
      message: CONFIRM_COPY[action],
      buttons: [
        { text: "Not now", style: "cancel" },
        { text: GOAL_ACTION_LABELS[action], style: action === "cancel" ? "destructive" : "default", onPress: () => void runAction(action) },
      ],
    });
  };

  const togglePin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateSettings(goal, { pinned: !goal.pinned }, goal.pinned ? "Goal unpinned" : "Goal pinned");
    } finally {
      setBusy(false);
    }
  };

  const openTarget = (suggested?: number) => {
    setTargetSuggestion(suggested);
    setTargetOpen(true);
  };

  const saveEdit = (v: GoalFormSubmit) =>
    editGoal(goal, {
      name: v.name,
      description: v.description ?? "",
      iconKey: v.iconKey,
      startDate: v.startDate ?? "",
      targetDate: v.targetDate ?? "",
      minimumContribution: v.minimumContribution,
    });

  const detailRow = (label: string, value: string) => (
    <View style={styles.detailRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={meta}>{label}</Text>
      <Text style={[body, styles.detailValue]}>{value}</Text>
    </View>
  );

  return (
    <PageShell>
      {header}
      <View style={{ gap: theme.space.md, paddingBottom: theme.space.xl }}>
        <Section title="Progress" subtitle={GOAL_STATUS_LABELS[status]}>
          <View style={{ gap: theme.space.sm }}>
            <View style={styles.amounts}>
              <FinancialAmount value={p.saved} currency={currency} size="xl" />
              <Text style={meta}>of</Text>
              <FinancialAmount value={p.target} currency={currency} size="md" tone="muted" weight="medium" />
            </View>
            <ProgressIndicator
              pct={pct}
              status={p.reached ? "good" : "neutral"}
              statusLabel={p.reached ? "Target reached" : `${pct}% saved`}
              trailing={`${pct}%`}
              accessibilityLabel={`${pct}% of the target saved`}
            />
            {p.remaining > 0 ? <Text style={meta}>{money(p.remaining)} left to save</Text> : null}
            {p.surplus > 0 ? (
              <View style={[styles.callout, { backgroundColor: surfaces.wash(theme.colors.success), borderRadius: theme.radius.md }]}>
                <Text style={[body, { fontFamily: theme.fontFamily.semibold }]}>Saved above target: {money(p.surplus)}</Text>
                {inProgress ? (
                  <Button variant="ghost" size="sm" onPress={() => openTarget(p.saved)}>
                    Raise target to {money(p.saved)}
                  </Button>
                ) : null}
              </View>
            ) : null}
          </View>
        </Section>

        {p.reached && inProgress && actions.includes("complete") ? (
          <View
            style={[styles.callout, { backgroundColor: surfaces.wash(theme.colors.primary), borderRadius: theme.radius.md }]}
            accessibilityLiveRegion="polite"
          >
            <View style={styles.row}>
              <PartyPopper size={18} color={theme.colors.primary} />
              <Text style={[body, { flex: 1, fontFamily: theme.fontFamily.semibold }]}>You've reached this goal's target.</Text>
            </View>
            <Text style={meta}>Mark it completed to close it, or keep saving towards a higher target.</Text>
            <View style={[styles.row, { gap: theme.space.sm }]}>
              <Button variant="primary" size="sm" onPress={() => onAction("complete")} disabled={busy}>
                Mark completed
              </Button>
              <Button variant="ghost" size="sm" onPress={() => openTarget()} disabled={busy}>
                Change target
              </Button>
            </View>
          </View>
        ) : null}

        <Section title="Details">
          <View style={{ gap: theme.space.xs }}>
            {goal.description ? <Text style={body}>{goal.description}</Text> : null}
            {detailRow("Status", GOAL_STATUS_LABELS[status])}
            {detailRow("Target date", goal.deadline ? formatDisplayDate(goal.deadline, settings.dateFormat) : "None")}
            {goal.startDate ? detailRow("Start date", formatDisplayDate(goal.startDate, settings.dateFormat)) : null}
            {goal.minimumContribution ? detailRow("Minimum contribution", money(goal.minimumContribution)) : null}
            {goal.completedAtMs && status === "completed" ? detailRow("Completed", formatDisplayDate(new Date(goal.completedAtMs), settings.dateFormat)) : null}
          </View>
        </Section>

        <Section title="Manage">
          <View style={{ gap: theme.space.sm }}>
            {inProgress ? (
              <Button variant="secondary" onPress={() => openTarget()} disabled={busy}>
                Change target
              </Button>
            ) : null}
            <Button variant="secondary" onPress={() => void togglePin()} disabled={busy} accessibilityLabel={goal.pinned ? "Unpin goal" : "Pin goal to top"}>
              {goal.pinned ? "Unpin" : "Pin to top"}
            </Button>
            {actions
              .filter((a) => a !== "complete")
              .map((a) => (
                <Button key={a} variant={a === "cancel" ? "outline" : "secondary"} onPress={() => onAction(a)} disabled={busy}>
                  {GOAL_ACTION_LABELS[a]}
                </Button>
              ))}
            {status === "completed" ? <Text style={meta}>Completed goals don't accept contributions. Reopen it to change its amounts.</Text> : null}
            <Text style={meta}>Goals are never deleted. Archive keeps the goal and its full history.</Text>
          </View>
        </Section>
      </View>

      <GoalFormSheet isOpen={editOpen} goal={goal} goals={goals} onClose={() => setEditOpen(false)} onSubmit={saveEdit} />
      <GoalTargetSheet
        isOpen={targetOpen}
        goal={goal}
        currency={currency}
        suggested={targetSuggestion}
        onClose={() => setTargetOpen(false)}
        onConfirm={(t) => changeTarget(goal, t)}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  amounts: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  callout: { padding: 12, gap: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, minHeight: 28, alignItems: "center" },
  detailValue: { flexShrink: 1, textAlign: "right" },
});

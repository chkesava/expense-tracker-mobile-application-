import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDown, ArrowUp, Lock, Pin } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { GoalIcon } from "@/components/goals/GoalIcon";
import { Button } from "@/components/ui/Button";
import type { FinancialGoal } from "@/shared/types/expense";
import { GOAL_STATUS_LABELS } from "@/shared/utils/goalMessages";
import { goalProgress, goalStatus, isGoalInProgress } from "@/shared/utils/goalModel";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

type Props = {
  goal: FinancialGoal;
  currency: string;
  onPress: (goal: FinancialGoal) => void;
  /** SPENDLY-613: a write to this goal is waiting to sync. */
  pending?: boolean;
  /** SPENDLY-614: locked and not unlocked on this device — amounts are hidden. */
  hidden?: boolean;
  /** Reorder mode: show move buttons instead of opening the goal. */
  reorder?: { canUp: boolean; canDown: boolean; onMove: (goal: FinancialGoal, direction: -1 | 1) => void };
};

/**
 * One goal in the Goals list (SPENDLY-608): saved / target, progress, what's
 * left (or the surplus, shown separately), and its status when not active.
 * Summary fields only — the card never reads history.
 */
export const GoalCard = memo(function GoalCard({ goal, currency, onPress, reorder, pending, hidden }: Props) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const p = goalProgress(goal);
  const status = goalStatus(goal);
  const open = isGoalInProgress(goal);
  const pct = Math.floor(p.percent);
  const statusLabel = p.reached ? (status === "completed" ? "Completed" : "Target reached") : GOAL_STATUS_LABELS[status];
  const meta = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  const summary = hidden
    ? `${goal.name}, locked`
    : `${goal.name}, ${GOAL_STATUS_LABELS[status]}, ${pct}% saved${p.surplus > 0 ? ", over target" : ""}${goal.pinned ? ", pinned" : ""}${pending ? ", waiting to sync" : ""}`;

  return (
    <Pressable
      onPress={() => (reorder ? undefined : onPress(goal))}
      disabled={Boolean(reorder)}
      accessibilityRole={reorder ? undefined : "button"}
      accessibilityLabel={summary}
      accessibilityHint={reorder ? undefined : "Opens the goal"}
      style={[styles.card, { backgroundColor: surfaces.tile, borderColor: theme.colors.border, borderRadius: theme.radius.lg }]}
    >
      <View style={styles.top}>
        <GoalIcon iconKey={goal.iconKey} muted={!open} />
        <View style={styles.nameCol}>
          <View style={styles.nameRow}>
            {goal.pinned ? <Pin size={12} color={theme.colors.primary} accessibilityElementsHidden /> : null}
            <Text numberOfLines={1} style={[styles.name, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
              {goal.name}
            </Text>
          </View>
          {hidden ? (
            <View style={styles.nameRow}>
              <Lock size={12} color={theme.colors.mutedForeground} accessibilityElementsHidden />
              <Text style={meta}>Locked</Text>
            </View>
          ) : (
            <View style={styles.amounts}>
              <FinancialAmount value={p.saved} currency={currency} size="sm" />
              <Text style={meta}>of</Text>
              <FinancialAmount value={p.target} currency={currency} size="xs" tone="muted" weight="medium" />
            </View>
          )}
        </View>
        {reorder ? (
          <View style={styles.moveCol}>
            <Button variant="ghost" size="icon" disabled={!reorder.canUp} onPress={() => reorder.onMove(goal, -1)} accessibilityLabel={`Move ${goal.name} up`}>
              <ArrowUp size={18} color={reorder.canUp ? theme.colors.foreground : theme.colors.mutedForeground} />
            </Button>
            <Button variant="ghost" size="icon" disabled={!reorder.canDown} onPress={() => reorder.onMove(goal, 1)} accessibilityLabel={`Move ${goal.name} down`}>
              <ArrowDown size={18} color={reorder.canDown ? theme.colors.foreground : theme.colors.mutedForeground} />
            </Button>
          </View>
        ) : null}
      </View>

      {hidden ? null : (
        <ProgressIndicator
          pct={pct}
          status={p.reached ? "good" : "neutral"}
          statusLabel={statusLabel}
          trailing={`${pct}%`}
          accessibilityLabel={`${goal.name}, ${pct}% saved`}
        />
      )}

      {pending ? <Text style={[meta, { fontStyle: "italic" }]}>Waiting to sync</Text> : null}
      {hidden ? null : p.surplus > 0 ? (
        <View style={styles.amounts}>
          <Text style={[meta, { color: theme.colors.success, fontFamily: theme.fontFamily.semibold }]}>Over target by</Text>
          <FinancialAmount value={p.surplus} currency={currency} size="xs" tone="positive" weight="semibold" />
        </View>
      ) : p.remaining > 0 ? (
        <View style={styles.amounts}>
          <FinancialAmount value={p.remaining} currency={currency} size="xs" tone="muted" weight="medium" />
          <Text style={meta}>to go</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  nameCol: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: 15, flexShrink: 1 },
  amounts: { flexDirection: "row", alignItems: "baseline", gap: 4, flexWrap: "wrap" },
  moveCol: { flexDirection: "row" },
});

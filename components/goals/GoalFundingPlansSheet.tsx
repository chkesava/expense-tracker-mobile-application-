import { Pressable, StyleSheet, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { appDialog } from "@/lib/appDialog";
import { GOAL_FUNDING_ENGINE_VERSION } from "@/shared/types/goalFunding";
import type { GoalFundingPlan } from "@/shared/utils/goalFundingPlans";
import { GOAL_FUNDING_MODE_INFO } from "@/shared/utils/goalFundingView";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Saved funding plans (SPENDLY-220): open, rename, duplicate, archive or
 * delete. Every action changes only the plan, never goals or transactions.
 */
export function GoalFundingPlansSheet({
  isOpen,
  plans,
  openPlanId,
  onClose,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  isOpen: boolean;
  plans: GoalFundingPlan[];
  openPlanId: string | null;
  onClose: () => void;
  onOpen: (plan: GoalFundingPlan) => void;
  onRename: (plan: GoalFundingPlan) => void;
  onDuplicate: (plan: GoalFundingPlan) => void;
  onArchive: (plan: GoalFundingPlan, archived: boolean) => void;
  onDelete: (plan: GoalFundingPlan) => void;
}) {
  const { theme } = useTheme();
  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const link = { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.xs };

  const action = (label: string, onPress: () => void, a11y: string) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6} style={{ minHeight: 32, justifyContent: "center" }}>
      <Text style={link}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Saved plans" density="compact" maxHeight="85%">
      <View style={{ gap: theme.space.sm }}>
        <Text style={muted}>Plans only store your planning choices. Deleting one never touches your goals or transactions.</Text>
        {!plans.length ? <Text style={[muted, { paddingVertical: theme.space.md }]}>No saved plans yet. Use "Save plan" on the funding screen.</Text> : null}
        {plans.map((p) => (
          <View key={p.id} style={[styles.row, { borderColor: theme.colors.border, paddingVertical: theme.space.sm, gap: 4 }]}>
            <Text style={text}>
              {p.name}
              {p.id === openPlanId ? " · Open" : ""}
              {p.archived ? " · Archived" : ""}
            </Text>
            <Text style={muted}>
              {GOAL_FUNDING_MODE_INFO[p.mode]?.label ?? p.mode} · {p.goalSnapshot.length} goal{p.goalSnapshot.length === 1 ? "" : "s"} · saved {new Date(p.updatedAtMs).toLocaleDateString()}
              {p.engineVersion !== GOAL_FUNDING_ENGINE_VERSION ? ` · made with an older calculation (v${p.engineVersion})` : ""}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
              {action("Open", () => onOpen(p), `Open plan ${p.name}`)}
              {action("Rename", () => onRename(p), `Rename plan ${p.name}`)}
              {action("Duplicate", () => onDuplicate(p), `Duplicate plan ${p.name}`)}
              {action(p.archived ? "Unarchive" : "Archive", () => onArchive(p, !p.archived), `${p.archived ? "Unarchive" : "Archive"} plan ${p.name}`)}
              {action(
                "Delete",
                () =>
                  appDialog.alert(`Delete "${p.name}"?`, "Only this plan is deleted. Your goals and transactions stay exactly as they are.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => onDelete(p) },
                  ]),
                `Delete plan ${p.name}`
              )}
            </View>
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: StyleSheet.hairlineWidth },
});

import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Plus, X } from "lucide-react-native";

import { CurrencyPrefix } from "@/components/common/CurrencyPrefix";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { FinancialGoal } from "@/shared/types/expense";
import { GOAL_LIMITS, type GoalMilestone } from "@/shared/types/goal";
import { milestoneFormRows, nextMilestoneId, parseMilestoneRows, type MilestoneFormRow } from "@/shared/utils/goalAchievements";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Edit a goal's milestones (SPENDLY-610, FRD FR-07). Defaults are 25/50/75/100%
 * of the target; editing makes them custom, and "Use defaults" goes back.
 * Rows keep their ids, so relabelling a milestone keeps its history.
 */
export function GoalMilestonesSheet({
  isOpen,
  goal,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  goal: FinancialGoal;
  onClose: () => void;
  /** `null` = back to the defaults. Resolves true when saved. */
  onSave: (milestones: GoalMilestone[] | null) => Promise<boolean>;
}) {
  const { theme } = useTheme();
  const [rows, setRows] = useState<MilestoneFormRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setRows(milestoneFormRows(goal));
    setErrors({});
    setSaving(false);
    inFlight.current = false;
  }, [isOpen, goal]);

  const update = (id: string, patch: Partial<MilestoneFormRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (errors[id]) setErrors(({ [id]: _, ...rest }) => rest);
  };

  const save = async (milestones: GoalMilestone[] | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      if (await onSave(milestones)) onClose();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const submit = () => {
    const parsed = parseMilestoneRows(rows);
    if (!parsed.ok) return setErrors(parsed.errors);
    void save(parsed.milestones);
  };

  const hint = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title="Milestones"
      density="compact"
      maxHeight="92%"
      footer={
        <SheetActions secondary={{ label: "Cancel", onPress: onClose, disabled: saving }} primary={{ label: "Save milestones", onPress: submit, loading: saving, disabled: saving }} />
      }
    >
      <View style={{ gap: theme.space.md }}>
        <Text style={hint}>
          Each milestone is celebrated when your saved amount reaches it. If the amount drops below one, it shows as not reached, and reaching it again is recorded too.
        </Text>
        {rows.map((r, i) => (
          <View key={r.id} style={styles.row}>
            <View style={styles.amount}>
              <Input
                label={`Milestone ${i + 1}`}
                value={r.amount}
                onChangeText={(t) => update(r.id, { amount: t })}
                keyboardType="decimal-pad"
                leadingIcon={<CurrencyPrefix />}
                error={errors[r.id]}
              />
            </View>
            <View style={styles.label}>
              <Input label="Label" value={r.label} onChangeText={(t) => update(r.id, { label: t })} maxLength={GOAL_LIMITS.milestoneLabelMax} />
            </View>
            <Button
              variant="ghost"
              size="icon"
              onPress={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
              disabled={rows.length <= 1}
              accessibilityLabel={`Remove milestone ${i + 1}`}
            >
              <X size={18} color={theme.colors.mutedForeground} />
            </Button>
          </View>
        ))}
        {errors._ ? <Text style={[hint, { color: theme.colors.destructive }]}>{errors._}</Text> : null}
        <View style={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => setRows((rs) => [...rs, { id: nextMilestoneId(rs), amount: "", label: "" }])}
            disabled={rows.length >= GOAL_LIMITS.maxMilestones}
            accessibilityLabel="Add a milestone"
          >
            <Plus size={16} color={theme.colors.foreground} />
          </Button>
          <Button variant="ghost" size="sm" onPress={() => void save(null)} disabled={saving}>
            Use defaults (25/50/75/100%)
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  amount: { flex: 3 },
  label: { flex: 2 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});

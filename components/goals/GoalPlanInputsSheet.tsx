import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { ChipRow, RowSwitch } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { GoalPlanInput, GoalSnapshot } from "@/shared/types/goalFunding";
import { validateGoalPlanInput } from "@/shared/utils/goalFundingModel";
import { useTheme } from "@/theme/ThemeProvider";

const num = (s: string): number | undefined => {
  const t = s.replace(/,/g, "").trim();
  return t === "" ? undefined : Number(t);
};

/**
 * Planning inputs for one goal (SPENDLY-218). These belong to the plan only —
 * saving here never changes the goal itself. Blank means "not set".
 */
export function GoalPlanInputsSheet({
  isOpen,
  goal,
  input,
  goalCount,
  takenPriorities,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  goal: GoalSnapshot | null;
  input: GoalPlanInput | null;
  goalCount: number;
  takenPriorities: number[];
  onClose: () => void;
  onSave: (next: GoalPlanInput) => void;
}) {
  const { theme } = useTheme();
  const [priority, setPriority] = useState<string>("none");
  const [min, setMin] = useState("");
  const [current, setCurrent] = useState("");
  const [oneTimeAmount, setOneTimeAmount] = useState("");
  const [oneTimeDate, setOneTimeDate] = useState("");
  const [growth, setGrowth] = useState("");
  const [excluded, setExcluded] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen || !input) return;
    setPriority(input.priority ? String(input.priority) : "none");
    setMin(input.minContribution !== undefined ? String(input.minContribution) : "");
    setCurrent(input.currentContribution !== undefined ? String(input.currentContribution) : "");
    setOneTimeAmount(input.oneTime ? String(input.oneTime.amount) : "");
    setOneTimeDate(input.oneTime?.date ?? "");
    setGrowth(input.annualReturnPct !== undefined ? String(input.annualReturnPct) : "");
    setExcluded(Boolean(input.excluded));
    setErrors([]);
  }, [isOpen, input]);

  if (!goal || !input) return null;
  const hint = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const label = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };
  const priorityOptions = [
    { value: "none", label: "No priority" },
    ...Array.from({ length: goalCount }, (_, i) => String(i + 1))
      .filter((p) => p === String(input.priority) || !takenPriorities.includes(Number(p)))
      .map((p) => ({ value: p, label: `#${p}` })),
  ];

  const save = () => {
    const amount = num(oneTimeAmount);
    const next: GoalPlanInput = {
      goalId: goal.goalId,
      priority: priority === "none" ? undefined : Number(priority),
      minContribution: num(min),
      currentContribution: num(current),
      oneTime: amount !== undefined || oneTimeDate.trim() ? { amount: amount ?? Number.NaN, date: oneTimeDate.trim() } : undefined,
      annualReturnPct: num(growth),
      excluded: excluded || undefined,
    };
    const issues = validateGoalPlanInput(next);
    if (issues.length) {
      setErrors(issues);
      return;
    }
    onSave(next);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Plan for ${goal.name}`} density="compact" maxHeight="92%">
      <View style={{ gap: theme.space.md }}>
        <Text style={hint}>These settings belong to this plan only. Your goal stays exactly as it is.</Text>
        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>Priority</Text>
          <ChipRow<string> options={priorityOptions} selected={priority} onSelect={setPriority} />
          <Text style={hint}>Only you decide what comes first. Goals without a priority are treated equally.</Text>
        </View>
        <Input label="What you put in each month now (optional)" value={current} onChangeText={setCurrent} keyboardType="numeric" helperText="Leave blank if you don't know — it won't be treated as zero." />
        <Input label="Minimum each month (optional)" value={min} onChangeText={setMin} keyboardType="numeric" />
        <Input label="One-time top-up amount (optional)" value={oneTimeAmount} onChangeText={setOneTimeAmount} keyboardType="numeric" />
        {oneTimeAmount.trim() ? <Input label="Top-up date (YYYY-MM-DD)" value={oneTimeDate} onChangeText={setOneTimeDate} autoCapitalize="none" /> : null}
        <Input
          label="Yearly growth % (optional, investment-linked goals)"
          value={growth}
          onChangeText={setGrowth}
          keyboardType="numeric"
          helperText="An assumption, not a guarantee. Tax and fees aren't included."
        />
        <RowSwitch label="Leave this goal out of the plan" value={excluded} onValueChange={setExcluded} />
        {errors.length ? (
          <View accessibilityLiveRegion="polite">
            {errors.map((e) => (
              <Text key={e} style={[hint, { color: theme.colors.destructive }]}>
                {e}
              </Text>
            ))}
          </View>
        ) : null}
        <Button onPress={save}>Use these settings</Button>
      </View>
    </Modal>
  );
}

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CurrencyPrefix } from "@/components/common/CurrencyPrefix";
import { DateField } from "@/components/common/DateField";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { GOAL_ICONS, GoalIcon } from "@/components/goals/GoalIcon";
import { Input } from "@/components/ui/Input";
import type { FinancialGoal } from "@/shared/types/expense";
import { GOAL_ICON_KEYS } from "@/shared/types/goal";
import {
  EMPTY_GOAL_FORM,
  goalFormFromGoal,
  parseGoalForm,
  type GoalFormField,
  type GoalFormValues,
} from "@/shared/utils/goalForm";
import { useTheme } from "@/theme/ThemeProvider";

export type GoalFormSubmit = {
  name: string;
  targetAmount: number;
  initialAmount: number;
  description?: string;
  iconKey: GoalFormValues["iconKey"];
  startDate?: string;
  targetDate?: string;
  minimumContribution?: number;
};

/**
 * Create or edit a goal (SPENDLY-608). Validation is shared/utils/goalForm;
 * the write boundary (rules) re-checks everything, including the unique name.
 * The target is set here on create only — changing it later goes through the
 * goal's own confirmed "Change target" path (FRD FR-05).
 */
export function GoalFormSheet({
  isOpen,
  goal,
  goals,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  /** null = create. */
  goal: FinancialGoal | null;
  goals: readonly FinancialGoal[];
  onClose: () => void;
  /** Resolves true when saved; the sheet then closes. */
  onSubmit: (value: GoalFormSubmit) => Promise<boolean>;
}) {
  const { theme } = useTheme();
  const mode = goal ? "edit" : "create";
  const [values, setValues] = useState<GoalFormValues>(EMPTY_GOAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<GoalFormField, string>>>({});
  const [saving, setSaving] = useState(false);
  // Guards double taps before React re-renders the disabled button.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(goal ? goalFormFromGoal(goal) : EMPTY_GOAL_FORM);
    setErrors({});
    setSaving(false);
    inFlight.current = false;
  }, [isOpen, goal]);

  const set = (field: GoalFormField) => (text: string) => {
    setValues((v) => ({ ...v, [field]: text }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const save = async () => {
    if (inFlight.current) return;
    const parsed = parseGoalForm(values, { mode, goals, selfId: goal?.id });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const ok = await onSubmit(parsed.value);
      if (ok) onClose();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const label = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };
  const hint = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title={mode === "create" ? "New goal" : "Edit goal"}
      density="compact"
      maxHeight="92%"
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose, disabled: saving }}
          primary={{ label: mode === "create" ? "Create goal" : "Save changes", onPress: () => void save(), loading: saving, disabled: saving }}
        />
      }
    >
      <View style={{ gap: theme.space.md }}>
        <Input label="Goal name" placeholder="e.g. Emergency fund" value={values.name} onChangeText={set("name")} error={errors.name} maxLength={80} autoFocus={mode === "create"} />
        {mode === "create" ? (
          <>
            <Input label="Target amount" placeholder="e.g. 100000" value={values.target} onChangeText={set("target")} error={errors.target} keyboardType="decimal-pad" leadingIcon={<CurrencyPrefix />} />
            <Input
              label="Already saved (optional)"
              placeholder="0"
              value={values.initial}
              onChangeText={set("initial")}
              error={errors.initial}
              keyboardType="decimal-pad"
              leadingIcon={<CurrencyPrefix />}
              helperText="Recorded in the goal's history as its starting amount. Your accounts aren't changed."
            />
          </>
        ) : (
          <Text style={hint}>To change the target, use "Change target" on the goal's page so the change is recorded.</Text>
        )}

        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>Icon</Text>
          <View style={styles.icons} accessibilityRole="radiogroup">
            {GOAL_ICON_KEYS.map((key) => {
              const selected = values.iconKey === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setValues((v) => ({ ...v, iconKey: key }))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={GOAL_ICONS[key].label}
                  style={[
                    styles.iconTile,
                    { borderColor: selected ? theme.colors.primary : "transparent", borderRadius: theme.radius.md },
                  ]}
                >
                  <GoalIcon iconKey={key} size={40} muted={!selected} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input label="Description (optional)" value={values.description} onChangeText={set("description")} error={errors.description} multiline maxLength={300} />
        <DateField label="Start date (optional)" value={values.startDate} onChange={set("startDate")} clearable placeholder="Not set" error={errors.startDate} />
        <DateField label="Target date (optional)" value={values.targetDate} onChange={set("targetDate")} clearable placeholder="No deadline" error={errors.targetDate} />
        <Input
          label="Minimum contribution (optional)"
          value={values.minimum}
          onChangeText={set("minimum")}
          error={errors.minimum}
          keyboardType="decimal-pad"
          leadingIcon={<CurrencyPrefix />}
          helperText="Contributions smaller than this are refused."
        />
        {errorCount > 0 ? (
          <Text accessibilityLiveRegion="polite" style={[hint, { color: theme.colors.destructive }]}>
            {errorCount === 1 ? "Fix the highlighted field." : `Fix the ${errorCount} highlighted fields.`}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  icons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  iconTile: { borderWidth: 2, padding: 2, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
});

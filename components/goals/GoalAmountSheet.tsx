import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { CurrencyPrefix } from "@/components/common/CurrencyPrefix";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import type { FinancialGoal } from "@/shared/types/expense";
import { GOAL_LIMITS, GOAL_REASONS, type GoalReason } from "@/shared/types/goal";
import { GOAL_QUICK_AMOUNTS, GOAL_REASON_LABELS } from "@/shared/utils/goalHistory";
import { goalIssueMessage } from "@/shared/utils/goalMessages";
import { goalProgress, parseGoalAmount, validatePositiveAmount } from "@/shared/utils/goalModel";
import { roundMoney } from "@/shared/utils/money";
import { useTheme } from "@/theme/ThemeProvider";

export type AmountSheetKind = "contribution" | "reduction";

/**
 * Add to or take out of a goal (SPENDLY-609, FRD FR-03). Manual savings
 * tracking only: no account, ledger row or transfer changes.
 *
 * Duplicate protection: the button is disabled while saving, a ref guards
 * taps that land before the re-render, and one idempotency key (`newKey`) is
 * minted per submit and kept for a retry of that same submit, so a write that
 * did land can never be applied twice.
 */
export function GoalAmountSheet({
  isOpen,
  kind,
  goal,
  currency,
  newKey,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  kind: AmountSheetKind;
  goal: FinancialGoal;
  currency: string;
  newKey: () => string;
  onClose: () => void;
  onSubmit: (input: { kind: AmountSheetKind; amount: number; reason?: GoalReason; note?: string }, key: string) => Promise<boolean>;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const [text, setText] = useState("");
  const [reason, setReason] = useState<GoalReason | undefined>();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setText("");
    setReason(undefined);
    setNote("");
    setError(undefined);
    setSaving(false);
    inFlight.current = false;
    keyRef.current = null;
  }, [isOpen, kind]);

  const saved = goalProgress(goal).saved;
  const minimum = kind === "contribution" ? goal.minimumContribution : undefined;

  const validate = (amount: number): string | undefined => {
    const issues = validatePositiveAmount(amount);
    if (issues.length) return goalIssueMessage(issues[0]);
    if (minimum && amount < minimum) return goalIssueMessage("below_minimum_contribution");
    if (kind === "reduction" && roundMoney(saved - amount) < 0) return goalIssueMessage("reduction_exceeds_saved");
    if (note.length > GOAL_LIMITS.noteMax) return goalIssueMessage("note_too_long");
    return undefined;
  };

  const submit = async (amount: number) => {
    if (inFlight.current) return;
    const problem = validate(amount);
    if (problem) {
      setError(problem);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    // Same submit → same key; a changed amount is a new submit.
    keyRef.current = keyRef.current ?? newKey();
    try {
      const ok = await onSubmit({ kind, amount, reason, note: note.trim() || undefined }, keyRef.current);
      if (ok) onClose();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const onType = (t: string) => {
    setText(t);
    setError(undefined);
    keyRef.current = null;
  };

  const label = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };
  const hint = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const isAdd = kind === "contribution";

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title={isAdd ? `Add to ${goal.name}` : `Take out of ${goal.name}`}
      density="compact"
      maxHeight="92%"
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose, disabled: saving }}
          primary={{
            label: isAdd ? "Add" : "Take out",
            onPress: () => void submit(parseGoalAmount(text)),
            loading: saving,
            disabled: saving || !text.trim(),
          }}
        />
      }
    >
      <View style={{ gap: theme.space.md }}>
        <Text style={hint}>
          {isAdd
            ? "Records money you've set aside for this goal. Your accounts and transactions aren't changed."
            : `Records money taken out of this goal. Saved now: ${money(saved)}. It can't go below zero.`}
        </Text>
        {isAdd ? (
          <View style={{ gap: theme.space.xs }}>
            <Text style={label}>Quick add</Text>
            <View style={{ flexDirection: "row", gap: theme.space.sm, flexWrap: "wrap" }}>
              {GOAL_QUICK_AMOUNTS.map((amount) => (
                <Chip
                  key={amount}
                  label={money(amount)}
                  appearance="tonal"
                  disabled={saving}
                  onPress={() => {
                    keyRef.current = null;
                    setText(String(amount));
                    void submit(amount);
                  }}
                  accessibilityLabel={`Add ${money(amount)} now`}
                />
              ))}
            </View>
          </View>
        ) : null}
        <Input
          label={isAdd ? "Or another amount" : "Amount"}
          value={text}
          onChangeText={onType}
          error={error}
          keyboardType="decimal-pad"
          leadingIcon={<CurrencyPrefix />}
          helperText={minimum ? `Minimum contribution: ${money(minimum)}` : undefined}
        />
        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>Reason (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }} accessibilityRole="radiogroup">
            {GOAL_REASONS.map((r) => (
              <Chip
                key={r}
                label={GOAL_REASON_LABELS[r]}
                size="sm"
                selected={reason === r}
                onPress={() => setReason(reason === r ? undefined : r)}
                accessibilityRole="radio"
              />
            ))}
          </ScrollView>
        </View>
        <Input label="Note (optional)" value={note} onChangeText={setNote} maxLength={GOAL_LIMITS.noteMax} multiline />
      </View>
    </Modal>
  );
}

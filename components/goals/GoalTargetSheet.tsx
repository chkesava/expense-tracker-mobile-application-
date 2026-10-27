import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { CurrencyPrefix } from "@/components/common/CurrencyPrefix";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Input } from "@/components/ui/Input";
import type { FinancialGoal } from "@/shared/types/expense";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { goalIssueMessage } from "@/shared/utils/goalMessages";
import { parseGoalAmount, validatePositiveAmount } from "@/shared/utils/goalModel";
import { roundMoney } from "@/shared/utils/money";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Change a goal's target (SPENDLY-608, FRD FR-05). Two steps: enter the new
 * target, then confirm a summary of what changes. The change is recorded in
 * the goal's history; saved money is never touched. A target below the saved
 * amount is allowed and leaves a surplus, which the summary spells out.
 */
export function GoalTargetSheet({
  isOpen,
  goal,
  currency,
  suggested,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  goal: FinancialGoal;
  currency: string;
  /** Prefill (e.g. "increase target" to the saved amount). */
  suggested?: number;
  onClose: () => void;
  onConfirm: (target: number) => Promise<boolean>;
}) {
  const { theme } = useTheme();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setText(suggested !== undefined ? String(suggested) : "");
    setError(undefined);
    setConfirming(null);
    setSaving(false);
    inFlight.current = false;
  }, [isOpen, suggested]);

  // Respects ghost mode, like every other amount the user can hide.
  const money = useGhostMoney(currency);
  const saved = roundMoney(goal.currentAmount || 0);

  const review = () => {
    const value = parseGoalAmount(text);
    if (validatePositiveAmount(value).length) return setError(goalIssueMessage("target_invalid"));
    if (value === goal.targetAmount) return setError(goalIssueMessage("no_change"));
    if (goal.minimumContribution && goal.minimumContribution > value) return setError(goalIssueMessage("minimum_invalid"));
    setConfirming(value);
  };

  const confirm = async () => {
    if (confirming === null || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      if (await onConfirm(confirming)) onClose();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm, lineHeight: 20 };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title={confirming === null ? "Change target" : "Confirm new target"}
      density="compact"
      footer={
        confirming === null ? (
          <SheetActions secondary={{ label: "Cancel", onPress: onClose }} primary={{ label: "Review change", onPress: review }} />
        ) : (
          <SheetActions
            secondary={{ label: "Back", onPress: () => setConfirming(null), disabled: saving }}
            primary={{ label: "Change target", onPress: () => void confirm(), loading: saving, disabled: saving }}
          />
        )
      }
    >
      {confirming === null ? (
        <View style={{ gap: theme.space.md }}>
          <Text style={body}>Current target: {money(goal.targetAmount)}. Saved so far: {money(saved)}.</Text>
          <Input
            label="New target"
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError(undefined);
            }}
            error={error}
            keyboardType="decimal-pad"
            leadingIcon={<CurrencyPrefix />}
            autoFocus
          />
        </View>
      ) : (
        <View style={{ gap: theme.space.sm }} accessibilityLiveRegion="polite">
          <Text style={body}>
            The target changes from {money(goal.targetAmount)} to {money(confirming)}.
          </Text>
          <Text style={body}>
            {saved >= confirming
              ? `You've already saved ${money(saved)}, which is ${money(roundMoney(saved - confirming))} over the new target.`
              : `${money(roundMoney(confirming - saved))} will be left to save.`}
          </Text>
          <Text style={[body, { color: theme.colors.mutedForeground, fontSize: theme.typography.xs }]}>
            The old target stays in the goal's history. Your saved amount doesn't change.
          </Text>
        </View>
      )}
    </Modal>
  );
}

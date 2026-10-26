import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { CurrencyPrefix } from "@/components/common/CurrencyPrefix";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { GOAL_LIMITS, GOAL_REASONS, type GoalEvent, type GoalReason } from "@/shared/types/goal";
import type { CorrectionInput } from "@/shared/utils/goalWrites";
import { GOAL_REASON_LABELS } from "@/shared/utils/goalHistory";
import { goalIssueMessage } from "@/shared/utils/goalMessages";
import { parseGoalAmount, validatePositiveAmount } from "@/shared/utils/goalModel";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Correct or reverse an earlier entry (SPENDLY-609, FRD FR-04). The original
 * entry is never changed: a new linked entry records the difference, with an
 * optional reason. An entry can be reversed once.
 */
export function GoalCorrectionSheet({
  isOpen,
  event,
  currency,
  newKey,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  event: GoalEvent | null;
  currency: string;
  newKey: () => string;
  onClose: () => void;
  onSubmit: (input: CorrectionInput, key: string) => Promise<boolean>;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const [mode, setMode] = useState<"correct" | "reverse">("correct");
  const [text, setText] = useState("");
  const [reason, setReason] = useState<GoalReason | undefined>();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode("correct");
    setText("");
    setReason(undefined);
    setNote("");
    setError(undefined);
    setSaving(false);
    inFlight.current = false;
    keyRef.current = null;
  }, [isOpen, event?.id]);

  if (!event) return null;
  const original = Math.abs(event.amountDelta);
  const added = event.amountDelta > 0;

  const submit = async () => {
    if (inFlight.current) return;
    let input: CorrectionInput;
    if (mode === "reverse") {
      input = { mode: "reverse", reason, note: note.trim() || undefined };
    } else {
      const amount = parseGoalAmount(text);
      const issues = validatePositiveAmount(amount);
      if (issues.length) return setError(goalIssueMessage(issues[0]));
      input = { mode: "correct", amount, reason, note: note.trim() || undefined };
    }
    inFlight.current = true;
    setSaving(true);
    keyRef.current = keyRef.current ?? newKey();
    try {
      if (await onSubmit(input, keyRef.current)) onClose();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const hint = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title="Fix this entry"
      density="compact"
      footer={
        <SheetActions
          tone={mode === "reverse" ? "destructive" : "primary"}
          secondary={{ label: "Cancel", onPress: onClose, disabled: saving }}
          primary={{ label: mode === "reverse" ? "Reverse entry" : "Save correction", onPress: () => void submit(), loading: saving, disabled: saving }}
        />
      }
    >
      <View style={{ gap: theme.space.md }}>
        <Text style={body}>
          {added ? "Added" : "Taken out"}: {money(original)}
        </Text>
        <View style={{ flexDirection: "row", gap: theme.space.sm }} accessibilityRole="radiogroup">
          <Chip label="Correct the amount" selected={mode === "correct"} onPress={() => { setMode("correct"); keyRef.current = null; }} accessibilityRole="radio" />
          <Chip label="Reverse it" selected={mode === "reverse"} onPress={() => { setMode("reverse"); keyRef.current = null; }} accessibilityRole="radio" />
        </View>
        {mode === "correct" ? (
          <Input
            label={added ? "It should have been" : "Amount taken out should have been"}
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError(undefined);
              keyRef.current = null;
            }}
            error={error}
            keyboardType="decimal-pad"
            leadingIcon={<CurrencyPrefix />}
          />
        ) : (
          <Text style={hint}>The entry's effect on the saved amount is undone. An entry can be reversed only once.</Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }} accessibilityLabel="Reason (optional)">
          {GOAL_REASONS.map((r) => (
            <Chip key={r} label={GOAL_REASON_LABELS[r]} size="sm" selected={reason === r} onPress={() => setReason(reason === r ? undefined : r)} accessibilityRole="radio" />
          ))}
        </ScrollView>
        <Input label="Why? (optional)" value={note} onChangeText={setNote} maxLength={GOAL_LIMITS.noteMax} multiline />
        <Text style={hint}>The original entry stays in the history. This adds a linked correction.</Text>
      </View>
    </Modal>
  );
}

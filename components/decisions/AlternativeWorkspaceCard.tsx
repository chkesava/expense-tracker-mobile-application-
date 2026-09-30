import { StyleSheet, Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";

import { DecisionListEditor, type DecisionListItem } from "@/components/decisions/DecisionListEditor";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { DECISION_LIMITS } from "@/shared/types/decision";
import { FIRST_YEAR_BASIS, alternativeTotals, draftsToInputs, type InputDraft } from "@/shared/utils/decisionComparison";
import { newItemId } from "@/shared/utils/decisionForm";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

export interface AlternativeWorkspaceState {
  id: string;
  title: string;
  pros: DecisionListItem[];
  cons: DecisionListItem[];
  nonFinancial: string;
  inputs: InputDraft[];
}

const FREQUENCIES: Array<{ id: InputDraft["frequency"]; label: string }> = [
  { id: "one_time", label: "One-time" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

/**
 * One option in the comparison workspace (SPENDLY-365). Every number shown is
 * tagged: amounts the user typed say "Your input"; totals say "Calculated"
 * and how. Nothing on the card suggests which option is right.
 */
export function AlternativeWorkspaceCard({
  state,
  chosenByYou,
  onChange,
  width,
}: {
  state: AlternativeWorkspaceState;
  chosenByYou: boolean;
  onChange: (next: AlternativeWorkspaceState) => void;
  width?: number;
}) {
  const { theme } = useTheme();
  const parsed = draftsToInputs(state.inputs);
  const totals = parsed.ok ? alternativeTotals({ inputs: parsed.inputs }) : null;
  const money = (v: number | null) => (v === null ? "Not entered" : formatAmount(v, "INR"));
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const label = (t: string) => <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{t}</Text>;
  const setInput = (id: string, patch: Partial<InputDraft>) => onChange({ ...state, inputs: state.inputs.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  return (
    <View style={[styles.card, { width, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.space.lg, gap: theme.space.md, backgroundColor: theme.colors.card }]}>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.md }}>
          {state.title}
        </Text>
        {chosenByYou ? <Text style={muted}>You chose this</Text> : null}
      </View>

      {label("Pros")}
      <DecisionListEditor label="Pro" items={state.pros} onChange={(pros) => onChange({ ...state, pros })} addLabel="Add a pro" placeholder="Something in its favour" newId={newItemId} max={DECISION_LIMITS.listItems} />
      {label("Cons")}
      <DecisionListEditor label="Con" items={state.cons} onChange={(cons) => onChange({ ...state, cons })} addLabel="Add a con" placeholder="Something against it" newId={newItemId} max={DECISION_LIMITS.listItems} />

      {label("Money in and out (your inputs)")}
      <Text style={muted}>Only numbers you enter are used. Leave it empty if you don't know yet.</Text>
      {state.inputs.map((input, index) => {
        const bad = !parsed.ok ? parsed.issues.filter((i) => i.id === input.id).map((i) => i.issue) : [];
        return (
          <View key={input.id} style={[styles.inputRow, { gap: theme.space.sm, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.space.sm }]}>
            <View style={[styles.row, { gap: theme.space.sm }]}>
              <Input value={input.label} onChangeText={(v) => setInput(input.id, { label: v })} placeholder="e.g. Price, EMI, interest saved" maxLength={DECISION_LIMITS.label} containerStyle={{ flex: 1 }} accessibilityLabel={`Input ${index + 1} label`} error={bad.includes("label_required") ? "Name this amount" : undefined} />
              <Button variant="ghost" size="icon" onPress={() => onChange({ ...state, inputs: state.inputs.filter((i) => i.id !== input.id) })} accessibilityLabel={`Remove input ${index + 1}`}>
                <Trash2 size={16} color={theme.colors.destructive} />
              </Button>
            </View>
            <Input value={input.amount} onChangeText={(v) => setInput(input.id, { amount: v })} keyboardType="decimal-pad" placeholder="Amount in ₹" accessibilityLabel={`Input ${index + 1} amount`} error={bad.includes("amount_invalid") ? "Enter an amount like 2500" : undefined} helperText="Your input" />
            <View style={[styles.wrap, { gap: theme.space.xs }]}>
              <Chip label="Cost" size="sm" selected={input.direction === "cost"} onPress={() => setInput(input.id, { direction: "cost" })} accessibilityRole="radio" />
              <Chip label="Benefit" size="sm" selected={input.direction === "benefit"} onPress={() => setInput(input.id, { direction: "benefit" })} accessibilityRole="radio" />
              {FREQUENCIES.map((f) => (
                <Chip key={f.id} label={f.label} size="sm" appearance="outline" selected={input.frequency === f.id} onPress={() => setInput(input.id, { frequency: f.id })} accessibilityRole="radio" />
              ))}
            </View>
          </View>
        );
      })}
      {state.inputs.length < DECISION_LIMITS.listItems ? (
        <Button variant="tonal" size="sm" onPress={() => onChange({ ...state, inputs: [...state.inputs, { id: newItemId(), label: "", amount: "", direction: "cost", frequency: "one_time" }] })}>
          + Add an amount
        </Button>
      ) : null}

      <View style={{ gap: 4 }} accessible accessibilityLabel={totals?.firstYearNet == null ? "No calculated total, nothing entered" : `Calculated first-year total ${money(totals.firstYearNet)}`}>
        <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>Calculated</Text>
        {totals ? (
          <>
            <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
              First year: {totals.firstYearNet === null ? "Not entered" : `${totals.firstYearNet >= 0 ? "+" : "−"}${formatAmount(Math.abs(totals.firstYearNet), "INR")}`}
            </Text>
            <Text style={muted}>{FIRST_YEAR_BASIS}</Text>
          </>
        ) : (
          <Text style={muted}>Fix the amounts above to see a total.</Text>
        )}
      </View>

      {label("Other considerations")}
      <Input value={state.nonFinancial} onChangeText={(nonFinancial) => onChange({ ...state, nonFinancial })} multiline maxLength={DECISION_LIMITS.text} placeholder="Things that matter but aren't money — time, stress, family" accessibilityLabel={`Other considerations for ${state.title}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  inputRow: { borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});

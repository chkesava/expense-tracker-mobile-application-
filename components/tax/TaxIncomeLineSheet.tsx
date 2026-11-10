import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionMenuSheet, type ActionMenuItem } from "@/components/common/ActionMenuSheet";
import { Modal } from "@/components/common/Modal";
import { Chip } from "@/components/ui/Chip";
import type { IncomeDecision } from "@/hooks/useTaxIncomeActions";
import type { TaxEntryOf, TaxLine } from "@/shared/features/tax/types";
import { categoryLabel, TAX_INCOME_CATEGORY_OPTIONS } from "@/shared/features/tax/utils/incomePresentation";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useTheme } from "@/theme/ThemeProvider";

type Mode = "menu" | "category" | "replace";

/**
 * What the user can do with one tax income item (SPENDLY-290).
 *
 * Spendly's items: count it, leave it out, move it to another category,
 * replace it with an income the user added (e.g. a certificate total), or
 * undo the decision. The user's own entries: edit or delete. Nothing here
 * changes the Spendly income itself.
 */
export function TaxIncomeLineSheet({
  line,
  entries,
  currency,
  saving,
  onDecide,
  onUndo,
  onEditEntry,
  onDeleteEntry,
  onClose,
}: {
  line: TaxLine | null;
  /** The user's own income entries, offered as replacements. */
  entries: readonly TaxEntryOf<"income">[];
  currency: string;
  saving: boolean;
  onDecide: (line: TaxLine, choice: IncomeDecision) => void;
  onUndo: (line: TaxLine) => void;
  onEditEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const [mode, setMode] = useState<Mode>("menu");
  useEffect(() => setMode("menu"), [line?.key]);

  if (!line) return null;
  const isEntry = line.provenance.origin === "user_entered";
  const entryId = line.provenance.sourceRef?.id ?? "";
  const counted = line.included && line.state === "user_confirmed";
  const excluded = line.reasons.includes("user_excluded");

  const decide = (choice: IncomeDecision) => {
    onDecide(line, choice);
    onClose();
  };

  const actions: ActionMenuItem[] = isEntry
    ? [
        { label: "Edit this income", onPress: () => (onClose(), onEditEntry(entryId)) },
        { label: "Delete", destructive: true, onPress: () => (onClose(), onDeleteEntry(entryId)) },
      ]
    : [
        ...(counted ? [] : [{ label: "Count this income", disabled: saving || line.value === null, disabledReason: line.value === null ? "Spendly can't work out the amount. Add it yourself instead." : undefined, onPress: () => decide({ decision: "confirm" }) }]),
        ...(excluded ? [] : [{ label: "Leave it out", disabled: saving, onPress: () => decide({ decision: "exclude" }) }]),
        { label: "Change category…", disabled: saving, onPress: () => setMode("category") },
        {
          label: "Replace with an income I added…",
          disabled: saving || entries.length === 0,
          disabledReason: entries.length === 0 ? "Add the income first, for example your interest certificate total." : undefined,
          onPress: () => setMode("replace"),
        },
        ...(line.override ? [{ label: "Undo my decision", disabled: saving, onPress: () => (onClose(), onUndo(line)) }] : []),
      ];

  if (mode === "menu") {
    return <ActionMenuSheet isOpen onClose={onClose} title={line.label} actions={actions} />;
  }

  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  if (mode === "category") {
    return (
      <Modal isOpen onClose={onClose} title="Which kind of income is it?">
        <View style={{ gap: theme.space.md }}>
          <Text style={muted}>Spendly put it under {categoryLabel(line.override?.derivedCategory ?? line.category)}. Moving it doesn't change your Spendly income.</Text>
          <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
            {TAX_INCOME_CATEGORY_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                selected={line.category === option.id}
                onPress={() => decide({ decision: "recategorize", category: option.id })}
                appearance="outline"
                size="sm"
                accessibilityRole="radio"
              />
            ))}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Replace with which income?">
      <View style={{ gap: theme.space.md }}>
        <Text style={muted}>The income you pick counts instead of this one, so the same money isn't counted twice.</Text>
        <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
          {entries.map((entry) => (
            <Chip
              key={entry.id}
              label={`${entry.label || entry.fields.payer || categoryLabel(entry.fields.category)} · ${money(entry.fields.amount)}`}
              selected={line.override?.replacedBy === entry.id}
              onPress={() => decide({ decision: "replace", replacedBy: entry.id })}
              appearance="outline"
              size="sm"
              accessibilityRole="radio"
            />
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});

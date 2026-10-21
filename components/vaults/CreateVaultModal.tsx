import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Users } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import { useCelebration } from "@/providers/CelebrationProvider";
import { VAULT_COLORS, VAULT_COLOR_INK } from "@/shared/types/vault";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface CreateVaultModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (vault: {
    name: string;
    description?: string;
    budget: number;
    currency: string;
    themeColor: string;
  }) => Promise<any>;
}

/**
 * New shared vault. SPENDLY-549: on the 6a form sheet pattern (common/Modal,
 * labelled Inputs, pinned SheetActions). What it submits is unchanged.
 */
export function CreateVaultModal({
  visible,
  onClose,
  onSubmit,
}: CreateVaultModalProps) {
  const { theme } = useTheme();
  const displayCurrency = useDisplayCurrency();
  const { celebrateMilestone } = useCelebration();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [themeColor, setThemeColor] = useState<string>(VAULT_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Vault name is required");
      return;
    }

    const numBudget = Number(budget) || 0;
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        budget: numBudget,
        currency: displayCurrency,
        themeColor,
      });
      celebrateMilestone("milestone_first_goal", {
        title: "First Goal Created!",
        subtitle: "Every dream begins with a target. Keep going!",
        badgeEmoji: "✨",
        pointsEarned: 50,
      });
      setName("");
      setDescription("");
      setBudget("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      title="Create shared vault"
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose }}
          primary={{
            label: "Create vault",
            onPress: () => {
              void handleSave();
            },
            disabled: !name.trim() || isSubmitting,
            loading: isSubmitting,
          }}
        />
      }
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          <View style={[styles.iconTile, { backgroundColor: withAlpha(themeColor, 0.14) }]}>
            <Users size={20} color={themeColor} />
          </View>
          <Text
            style={[
              styles.introText,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
            ]}
          >
            A group space for joint budgets and expenses.
          </Text>
        </View>

        <Input
          label="Vault name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Apartment Expenses, Japan Trip"
          autoFocus
        />

        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Optional notes or purpose"
        />

        <Input
          label={`Monthly budget limit (${displayCurrency})`}
          value={budget}
          onChangeText={setBudget}
          placeholder="e.g. 25000"
          keyboardType="numeric"
        />

        <View style={styles.colorGroup}>
          <Text
            style={[
              styles.colorLabel,
              { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
            ]}
          >
            Accent colour
          </Text>
          <View style={styles.colorsRow} accessibilityRole="radiogroup">
            {VAULT_COLORS.map((c) => {
              const isSelected = themeColor === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    haptic.selection().catch(() => undefined);
                    setThemeColor(c);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Accent colour ${VAULT_COLORS.indexOf(c) + 1}`}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    isSelected && {
                      borderWidth: 3,
                      borderColor: theme.colors.card,
                      outlineColor: c,
                    },
                    isSelected && styles.colorCircleSelected,
                  ]}
                >
                  {isSelected ? <Check size={14} color={VAULT_COLOR_INK} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  introText: {
    flex: 1,
    fontSize: 13,
  },
  colorGroup: {
    gap: 8,
  },
  colorLabel: {
    fontSize: 16,
  },
  colorsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  colorCircleSelected: {
    outlineWidth: 2,
    outlineStyle: "solid",
  },
});

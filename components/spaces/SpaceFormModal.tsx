import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CreateSpaceInput } from "@/hooks/useSpaces";
import { toast } from "@/lib/toast";
import type { Space } from "@/shared/types/space";
import { SPACE_COLORS } from "@/shared/types/space";
import { isValidDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface SpaceFormModalProps {
  visible: boolean;
  /** Present when editing an existing Space. */
  space?: Space | null;
  onClose: () => void;
  onCreate: (input: CreateSpaceInput) => Promise<string | null>;
  onUpdate: (id: string, updates: Partial<Space>) => Promise<boolean>;
}

export function SpaceFormModal({
  visible,
  space,
  onClose,
  onCreate,
  onUpdate,
}: SpaceFormModalProps) {
  const { theme } = useTheme();
  const displayCurrency = useDisplayCurrency();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [color, setColor] = useState<string>(SPACE_COLORS[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = Boolean(space?.id);

  useEffect(() => {
    if (!visible) return;
    setName(space?.name ?? "");
    setDescription(space?.description ?? "");
    setBudget(space?.budget ? String(space.budget) : "");
    setColor(space?.color ?? SPACE_COLORS[0]);
    setStartDate(space?.startDate ?? "");
    setEndDate(space?.endDate ?? "");
  }, [visible, space]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Give this space a name");
      return;
    }

    const trimmedBudget = budget.trim();
    let numericBudget: number | null = null;
    if (trimmedBudget) {
      const parsed = Number(trimmedBudget);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Budget must be a positive number");
        return;
      }
      numericBudget = parsed;
    }

    for (const [value, label] of [
      [startDate.trim(), "Start date"],
      [endDate.trim(), "End date"],
    ] as const) {
      if (value && !isValidDateKey(value)) {
        toast.error(`${label} must be YYYY-MM-DD`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        color,
        budget: numericBudget,
        startDate: startDate.trim() ? startDate.trim() : null,
        endDate: endDate.trim() ? endDate.trim() : null,
      };

      const ok =
        isEditing && space?.id
          ? await onUpdate(space.id, payload)
          : Boolean(await onCreate(payload));

      if (ok) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      title={isEditing ? "Edit Space" : "Create Space"}
    >
      <View style={styles.body}>
        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Space Name *
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Brother's Hospital"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Description (optional)
          </Text>
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder="What is this space for?"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Colour
          </Text>
          <View style={styles.swatchRow}>
            {SPACE_COLORS.map((swatch) => {
              const isActive = color === swatch;
              return (
                <Pressable
                  key={swatch}
                  onPress={() => {
                    haptic.selection().catch(() => undefined);
                    setColor(swatch);
                  }}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: swatch,
                      borderColor: isActive
                        ? theme.colors.foreground
                        : "transparent",
                      borderWidth: isActive ? 2 : 0,
                    },
                  ]}
                  accessibilityLabel={`Colour ${swatch}`}
                  accessibilityRole="button"
                />
              );
            })}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Budget ({displayCurrency}, optional)
          </Text>
          <Input
            value={budget}
            onChangeText={setBudget}
            placeholder="e.g. 50000"
            keyboardType="decimal-pad"
          />
          <Text style={[styles.helper, { color: theme.colors.mutedForeground }]}>
            Tracked for information only. Spending is never blocked.
          </Text>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Start Date (optional)
          </Text>
          <Input
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            End Date (optional)
          </Text>
          <Input
            value={endDate}
            onChangeText={setEndDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        <Button
          onPress={handleSave}
          loading={isSubmitting}
          disabled={!name.trim() || isSubmitting}
        >
          <Text
            style={{ fontWeight: "800", color: theme.colors.primaryForeground }}
          >
            {isEditing ? "Save Changes" : "Create Space"}
          </Text>
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  group: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  helper: {
    fontSize: 11,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderCurve: "continuous",
  },
});

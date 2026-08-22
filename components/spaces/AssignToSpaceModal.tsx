import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { useSpaces } from "@/hooks/useSpaces";
import { SPACE_COLORS } from "@/shared/types/space";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

export interface AssignToSpaceModalProps {
  visible: boolean;
  expenseIds: string[];
  onClose: () => void;
  onAssigned?: () => void;
}

/**
 * Assigns already-existing expenses to a Space. This only sets `spaceId` on
 * each expense; no document is created, duplicated or deleted.
 */
export function AssignToSpaceModal({
  visible,
  expenseIds,
  onClose,
  onAssigned,
}: AssignToSpaceModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { spaces, assignExpensesToSpace } = useSpaces();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeSpaces = spaces.filter((space) => space.status !== "ARCHIVED");
  const count = expenseIds.length;

  const handleAssign = async (spaceId: string | null) => {
    if (count === 0) return;
    setIsSubmitting(true);
    try {
      const ok = await assignExpensesToSpace(expenseIds, spaceId);
      if (ok) {
        onAssigned?.();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      title={`Add ${count} expense${count === 1 ? "" : "s"} to space`}
    >
      <View style={styles.body}>
        {activeSpaces.length === 0 ? (
          <Text style={[styles.helper, { color: theme.colors.mutedForeground }]}>
            No spaces yet. Create one from the Spaces tab in the Ledger Hub.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {activeSpaces.map((space) => (
              <Pressable
                key={space.id}
                disabled={isSubmitting}
                onPress={() => {
                  haptic.selection().catch(() => undefined);
                  void handleAssign(space.id ?? null);
                }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.02)",
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: space.color ?? SPACE_COLORS[0] },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.optionTitle, { color: theme.colors.foreground }]}
                    numberOfLines={1}
                  >
                    {space.name}
                  </Text>
                  {space.description ? (
                    <Text
                      style={[styles.helper, { color: theme.colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {space.description}
                    </Text>
                  ) : null}
                </View>
                <Check size={16} color={theme.colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        )}

        <Button
          variant="outline"
          disabled={isSubmitting}
          onPress={() => {
            void handleAssign(null);
          }}
        >
          <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
            Remove from space
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
  helper: {
    fontSize: 11,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 12,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  swatch: {
    width: 12,
    height: 32,
    borderRadius: 6,
    borderCurve: "continuous",
  },
});

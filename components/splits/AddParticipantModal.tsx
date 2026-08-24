import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import type { Split } from "@/shared/types/split";
import {
  addParticipantBlockedReason,
  isCollectSplit,
  isParticipantContributing,
  participantPaidAmount,
  recalibrateSplitAfterAddParticipant,
} from "@/shared/utils/splitMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface AddParticipantModalProps {
  visible: boolean;
  split: Split | null;
  onClose: () => void;
  onConfirm: (name: string) => Promise<boolean>;
}

const PREVIEW_NAME = "New friend";

export function AddParticipantModal({
  visible,
  split,
  onClose,
  onConfirm,
}: AddParticipantModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) setName("");
  }, [visible]);

  const trimmed = name.trim();
  const preview = useMemo(() => {
    if (!split) return null;
    const built = recalibrateSplitAfterAddParticipant(split, {
      name: trimmed || PREVIEW_NAME,
    });
    if ("error" in built) return { error: built.error };
    return built;
  }, [split, trimmed]);

  const blocked = split
    ? addParticipantBlockedReason(split, trimmed)
    : "Enter a name.";

  const handleConfirm = async () => {
    if (!split || blocked) return;
    haptic.selection().catch(() => undefined);
    setSubmitting(true);
    try {
      const ok = await onConfirm(trimmed);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!split) return null;

  const collect = isCollectSplit(split);
  const contributors = split.participants.filter(isParticipantContributing);
  const added =
    preview && !("error" in preview)
      ? preview.participants[preview.participants.length - 1]
      : undefined;
  const overpaidCount =
    preview && !("error" in preview)
      ? preview.participants.filter(
          (p) =>
            isParticipantContributing(p) &&
            !p.isCurrentUser &&
            participantPaidAmount(p) - (Number(p.amount) || 0) > 0.009
        ).length
      : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.cardForeground }]}>
              Add person
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
            {collect
              ? "Add someone to this gift pot. Everyone still in splits the same total — money already collected stays credited."
              : "Add someone to this split. Everyone still in splits the same total — money already marked paid stays credited."}
          </Text>

          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            NAME
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize="words"
            placeholder="e.g. Priya"
            placeholderTextColor={theme.colors.mutedForeground}
            style={[
              styles.input,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.02)",
                borderColor: theme.colors.border,
                color: theme.colors.foreground,
              },
            ]}
          />

          <View
            style={[
              styles.breakdown,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Row
              label="People after adding"
              value={String(contributors.length + 1)}
              color={theme.colors.mutedForeground}
            />
            {typeof added?.amount === "number" ? (
              <Row
                label={
                  split.splitType === "custom"
                    ? "Their share (rescaled)"
                    : "New share each"
                }
                value={`${displayCurrency} ${added.amount.toFixed(2)}`}
                color={theme.colors.foreground}
              />
            ) : null}
          </View>

          {blocked && blocked !== "Enter a name." ? (
            <Text style={[styles.warn, { color: theme.colors.mutedForeground }]}>
              {blocked}
            </Text>
          ) : overpaidCount > 0 ? (
            <Text style={[styles.warn, { color: theme.colors.mutedForeground }]}>
              Extra already collected stays on the pot. We won't refund it.
            </Text>
          ) : null}

          <View style={styles.footer}>
            <Button variant="outline" onPress={onClose} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={handleConfirm}
              disabled={submitting || Boolean(blocked)}
              style={{ flex: 2 }}
            >
              {submitting ? "Adding..." : "Add & recalculate"}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12,
    borderCurve: "continuous",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "700",
  },
  warn: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  breakdown: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rowLabel: {
    fontSize: 12,
    flex: 1,
  },
  rowValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});

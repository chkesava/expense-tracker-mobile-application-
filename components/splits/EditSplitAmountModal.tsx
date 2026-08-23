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
  amountChangeBlockedReason,
  isParticipantContributing,
  participantPaidAmount,
  participantRemainingDue,
  recalibrateSplitAfterAmountChange,
} from "@/shared/utils/splitMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface EditSplitAmountModalProps {
  visible: boolean;
  split: Split | null;
  onClose: () => void;
  onConfirm: (newTotal: number) => Promise<boolean>;
}

export function EditSplitAmountModal({
  visible,
  split,
  onClose,
  onConfirm,
}: EditSplitAmountModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible && split) {
      setAmount(String(split.totalAmount));
    }
  }, [visible, split]);

  const newTotal = parseFloat(amount);
  const preview = useMemo(() => {
    if (!split || !Number.isFinite(newTotal)) return null;
    const built = recalibrateSplitAfterAmountChange(split, newTotal);
    if ("error" in built) return { error: built.error };
    return built;
  }, [split, newTotal]);

  const blocked =
    split && Number.isFinite(newTotal)
      ? amountChangeBlockedReason(split, newTotal)
      : "Enter an amount greater than zero.";

  const handleConfirm = async () => {
    if (!split || blocked) return;
    haptic.selection().catch(() => undefined);
    setSubmitting(true);
    try {
      const ok = await onConfirm(newTotal);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!split) return null;

  const contributors = split.participants.filter(isParticipantContributing);
  const equalShare =
    preview && !("error" in preview)
      ? preview.participants.find(isParticipantContributing)?.amount
      : undefined;
  const extraDueCount =
    preview && !("error" in preview)
      ? preview.participants.filter(
          (p) =>
            isParticipantContributing(p) &&
            participantPaidAmount(p) > 0.009 &&
            participantRemainingDue(p) > 0.009
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
              Edit split amount
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
            Change the total. People who already paid keep that credit — the
            next collection is only the extra, not the whole share again.
          </Text>

          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            TOTAL AMOUNT ({displayCurrency})
          </Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
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
              label="People still in"
              value={String(contributors.length)}
              color={theme.colors.mutedForeground}
            />
            {typeof equalShare === "number" ? (
              <Row
                label={split.splitType === "custom" ? "Shares rescaled to" : "New share each"}
                value={`${displayCurrency} ${equalShare.toFixed(2)}`}
                color={theme.colors.foreground}
              />
            ) : null}
            {extraDueCount > 0 ? (
              <Row
                label="People who already paid will owe extra"
                value={String(extraDueCount)}
                color={theme.colors.foreground}
              />
            ) : null}
          </View>

          {blocked && blocked !== "The amount is already that value." ? (
            <Text style={[styles.warn, { color: theme.colors.mutedForeground }]}>
              {blocked}
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
              {submitting ? "Saving..." : "Update amount"}
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

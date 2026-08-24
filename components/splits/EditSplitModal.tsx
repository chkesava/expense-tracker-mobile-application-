import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useCategories } from "@/hooks/useCategories";
import type { Split, SplitType } from "@/shared/types/split";
import {
  BILL_DEFAULT_CATEGORY,
  COLLECT_DEFAULT_CATEGORY,
  isCollectSplit,
  isCollectSpent,
  isParticipantContributing,
  participantEditKey,
  participantPaidAmount,
  participantRemainingDue,
  recalibrateSplitAfterDetailsChange,
  splitDetailsBlockedReason,
  type SplitDetailsUpdate,
} from "@/shared/utils/splitMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface EditSplitModalProps {
  visible: boolean;
  split: Split | null;
  onClose: () => void;
  onConfirm: (update: SplitDetailsUpdate) => Promise<boolean>;
}

function nameSnapshot(split: Split): Record<string, string> {
  const out: Record<string, string> = {};
  split.participants.forEach((p, index) => {
    out[participantEditKey(p, index)] = p.name;
  });
  return out;
}

function customSnapshot(split: Split): Record<string, string> {
  const out: Record<string, string> = {};
  split.participants.forEach((p, index) => {
    if (!isParticipantContributing(p)) return;
    out[participantEditKey(p, index)] = String(p.amount);
  });
  return out;
}

export function EditSplitModal({
  visible,
  split,
  onClose,
  onConfirm,
}: EditSplitModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const { visibleParents } = useCategories();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [names, setNames] = useState<Record<string, string>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !split) return;
    setTitle(split.title);
    setAmount(String(split.totalAmount));
    setCategory(
      split.category ||
        (isCollectSplit(split) ? COLLECT_DEFAULT_CATEGORY : BILL_DEFAULT_CATEGORY)
    );
    setNotes(split.notes || "");
    setSplitType(split.splitType);
    setNames(nameSnapshot(split));
    setCustomAmounts(customSnapshot(split));
  }, [visible, split?.id]);

  const collect = split ? isCollectSplit(split) : false;
  const spent = split ? isCollectSpent(split) : false;
  const parsedTotal = parseFloat(amount);
  const parsedCustom: Record<string, number> = {};
  for (const [key, value] of Object.entries(customAmounts)) {
    parsedCustom[key] = parseFloat(value);
  }

  const update: SplitDetailsUpdate | null = split
    ? {
        title,
        category,
        notes,
        totalAmount: Number.isFinite(parsedTotal)
          ? parsedTotal
          : split.totalAmount,
        splitType,
        participantNames: names,
        customAmounts: splitType === "custom" ? parsedCustom : undefined,
      }
    : null;

  const preview = useMemo(() => {
    if (!split || !update) return null;
    const built = recalibrateSplitAfterDetailsChange(split, update);
    if ("error" in built) return { error: built.error };
    return built;
  }, [split, title, category, notes, amount, splitType, names, customAmounts]);

  const blocked =
    split && update ? splitDetailsBlockedReason(split, update) : "Enter a title.";

  const categoryOptions = useMemo(() => {
    const namesList = visibleParents.map((c) => c.name);
    const extra =
      category ||
      (collect ? COLLECT_DEFAULT_CATEGORY : BILL_DEFAULT_CATEGORY);
    if (!namesList.includes(extra)) return [...namesList, extra];
    return namesList;
  }, [visibleParents, category, collect]);

  const handleConfirm = async () => {
    if (!split || !update || blocked) return;
    haptic.selection().catch(() => undefined);
    setSubmitting(true);
    try {
      const ok = await onConfirm(update);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!split) return null;

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
              Edit split
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

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
              {spent
                ? "This pot is spent, so the total stays locked. You can still rename it and the people on it."
                : collect
                  ? "Change the gift pot details. Money already collected stays credited."
                  : "Change the split details. Money already marked paid stays credited."}
            </Text>

            <FieldLabel color={theme.colors.mutedForeground}>SPLIT TITLE</FieldLabel>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={
                collect ? "e.g. Rahul's wedding gift" : "e.g. Weekend BBQ"
              }
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

            <FieldLabel color={theme.colors.mutedForeground}>
              {collect ? "TARGET AMOUNT" : "TOTAL AMOUNT"} ({displayCurrency})
            </FieldLabel>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              editable={!spent}
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
                  opacity: spent ? 0.6 : 1,
                },
              ]}
            />

            <FieldLabel color={theme.colors.mutedForeground}>SPLIT METHOD</FieldLabel>
            <View
              style={[
                styles.segmentRow,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                },
              ]}
            >
              {(
                [
                  { key: "equal", label: "Equal" },
                  { key: "custom", label: "Custom" },
                ] as const
              ).map((item) => {
                const selected = splitType === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => {
                      if (spent) return;
                      haptic.selection().catch(() => undefined);
                      setSplitType(item.key);
                    }}
                    style={[
                      styles.segmentBtn,
                      selected && { backgroundColor: theme.colors.primary },
                      spent && { opacity: 0.6 },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: selected ? "700" : "500",
                        color: selected
                          ? theme.colors.primaryForeground
                          : theme.colors.mutedForeground,
                      }}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <FieldLabel color={theme.colors.mutedForeground}>PEOPLE</FieldLabel>
            {split.participants.map((p, index) => {
              const key = participantEditKey(p, index);
              const contributing = isParticipantContributing(p);
              return (
                <View
                  key={key}
                  style={[
                    styles.personRow,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(0,0,0,0.02)",
                    },
                  ]}
                >
                  <TextInput
                    value={names[key] ?? p.name}
                    onChangeText={(value) =>
                      setNames((prev) => ({ ...prev, [key]: value }))
                    }
                    placeholder={p.isCurrentUser ? "You" : `Friend ${index}`}
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.personName,
                      { color: theme.colors.foreground },
                    ]}
                  />
                  {splitType === "custom" && contributing && !spent ? (
                    <TextInput
                      value={customAmounts[key] ?? String(p.amount)}
                      onChangeText={(value) =>
                        setCustomAmounts((prev) => ({ ...prev, [key]: value }))
                      }
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.mutedForeground}
                      style={[
                        styles.personAmount,
                        {
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                          borderColor: theme.colors.border,
                          color: theme.colors.foreground,
                        },
                      ]}
                    />
                  ) : (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: theme.colors.mutedForeground,
                      }}
                    >
                      {contributing
                        ? `${displayCurrency} ${(
                            preview && !("error" in preview)
                              ? preview.participants[index]?.amount
                              : p.amount
                          )?.toFixed(2)}`
                        : "Won't contribute"}
                    </Text>
                  )}
                </View>
              );
            })}

            <FieldLabel color={theme.colors.mutedForeground}>CATEGORY</FieldLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {categoryOptions.map((name) => {
                const selected = category === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => {
                      haptic.selection().catch(() => undefined);
                      setCategory(name);
                    }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected
                          ? theme.colors.primary
                          : isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: selected ? "700" : "500",
                        color: selected
                          ? theme.colors.primaryForeground
                          : theme.colors.foreground,
                      }}
                    >
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <FieldLabel color={theme.colors.mutedForeground}>NOTES</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              placeholderTextColor={theme.colors.mutedForeground}
              multiline
              style={[
                styles.notes,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.02)",
                  borderColor: theme.colors.border,
                  color: theme.colors.foreground,
                },
              ]}
            />

            {extraDueCount > 0 ? (
              <Text style={[styles.warn, { color: theme.colors.mutedForeground }]}>
                {extraDueCount} {extraDueCount === 1 ? "person" : "people"} who
                already paid will owe extra.
              </Text>
            ) : null}
            {blocked ? (
              <Text style={[styles.warn, { color: theme.colors.mutedForeground }]}>
                {blocked}
              </Text>
            ) : null}
          </ScrollView>

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
              {submitting ? "Saving..." : "Save changes"}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FieldLabel({
  children,
  color,
}: {
  children: string;
  color: string;
}) {
  return <Text style={[styles.label, { color }]}>{children}</Text>;
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
    maxHeight: "92%",
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
  scroll: {
    maxHeight: 480,
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
  notes: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: "top",
  },
  segmentRow: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  personName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    padding: 0,
  },
  personAmount: {
    width: 84,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: "right",
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: "700",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  warn: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});

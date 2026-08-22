import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowDownLeft, ArrowUpRight, Plus, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import type { SharedVault } from "@/shared/types/vault";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

export interface VaultTransactionModalProps {
  visible: boolean;
  vault: SharedVault;
  onClose: () => void;
  onSubmit: (tx: {
    amount: number;
    type: "deposit" | "withdrawal";
    category?: string;
    note?: string;
    date?: string;
  }) => Promise<any>;
}

export function VaultTransactionModal({
  visible,
  vault,
  onClose,
  onSubmit,
}: VaultTransactionModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayDateKey());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        amount: numAmount,
        type,
        category: category.trim() || (type === "deposit" ? "Funding" : "General"),
        note: note.trim(),
        date,
      });
      setAmount("");
      setCategory("");
      setNote("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor:
                      type === "deposit"
                        ? "rgba(34,197,94,0.15)"
                        : "rgba(239,68,68,0.15)",
                  },
                ]}
              >
                {type === "deposit" ? (
                  <ArrowDownLeft size={20} color="#22C55E" />
                ) : (
                  <ArrowUpRight size={20} color="#EF4444" />
                )}
              </View>
              <View>
                <Text style={[styles.title, { color: theme.colors.foreground }]}>
                  {type === "deposit" ? "Add Deposit" : "Record Expense"}
                </Text>
                <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
                  {vault.name}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Type Switcher */}
            <View
              style={[
                styles.typeSegment,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Pressable
                onPress={() => {
                  haptic.selection().catch(() => undefined);
                  setType("deposit");
                }}
                style={[
                  styles.typeTab,
                  type === "deposit" && {
                    backgroundColor: theme.colors.card,
                    shadowColor: "#000",
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                  },
                ]}
              >
                <ArrowDownLeft
                  size={16}
                  color={type === "deposit" ? "#22C55E" : theme.colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.typeTabText,
                    {
                      color:
                        type === "deposit"
                          ? theme.colors.foreground
                          : theme.colors.mutedForeground,
                      fontWeight: type === "deposit" ? "700" : "500",
                    },
                  ]}
                >
                  Deposit (Inflow)
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  haptic.selection().catch(() => undefined);
                  setType("withdrawal");
                }}
                style={[
                  styles.typeTab,
                  type === "withdrawal" && {
                    backgroundColor: theme.colors.card,
                    shadowColor: "#000",
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                  },
                ]}
              >
                <ArrowUpRight
                  size={16}
                  color={
                    type === "withdrawal"
                      ? theme.colors.destructive
                      : theme.colors.mutedForeground
                  }
                />
                <Text
                  style={[
                    styles.typeTabText,
                    {
                      color:
                        type === "withdrawal"
                          ? theme.colors.foreground
                          : theme.colors.mutedForeground,
                      fontWeight: type === "withdrawal" ? "700" : "500",
                    },
                  ]}
                >
                  Withdrawal (Spend)
                </Text>
              </Pressable>
            </View>

            {/* Amount */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Amount ({vault.currency}) *
              </Text>
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="numeric"
                autoFocus
              />
            </View>

            {/* Category / Purpose */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Category / Tag
              </Text>
              <Input
                value={category}
                onChangeText={setCategory}
                placeholder={type === "deposit" ? "Funding, Contribution..." : "Rent, Groceries, Dinner..."}
              />
            </View>

            {/* Note */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Note / Description
              </Text>
              <Input
                value={note}
                onChangeText={setNote}
                placeholder="Optional details..."
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Button
              onPress={handleSave}
              loading={isSubmitting}
              disabled={!amount || isSubmitting}
              style={{ flex: 1 }}
            >
              <Text style={{ fontWeight: "800", color: "#FFFFFF" }}>
                {type === "deposit" ? "Add Deposit" : "Record Withdrawal"}
              </Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    maxHeight: "85%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 20,
    gap: 16,
  },
  typeSegment: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  typeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  typeTabText: {
    fontSize: 13,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
});

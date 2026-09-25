import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowDownLeft, ArrowUpRight, Plus, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { toast } from "@/lib/toast";
import type { SharedVault } from "@/shared/types/vault";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

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
  const { theme } = useTheme();

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

            <Button
              variant="ghost"
              size="icon"
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
              style={styles.closeBtn}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Button>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Type Switcher */}
            <SegmentedControl
              value={type}
              onChange={setType}
              options={[
                {
                  value: "deposit",
                  label: "Deposit (Inflow)",
                  activeColor: theme.colors.success,
                  icon: (color) => <ArrowDownLeft size={16} color={color} />,
                },
                {
                  value: "withdrawal",
                  label: "Withdrawal (Spend)",
                  activeColor: theme.colors.destructive,
                  icon: (color) => <ArrowUpRight size={16} color={color} />,
                },
              ]}
            />

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

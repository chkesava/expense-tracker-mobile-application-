import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { toast } from "@/lib/toast";
import type { SharedVault } from "@/shared/types/vault";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

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

/**
 * Add a deposit or a withdrawal to a vault. SPENDLY-549: on the 6a form sheet
 * pattern; the semantic deposit/withdrawal colours come from the theme. What
 * it submits is unchanged.
 */
export function VaultTransactionModal({
  visible,
  vault,
  onClose,
  onSubmit,
}: VaultTransactionModalProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date] = useState(todayDateKey());
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

  const isDeposit = type === "deposit";
  const tone = isDeposit ? theme.colors.success : theme.colors.destructive;

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      title={isDeposit ? "Add deposit" : "Record withdrawal"}
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose }}
          primary={{
            label: isDeposit ? "Add deposit" : "Record withdrawal",
            onPress: () => {
              void handleSave();
            },
            disabled: !amount || isSubmitting,
            loading: isSubmitting,
          }}
        />
      }
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          <View style={[styles.iconTile, { backgroundColor: surfaces.wash(tone) }]}>
            {isDeposit ? <ArrowDownLeft size={20} color={tone} /> : <ArrowUpRight size={20} color={tone} />}
          </View>
          <Text
            style={[styles.introText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={1}
          >
            {vault.name}
          </Text>
        </View>

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

        <Input
          label={`Amount (${vault.currency})`}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="numeric"
          autoFocus
        />

        <Input
          label="Category / tag"
          value={category}
          onChangeText={setCategory}
          placeholder={isDeposit ? "Funding, Contribution..." : "Rent, Groceries, Dinner..."}
        />

        <Input
          label="Note"
          value={note}
          onChangeText={setNote}
          placeholder="Optional details"
        />
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
});

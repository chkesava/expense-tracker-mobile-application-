import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Chip } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { Account } from "@/shared/types/expense";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

export interface AddAccountEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAccountId?: string;
  accounts: Account[];
}

export function AddAccountEntryModal({
  isOpen,
  onClose,
  defaultAccountId,
  accounts,
}: AddAccountEntryModalProps) {
  const { theme } = useTheme();
  const { addEntry } = useAccountEntries();

  const [accountId, setAccountId] = useState(
    defaultAccountId || accounts[0]?.id || ""
  );
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultAccountId) {
      setAccountId(defaultAccountId);
    } else if (accounts[0]?.id && !accountId) {
      setAccountId(accounts[0].id);
    }
  }, [defaultAccountId, accounts, accountId]);

  const handleSubmit = async () => {
    if (!accountId) {
      toast.error("Please select an account");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!date.trim()) {
      toast.error("Please enter a date");
      return;
    }

    setSaving(true);
    try {
      const ok = await addEntry(
        accountId,
        parsedAmount,
        direction,
        date.trim(),
        note.trim() || undefined
      );
      if (ok) {
        toast.success("Manual adjustment recorded");
        setAmount("");
        setNote("");
        onClose();
      } else {
        toast.error("Failed to record entry");
      }
    } catch (err) {
      logError("addAccountEntryModal.saveEntry", err);
      toast.error("Failed to save entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manual Adjustment">
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Direction Toggle */}
        <SegmentedControl
          value={direction}
          onChange={setDirection}
          options={[
            {
              value: "credit",
              label: "Credit (+ Money In)",
              activeColor: theme.colors.success,
              icon: (color) => <ArrowDownLeft size={16} color={color} />,
            },
            {
              value: "debit",
              label: "Debit (- Money Out)",
              activeColor: theme.colors.destructive,
              icon: (color) => <ArrowUpRight size={16} color={color} />,
            },
          ]}
        />

        {/* Account Selector */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Account *
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {accounts.map((a) => {
              const isSelected = accountId === a.id;
              return (
                <Chip
                  key={a.id}
                  label={a.name}
                  selected={isSelected}
                  onPress={() => setAccountId(a.id)}
                  icon={(color) => <Wallet size={14} color={isSelected ? color : theme.colors.mutedForeground} />}
                />
              );
            })}
          </ScrollView>
        </View>

        {/* Amount */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Amount *
          </Text>
          <Input
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </View>

        {/* Date */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Date (YYYY-MM-DD) *
          </Text>
          <Input
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        {/* Note */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Note / Description
          </Text>
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Bank interest, account fee adjustment"
          />
        </View>

        {/* Action Button */}
        <Button
          onPress={handleSubmit}
          disabled={saving}
          size="lg"
          style={{ marginTop: 8 }}
        >
          {saving ? "Recording..." : "Record Adjustment"}
        </Button>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: "700",
  },
  accountPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  accountPillText: {
    fontWeight: "700",
  },
});

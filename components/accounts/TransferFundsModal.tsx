import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, TrendingUp, Wallet } from "lucide-react-native";

import { CurrencyPrefix } from "@/components/common/CurrencyPrefix";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { usePortfolioMutations } from "@/hooks/usePortfolioMutations";
import { logError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { toast } from "@/lib/toast";
import type { Account } from "@/shared/types/expense";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { haptic } from "@/lib/haptics";
import { DateField } from "@/components/common/DateField";

export const DEMAT_ACCOUNT_ID = "stocks_demat";

export interface TransferFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFromAccountId?: string;
  defaultToAccountId?: string;
  accounts: Account[];
}

export function TransferFundsModal({
  isOpen,
  onClose,
  defaultFromAccountId,
  defaultToAccountId,
  accounts,
}: TransferFundsModalProps) {
  const { theme } = useTheme();
  const { addTransfer } = useAccountTransfers();
  const { depositCash, withdrawCash } = usePortfolioMutations();
  const transferIds = useRef({ entryId: newId(), accountEntryId: newId() });

  const selectableOptions = useMemo(() => {
    return [
      ...accounts,
      {
        id: DEMAT_ACCOUNT_ID,
        name: "Stocks Demat Cash",
        typeId: "demat",
        createdAt: "",
      } as Account,
    ];
  }, [accounts]);

  const [fromAccountId, setFromAccountId] = useState(
    defaultFromAccountId || accounts[0]?.id || ""
  );
  const [toAccountId, setToAccountId] = useState(
    defaultToAccountId || DEMAT_ACCOUNT_ID
  );
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [note, setNote] = useState("Account fund transfer");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultFromAccountId) {
      setFromAccountId(defaultFromAccountId);
    }
    if (defaultToAccountId) {
      setToAccountId(defaultToAccountId);
    }
  }, [defaultFromAccountId, defaultToAccountId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    transferIds.current = { entryId: newId(), accountEntryId: newId() };
  }, [isOpen]);

  const handleSubmit = async () => {
    if (saving) return;
    if (!fromAccountId) {
      toast.error("Please select a source account");
      return;
    }
    if (!toAccountId) {
      toast.error("Please select a destination account");
      return;
    }
    if (fromAccountId === toAccountId) {
      toast.error("Source and destination accounts must be different");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Please enter a valid transfer amount");
      return;
    }
    if (!date.trim()) {
      toast.error("Please enter a date");
      return;
    }

    setSaving(true);
    try {
      if (fromAccountId === DEMAT_ACCOUNT_ID) {
        // Stocks Demat -> Bank Account (one batch: cash debit + bank credit)
        const withdrawOk = await withdrawCash(
          parsedAmount,
          note.trim() || `Transfer from Stocks Demat`,
          {
            date: date.trim(),
            accountId: toAccountId,
            entryId: transferIds.current.entryId,
            accountEntryId: transferIds.current.accountEntryId,
            quiet: true,
          }
        );
        if (!withdrawOk) {
          setSaving(false);
          return;
        }

        toast.success("Transferred funds from Stocks Demat to Account");
        setAmount("");
        onClose();
      } else if (toAccountId === DEMAT_ACCOUNT_ID) {
        // Bank Account -> Stocks Demat (one batch: bank debit + cash credit)
        const fromAccount = accounts.find((a) => a.id === fromAccountId);
        const depositOk = await depositCash(
          parsedAmount,
          note.trim() || `Transfer from ${fromAccount?.name ?? "Bank Account"}`,
          {
            date: date.trim(),
            accountId: fromAccountId,
            entryId: transferIds.current.entryId,
            accountEntryId: transferIds.current.accountEntryId,
            quiet: true,
          }
        );

        if (!depositOk) {
          setSaving(false);
          return;
        }

        toast.success("Transferred funds to Stocks Demat");
        setAmount("");
        onClose();
      } else {
        // Regular Bank -> Bank Transfer
        const ok = await addTransfer(
          fromAccountId,
          toAccountId,
          parsedAmount,
          date.trim(),
          note.trim() || undefined
        );

        if (ok) {
          toast.success("Transfer recorded successfully");
          setAmount("");
          onClose();
        } else {
          toast.error("Failed to record transfer");
        }
      }
    } catch (err) {
      logError("transferFundsModal.saveTransfer", err);
      toast.error("Failed to save transfer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transfer Funds"
      // 16dp gutter, as Add Transaction: the default 44dp edge-to-content
      // left ~230dp for the form on a 320dp phone.
      density="compact"
      // SPENDLY-552: 6a form pattern, the submit is pinned below the body.
      // Same handler, same disabled condition, same label as before.
      footer={
        <SheetActions
          primary={{
            label: saving ? "Transferring..." : "Complete Transfer",
            onPress: handleSubmit,
            disabled: saving,
          }}
        />
      }
    >
      {/*
        The sheet body (common/Modal) is the only scroller. The account
        choices wrap instead of scrolling sideways: on a 320-412dp phone a
        horizontal strip cut chips off at the edge and could hide the
        selected account entirely.
      */}
      <View style={styles.body}>
        {/* Source Account */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            From Account (Source) *
          </Text>
          <AccountChoices
            label="From account"
            options={selectableOptions}
            selectedId={fromAccountId}
            onSelect={setFromAccountId}
          />
        </View>

        {/* Transfer Icon Divider */}
        <View style={styles.arrowRow}>
          <View
            style={[styles.arrowDivider, { backgroundColor: theme.colors.border }]}
          />
          <View
            style={[
              styles.arrowCircle,
              {
                backgroundColor: theme.colors.muted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <ArrowRight size={16} color={theme.colors.primary} />
          </View>
          <View
            style={[styles.arrowDivider, { backgroundColor: theme.colors.border }]}
          />
        </View>

        {/* Destination Account */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            To Account (Destination) *
          </Text>
          <AccountChoices
            label="To account"
            options={selectableOptions.filter((a) => a.id !== fromAccountId)}
            selectedId={toAccountId}
            onSelect={setToAccountId}
          />
        </View>

        {/* Amount */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Transfer Amount *
          </Text>
          <Input
            leadingIcon={<CurrencyPrefix />}
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
            Date *
          </Text>
          <DateField value={date} onChange={setDate} accessibilityLabel="Date" />
        </View>

        {/* Note */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Note / Purpose
          </Text>
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Stocks investment fund, ATM withdrawal"
          />
        </View>
      </View>
    </Modal>
  );
}

/** One row of account chips that wraps; a long name ellipsizes inside its chip. */
function AccountChoices({
  label,
  options,
  selectedId,
  onSelect,
}: {
  label: string;
  options: Account[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return (
    <View style={styles.chipWrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((a) => {
        const isSelected = selectedId === a.id;
        const isDemat = a.id === DEMAT_ACCOUNT_ID;
        const iconColor = isSelected
          ? theme.colors.primaryForeground
          : theme.colors.mutedForeground;
        return (
          <Pressable
            key={a.id}
            onPress={() => {
              haptic.selection().catch(() => undefined);
              onSelect(a.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            // Web reads only aria-checked; accessibilityState covers native.
            aria-checked={isSelected}
            accessibilityLabel={a.name}
            style={[
              styles.pill,
              {
                backgroundColor: isSelected ? theme.colors.primary : surfaces.control,
                borderColor: isSelected ? theme.colors.primary : theme.colors.border,
              },
            ]}
          >
            {isDemat ? (
              <TrendingUp size={14} color={iconColor} style={styles.pillIcon} />
            ) : (
              <Wallet size={14} color={iconColor} style={styles.pillIcon} />
            )}
            <Text
              numberOfLines={1}
              style={[
                styles.pillText,
                {
                  color: isSelected
                    ? theme.colors.primaryForeground
                    : theme.colors.foreground,
                  fontSize: theme.typography.xs,
                },
              ]}
            >
              {a.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  label: {
    fontWeight: "700",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  pillIcon: {
    flexShrink: 0,
  },
  pillText: {
    flexShrink: 1,
    fontWeight: "700",
  },
  arrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -4,
  },
  arrowDivider: {
    flex: 1,
    height: 1,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
  },
});

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Calendar,
  Check,
  CreditCard,
  Hash,
  Palette,
  Trash2,
  Wallet,
  X,
} from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { toast } from "@/lib/toast";
import type { Account } from "@/shared/types/expense";
import { getAccountKind } from "@/shared/utils/accountKind";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const ACCOUNT_COLORS = [
  "#4F46E5", // Indigo
  "#2563EB", // Blue
  "#0D9488", // Teal
  "#16A34A", // Green
  "#D97706", // Amber
  "#DC2626", // Red
  "#9333EA", // Purple
  "#DB2777", // Pink
  "#475569", // Slate
];

export interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account?: Account | null;
}

export function EditAccountModal({
  isOpen,
  onClose,
  account,
}: EditAccountModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { accounts, addAccount, updateAccount, deleteAccount } = useAccounts();
  const { accountTypes, addAccountType } = useAccountTypes();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { entries } = useAccountEntries();
  const { payments } = useAccountPayments();
  const { transfers } = useAccountTransfers();

  const isEditing = !!account?.id;

  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [balanceAsOfDate, setBalanceAsOfDate] = useState(
    formatDateKey(new Date())
  );
  const [accountNumber, setAccountNumber] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [billGenerationDay, setBillGenerationDay] = useState("1");
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Sync state on open
  useEffect(() => {
    if (account) {
      setName(account.name || "");
      setTypeId(account.typeId || (accountTypes[0]?.id ?? ""));
      setOpeningBalance(
        account.openingBalance !== undefined ? String(account.openingBalance) : "0"
      );
      setBalanceAsOfDate(
        account.balanceAsOfDate || formatDateKey(new Date())
      );
      setAccountNumber(account.accountNumber || "");
      setCreditLimit(
        account.creditLimit !== undefined ? String(account.creditLimit) : ""
      );
      setBillGenerationDay(
        account.billGenerationDay !== undefined
          ? String(account.billGenerationDay)
          : "1"
      );
      setColor(account.color || ACCOUNT_COLORS[0]);
    } else {
      setName("");
      setTypeId(accountTypes[0]?.id ?? "");
      setOpeningBalance("0");
      setBalanceAsOfDate(formatDateKey(new Date()));
      setAccountNumber("");
      setCreditLimit("");
      setBillGenerationDay("1");
      setColor(ACCOUNT_COLORS[0]);
    }
  }, [account, accountTypes, isOpen]);

  const selectedTypeName = useMemo(() => {
    const t = accountTypes.find((item) => item.id === typeId);
    return t ? t.name : "";
  }, [accountTypes, typeId]);

  const isCreditCard = getAccountKind(selectedTypeName) === "credit";

  // Linked items safeguard check
  const linkedStats = useMemo(() => {
    if (!account?.id) return { total: 0, countExp: 0, countInc: 0 };
    const id = account.id;
    const countExp = expenses.filter((e) => e.accountId === id).length;
    const countInc = incomes.filter((i) => i.accountId === id).length;
    const countEntries = entries.filter((e) => e.accountId === id).length;
    const countTransfers = transfers.filter(
      (t) => t.fromAccountId === id || t.toAccountId === id
    ).length;
    const countPayments = payments.filter(
      (p) => p.fromAccountId === id || p.toAccountId === id
    ).length;
    const total =
      countExp + countInc + countEntries + countTransfers + countPayments;
    return {
      total,
      countExp,
      countInc,
      countEntries,
      countTransfers,
      countPayments,
    };
  }, [account, expenses, incomes, entries, transfers, payments]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Account name is required");
      return;
    }
    if (!typeId) {
      toast.error("Please select an account type");
      return;
    }

    setSaving(true);
    try {
      const parsedOpening = parseFloat(openingBalance) || 0;
      const parsedLimit = isCreditCard
        ? parseFloat(creditLimit) || 0
        : undefined;
      const parsedBillDay = isCreditCard
        ? Math.min(31, Math.max(1, parseInt(billGenerationDay, 10) || 1))
        : undefined;

      const extras: Partial<Account> = {
        openingBalance: parsedOpening,
        balanceAsOfDate: balanceAsOfDate || formatDateKey(new Date()),
        accountNumber: accountNumber.trim() || undefined,
        creditLimit: parsedLimit,
        billGenerationDay: parsedBillDay,
        color,
      };

      if (isEditing && account?.id) {
        await updateAccount(account.id, {
          name: trimmedName,
          typeId,
          ...extras,
        });
        toast.success("Account updated");
      } else {
        await addAccount(trimmedName, typeId, extras);
        toast.success("Account created");
      }
      onClose();
    } catch (err) {
      console.error("Save account error:", err);
      toast.error("Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!account?.id) return;

    if (linkedStats.total > 0) {
      Alert.alert(
        "Cannot Delete Account",
        `This account has ${linkedStats.total} linked record(s) (${linkedStats.countExp} expenses, ${linkedStats.countInc} incomes, ${linkedStats.countTransfers} transfers, ${linkedStats.countPayments} payments). Please reassign or delete these records before removing the account.`,
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      "Delete Account",
      `Are you sure you want to delete "${account.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount(account.id);
              toast.success("Account deleted");
              onClose();
            } catch (err) {
              console.error("Delete account error:", err);
              toast.error("Failed to delete account");
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Account" : "Add Account"}
    >
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Account Name *
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. HDFC Salary, SBI Primary, Amazon Pay ICICI"
          />
        </View>

        {/* Account Type Selector */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Account Type *
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {accountTypes.map((t) => {
              const isSelected = typeId === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setTypeId(t.id);
                  }}
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
                      borderColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typePillText,
                      {
                        color: isSelected
                          ? theme.colors.primaryForeground
                          : theme.colors.foreground,
                        fontSize: theme.typography.xs,
                      },
                    ]}
                  >
                    {t.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Opening Balance */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Opening Balance
          </Text>
          <Input
            value={openingBalance}
            onChangeText={setOpeningBalance}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </View>

        {/* Balance as of Date */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Balance As Of Date (YYYY-MM-DD)
          </Text>
          <Input
            value={balanceAsOfDate}
            onChangeText={setBalanceAsOfDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        {/* Masked Account Number */}
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Account / Card Number Mask (Optional)
          </Text>
          <Input
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder="e.g. •••• 4242"
          />
        </View>

        {/* Credit Card Specific Fields */}
        {isCreditCard ? (
          <View style={[styles.creditCardBox, { borderColor: theme.colors.border }]}>
            <View style={styles.creditHeader}>
              <CreditCard size={18} color={theme.colors.primary} />
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: theme.typography.sm,
                  color: theme.colors.foreground,
                }}
              >
                Credit Card Settings
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.label,
                  {
                    color: theme.colors.foreground,
                    fontSize: theme.typography.xs,
                  },
                ]}
              >
                Credit Limit
              </Text>
              <Input
                value={creditLimit}
                onChangeText={setCreditLimit}
                keyboardType="decimal-pad"
                placeholder="e.g. 150000"
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.label,
                  {
                    color: theme.colors.foreground,
                    fontSize: theme.typography.xs,
                  },
                ]}
              >
                Bill Generation Day of Month (1 - 31)
              </Text>
              <Input
                value={billGenerationDay}
                onChangeText={setBillGenerationDay}
                keyboardType="number-pad"
                placeholder="e.g. 15"
              />
            </View>
          </View>
        ) : null}

        {/* Color Picker */}
        <View style={{ gap: 8 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Account Color Tag
          </Text>
          <View style={styles.colorPalette}>
            {ACCOUNT_COLORS.map((c) => {
              const isSelected = color === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    isSelected && styles.colorDotSelected,
                  ]}
                >
                  {isSelected ? <Check size={14} color="#FFF" /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Buttons */}
        <View style={{ gap: 10, marginTop: 8 }}>
          <Button onPress={handleSave} disabled={saving} size="lg">
            {saving
              ? "Saving..."
              : isEditing
                ? "Update Account"
                : "Create Account"}
          </Button>

          {isEditing ? (
            <Button
              variant="destructive"
              onPress={handleDelete}
              disabled={saving}
            >
              Delete Account
            </Button>
          ) : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: "700",
  },
  typePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typePillText: {
    fontWeight: "700",
  },
  creditCardBox: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    marginTop: 4,
  },
  creditHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorPalette: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  colorDotSelected: {
    transform: [{ scale: 1.15 }],
    borderWidth: 2,
    borderColor: "#FFF",
  },
});

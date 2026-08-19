import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Check, CreditCard } from "lucide-react-native";

import { InstitutionSearchField } from "@/components/accounts/InstitutionSearchField";
import { SmsMatchingUnconfiguredText } from "@/components/accounts/SmsMatchingUnconfiguredText";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { Account } from "@/shared/types/expense";
import { getInstitutionById } from "@/shared/data/institutions";
import {
  defaultSmsMatchingEnabled,
  getAccountLast4,
  normalizeLast4,
  requiresCatalogInstitution,
  suggestedAccountDisplayName,
} from "@/shared/utils/accountIdentity";
import { canonicalAccountTypeId, getAccountKind } from "@/shared/utils/accountKind";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const ACCOUNT_COLORS = [
  "#4F46E5",
  "#2563EB",
  "#0D9488",
  "#16A34A",
  "#D97706",
  "#DC2626",
  "#9333EA",
  "#DB2777",
  "#475569",
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
  const { addAccount, updateAccount, deleteAccount } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { entries } = useAccountEntries();
  const { payments } = useAccountPayments();
  const { transfers } = useAccountTransfers();

  const isEditing = !!account?.id;

  const [name, setName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [balanceAsOfDate, setBalanceAsOfDate] = useState(
    formatDateKey(new Date())
  );
  const [accountNumber, setAccountNumber] = useState("");
  const [smsMatchingEnabled, setSmsMatchingEnabled] = useState(true);
  const [creditLimit, setCreditLimit] = useState("");
  const [billGenerationDay, setBillGenerationDay] = useState("1");
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (account) {
      setName(account.displayName || account.name || "");
      setDisplayNameTouched(true);
      setTypeId(account.typeId || (accountTypes[0]?.id ?? ""));
      setInstitutionId(getInstitutionById(account.institutionId)?.id ?? "");
      setOpeningBalance(
        account.openingBalance !== undefined ? String(account.openingBalance) : "0"
      );
      setBalanceAsOfDate(
        account.balanceAsOfDate || formatDateKey(new Date())
      );
      setAccountNumber(getAccountLast4(account) || account.accountNumber || "");
      setSmsMatchingEnabled(
        Boolean(getInstitutionById(account.institutionId)) &&
          account.smsMatchingEnabled !== false
      );
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
      setDisplayNameTouched(false);
      setTypeId(accountTypes[0]?.id ?? "");
      setInstitutionId("");
      setOpeningBalance("0");
      setBalanceAsOfDate(formatDateKey(new Date()));
      setAccountNumber("");
      setSmsMatchingEnabled(
        defaultSmsMatchingEnabled(
          canonicalAccountTypeId(accountTypes[0]?.name || "")
        )
      );
      setCreditLimit("");
      setBillGenerationDay("1");
      setColor(ACCOUNT_COLORS[0]);
    }
  }, [account, accountTypes, isOpen]);

  const selectedTypeName = useMemo(() => {
    const t = accountTypes.find((item) => item.id === typeId);
    return t ? t.name : "";
  }, [accountTypes, typeId]);

  const accountTypeId = canonicalAccountTypeId(selectedTypeName);
  const isCreditCard = getAccountKind(selectedTypeName) === "credit";
  const needsInstitution = requiresCatalogInstitution(accountTypeId);
  const catalogInstitution = getInstitutionById(institutionId);
  const catalogConfigured = Boolean(catalogInstitution);
  const matchingAllowed = !needsInstitution || catalogConfigured;
  const suggestedName = suggestedAccountDisplayName(
    catalogInstitution,
    accountTypeId
  );

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

  const applySuggestedName = (
    nextInstitutionId: string,
    nextTypeName: string
  ) => {
    if (displayNameTouched) return;
    const nextTypeId = canonicalAccountTypeId(nextTypeName);
    setName(
      suggestedAccountDisplayName(
        getInstitutionById(nextInstitutionId),
        nextTypeId
      )
    );
  };

  const handleSave = async () => {
    if (!typeId) {
      toast.error("Please select an account type");
      return;
    }
    if (needsInstitution && !catalogInstitution && !isEditing) {
      toast.error("Select an institution from the list");
      return;
    }
    if (
      !isEditing &&
      needsInstitution &&
      smsMatchingEnabled &&
      !catalogInstitution
    ) {
      toast.error("Select an institution to enable SMS matching");
      return;
    }

    const trimmedName = name.trim() || suggestedName;
    if (!trimmedName) {
      toast.error("Display name is required");
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

      const last4 = normalizeLast4(accountNumber);
      const extras: Partial<Account> = {
        openingBalance: parsedOpening,
        balanceAsOfDate: balanceAsOfDate || formatDateKey(new Date()),
        last4,
        accountNumber: last4,
        institutionId: catalogInstitution?.id || "",
        smsMatchingEnabled: matchingAllowed && smsMatchingEnabled,
        displayName: trimmedName,
        accountTypeId,
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
      logError("editAccountModal.saveAccount", err);
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
              logError("editAccountModal.deleteAccount", err);
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
        {isEditing && needsInstitution && !catalogConfigured ? (
          <View style={{ gap: 4 }}>
            <SmsMatchingUnconfiguredText
              account={account ?? { institutionId: "", accountTypeId }}
              typeName={selectedTypeName}
            />
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.xs,
              }}
            >
              Search and select an institution to enable SMS matching. Other
              account details can still be saved.
            </Text>
          </View>
        ) : null}

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
                    const nextTypeId = canonicalAccountTypeId(t.name);
                    if (!requiresCatalogInstitution(nextTypeId)) {
                      setInstitutionId("");
                    }
                    if (!isEditing) {
                      setSmsMatchingEnabled(
                        defaultSmsMatchingEnabled(nextTypeId)
                      );
                    }
                    applySuggestedName(
                      requiresCatalogInstitution(nextTypeId)
                        ? institutionId
                        : "",
                      t.name
                    );
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

        {needsInstitution ? (
          <InstitutionSearchField
            selectedId={institutionId}
            required
            onSelect={(institution) => {
              const nextId = institution?.id ?? "";
              setInstitutionId(nextId);
              if (institution) {
                setSmsMatchingEnabled(true);
              } else if (isEditing) {
                setSmsMatchingEnabled(false);
              }
              applySuggestedName(nextId, selectedTypeName);
            }}
          />
        ) : null}

        {accountTypeId !== "cash" ? (
          <Input
            label="Card / account number"
            value={accountNumber}
            onChangeText={(value) => setAccountNumber(value.replace(/\D/g, ""))}
            onBlur={() => {
              setAccountNumber((prev) => normalizeLast4(prev) || prev);
            }}
            placeholder="Last 4, or paste the full number"
            keyboardType="number-pad"
            helperText="Only the last 4 digits are saved. Used to match bank SMS."
          />
        ) : null}

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
                helperText="A statement is created on this day from cycle spend. Due date is 5 days later."
              />
            </View>
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.label,
              { color: theme.colors.foreground, fontSize: theme.typography.sm },
            ]}
          >
            Display Name
          </Text>
          <Input
            value={name}
            onChangeText={(value) => {
              setDisplayNameTouched(true);
              setName(value);
            }}
            placeholder={suggestedName || "e.g. Super Money Credit Card"}
          />
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.xs,
            }}
          >
            Optional. Separate from institution identity. Defaults to Institution +
            Account Type.
          </Text>
        </View>

        <Pressable
          onPress={() => {
            if (!matchingAllowed) return;
            setSmsMatchingEnabled((prev) => !prev);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            minHeight: 52,
            opacity: matchingAllowed ? 1 : 0.55,
          }}
          accessibilityRole="switch"
          accessibilityState={{
            checked: matchingAllowed && smsMatchingEnabled,
            disabled: !matchingAllowed,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={[
                styles.label,
                { color: theme.colors.foreground, fontSize: theme.typography.sm },
              ]}
            >
              Use for SMS matching
            </Text>
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.xs,
              }}
            >
              {needsInstitution && !catalogConfigured
                ? "SMS matching not configured until you select an institution."
                : accountTypeId === "cash"
                  ? "Cash accounts are excluded from SMS matching by default."
                  : "Bank and card accounts are included by default."}
            </Text>
          </View>
          <Switch
            value={matchingAllowed && smsMatchingEnabled}
            onValueChange={setSmsMatchingEnabled}
            disabled={!matchingAllowed}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            thumbColor="#FFFFFF"
          />
        </Pressable>

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

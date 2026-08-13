import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import { useAccounts } from "@/hooks/useAccounts";
import type { CreateBorrowingInput } from "@/hooks/useBorrowings";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  INTEREST_BASES,
  INTEREST_BASIS_LABELS,
  INTEREST_FREQUENCIES,
  INTEREST_FREQUENCY_LABELS,
  LENDER_TYPES,
  LENDER_TYPE_LABELS,
  type InterestBasis,
  type InterestFrequency,
  type LenderType,
} from "@/shared/types/borrowing";
import { isValidDateKey, todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface CreateBorrowingModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: CreateBorrowingInput) => Promise<string | null>;
}

export function CreateBorrowingModal({
  visible,
  onClose,
  onSubmit,
}: CreateBorrowingModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { accounts } = useAccounts();

  const [lenderType, setLenderType] = useState<LenderType>("FINANCE_INSTITUTION");
  const [lenderName, setLenderName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [interestFrequency, setInterestFrequency] =
    useState<InterestFrequency>("ANNUAL");
  const [interestBasis, setInterestBasis] = useState<InterestBasis>(
    "OUTSTANDING_PRINCIPAL"
  );
  const [borrowedDate, setBorrowedDate] = useState(todayDateKey());
  const [dueDate, setDueDate] = useState("");
  const [creditedAccountId, setCreditedAccountId] = useState<string>("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isInterestFree = interestFrequency === "NONE";

  const resetForm = () => {
    setLenderType("FINANCE_INSTITUTION");
    setLenderName("");
    setPrincipal("");
    setInterestRate("");
    setInterestFrequency("ANNUAL");
    setInterestBasis("OUTSTANDING_PRINCIPAL");
    setBorrowedDate(todayDateKey());
    setDueDate("");
    setCreditedAccountId("");
    setNote("");
  };

  const handleSave = async () => {
    if (!lenderName.trim()) {
      toast.error("Who did you borrow from?");
      return;
    }

    const numPrincipal = Number(principal);
    if (!Number.isFinite(numPrincipal) || numPrincipal <= 0) {
      toast.error("Enter a valid amount borrowed");
      return;
    }

    if (!isValidDateKey(borrowedDate)) {
      toast.error("Borrowed date must be YYYY-MM-DD");
      return;
    }

    if (dueDate.trim() && !isValidDateKey(dueDate.trim())) {
      toast.error("Due date must be YYYY-MM-DD");
      return;
    }

    const numRate = isInterestFree ? 0 : Number(interestRate) || 0;

    setIsSubmitting(true);
    try {
      const created = await onSubmit({
        lenderType,
        lenderName: lenderName.trim(),
        note: note.trim(),
        principalAmount: numPrincipal,
        interestRate: numRate,
        interestType: isInterestFree || numRate <= 0 ? "NONE" : "SIMPLE",
        interestFrequency,
        interestBasis,
        borrowedDate,
        dueDate: dueDate.trim() ? dueDate.trim() : null,
        creditedAccountId: creditedAccountId || null,
      });

      if (created) {
        resetForm();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const pillStyle = (isActive: boolean) => ({
    backgroundColor: isActive
      ? theme.colors.primary
      : isDark
        ? "rgba(255,255,255,0.06)"
        : "rgba(0,0,0,0.04)",
    borderColor: isActive ? theme.colors.primary : theme.colors.border,
  });

  const pillTextStyle = (isActive: boolean) => ({
    color: isActive ? theme.colors.primaryForeground : theme.colors.foreground,
    fontWeight: isActive ? ("700" as const) : ("500" as const),
  });

  return (
    <Modal isOpen={visible} onClose={onClose} title="Record Borrowing">
      <View style={styles.body}>
        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Borrowed From
          </Text>
          <View style={styles.pillWrap}>
            {LENDER_TYPES.map((type) => {
              const isActive = lenderType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setLenderType(type);
                  }}
                  style={[styles.pill, pillStyle(isActive)]}
                >
                  <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                    {LENDER_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Lender Name *
          </Text>
          <Input
            value={lenderName}
            onChangeText={setLenderName}
            placeholder="e.g. Super Finance"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Amount Borrowed ({system.defaultCurrency}) *
          </Text>
          <Input
            value={principal}
            onChangeText={setPrincipal}
            placeholder="e.g. 20000"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Interest
          </Text>
          <View style={styles.pillWrap}>
            {INTEREST_FREQUENCIES.map((freq) => {
              const isActive = interestFrequency === freq;
              return (
                <Pressable
                  key={freq}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setInterestFrequency(freq);
                  }}
                  style={[styles.pill, pillStyle(isActive)]}
                >
                  <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                    {INTEREST_FREQUENCY_LABELS[freq]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {isInterestFree ? null : (
          <>
            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Interest Rate (%)
              </Text>
              <Input
                value={interestRate}
                onChangeText={setInterestRate}
                placeholder={
                  interestFrequency === "MONTHLY" ? "e.g. 1" : "e.g. 12"
                }
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Charged On
              </Text>
              <View style={styles.pillWrap}>
                {INTEREST_BASES.map((basis) => {
                  const isActive = interestBasis === basis;
                  return (
                    <Pressable
                      key={basis}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setInterestBasis(basis);
                      }}
                      style={[styles.pill, pillStyle(isActive)]}
                    >
                      <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                        {INTEREST_BASIS_LABELS[basis]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text
                style={[styles.helper, { color: theme.colors.mutedForeground }]}
              >
                {interestBasis === "ORIGINAL_PRINCIPAL"
                  ? "Interest always charged on the full amount borrowed."
                  : "Interest charged only on what is still owed."}
              </Text>
            </View>
          </>
        )}

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Borrowed Date
          </Text>
          <Input
            value={borrowedDate}
            onChangeText={setBorrowedDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Credited To Account
          </Text>
          {accounts.length === 0 ? (
            <Text
              style={[styles.helper, { color: theme.colors.mutedForeground }]}
            >
              No accounts yet. You can link one later.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              <Pressable
                onPress={() => setCreditedAccountId("")}
                style={[styles.pill, pillStyle(creditedAccountId === "")]}
              >
                <Text
                  style={[styles.pillText, pillTextStyle(creditedAccountId === "")]}
                >
                  None
                </Text>
              </Pressable>
              {accounts.map((account) => {
                const isActive = creditedAccountId === account.id;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setCreditedAccountId(account.id);
                    }}
                    style={[styles.pill, pillStyle(isActive)]}
                  >
                    <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                      {account.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Text style={[styles.helper, { color: theme.colors.mutedForeground }]}>
            Increases this account&apos;s balance. Not counted as income.
          </Text>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Due Date (optional)
          </Text>
          <Input
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Note (optional)
          </Text>
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="Purpose of this borrowing"
          />
        </View>

        <Button
          onPress={handleSave}
          loading={isSubmitting}
          disabled={!lenderName.trim() || !principal || isSubmitting}
        >
          <Text style={{ fontWeight: "800", color: theme.colors.primaryForeground }}>
            Record Borrowing
          </Text>
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
    paddingBottom: 8,
  },
  group: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  helper: {
    fontSize: 11,
  },
  pillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
  },
});

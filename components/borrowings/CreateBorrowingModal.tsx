import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Chip } from "@/components/ui/Chip";
import { toast } from "@/lib/toast";
import { useAccounts } from "@/hooks/useAccounts";
import type { CreateBorrowingInput } from "@/hooks/useBorrowings";
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
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

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
  const { theme } = useTheme();
  const displayCurrency = useDisplayCurrency();
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
                <Chip
                  key={type}
                  label={LENDER_TYPE_LABELS[type]}
                  selected={isActive}
                  onPress={() => setLenderType(type)}
                />
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
            Amount Borrowed ({displayCurrency}) *
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
                <Chip
                  key={freq}
                  label={INTEREST_FREQUENCY_LABELS[freq]}
                  selected={isActive}
                  onPress={() => setInterestFrequency(freq)}
                />
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
                    <Chip
                      key={basis}
                      label={INTEREST_BASIS_LABELS[basis]}
                      selected={isActive}
                      onPress={() => setInterestBasis(basis)}
                    />
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
              <Chip
                label="None"
                selected={creditedAccountId === ""}
                onPress={() => setCreditedAccountId("")}
              />
              {accounts.map((account) => {
                const isActive = creditedAccountId === account.id;
                return (
                  <Chip
                    key={account.id}
                    label={account.name}
                    selected={isActive}
                    onPress={() => setCreditedAccountId(account.id)}
                  />
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

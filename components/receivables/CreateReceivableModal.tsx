import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import { useAccounts } from "@/hooks/useAccounts";
import type { CreateReceivableInput } from "@/hooks/useReceivables";
import { useSpaces } from "@/hooks/useSpaces";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  PERSON_TYPES,
  PERSON_TYPE_LABELS,
  type PersonType,
} from "@/shared/types/receivable";
import { isValidDateKey, todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface CreateReceivableModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: CreateReceivableInput) => Promise<string | null>;
}

export function CreateReceivableModal({
  visible,
  onClose,
  onSubmit,
}: CreateReceivableModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { accounts } = useAccounts();
  const { spaces } = useSpaces();

  const [personType, setPersonType] = useState<PersonType>("FRIEND");
  const [personName, setPersonName] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [lentDate, setLentDate] = useState(todayDateKey());
  const [dueDate, setDueDate] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeSpaces = useMemo(
    () =>
      spaces.filter(
        (space) => space.status === "ACTIVE" || space.id === spaceId
      ),
    [spaces, spaceId]
  );

  const resetForm = () => {
    setPersonType("FRIEND");
    setPersonName("");
    setOriginalAmount("");
    setSourceAccountId("");
    setLentDate(todayDateKey());
    setDueDate("");
    setPurpose("");
    setNote("");
    setSpaceId("");
  };

  const handleSave = async () => {
    if (!personName.trim()) {
      toast.error("Who did you lend money to?");
      return;
    }

    const numAmount = Number(originalAmount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      toast.error("Enter a valid amount lent");
      return;
    }

    if (!sourceAccountId) {
      toast.error("Select the account the money was paid from");
      return;
    }

    if (!isValidDateKey(lentDate)) {
      toast.error("Lent date must be YYYY-MM-DD");
      return;
    }

    if (dueDate.trim() && !isValidDateKey(dueDate.trim())) {
      toast.error("Due date must be YYYY-MM-DD");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await onSubmit({
        personType,
        personName: personName.trim(),
        originalAmount: numAmount,
        sourceAccountId,
        lentDate,
        dueDate: dueDate.trim() ? dueDate.trim() : null,
        purpose: purpose.trim(),
        note: note.trim(),
        ...(spaceId ? { spaceId } : {}),
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
    <Modal isOpen={visible} onClose={onClose} title="Record Money Lent">
      <View style={styles.body}>
        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Person Type
          </Text>
          <View style={styles.pillWrap}>
            {PERSON_TYPES.map((type) => {
              const isActive = personType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setPersonType(type);
                  }}
                  style={[styles.pill, pillStyle(isActive)]}
                >
                  <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                    {PERSON_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Person Name *
          </Text>
          <Input
            value={personName}
            onChangeText={setPersonName}
            placeholder="e.g. Rahul"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Amount Lent ({system.defaultCurrency}) *
          </Text>
          <Input
            value={originalAmount}
            onChangeText={setOriginalAmount}
            placeholder="e.g. 5000"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Paid From Account *
          </Text>
          {accounts.length === 0 ? (
            <Text
              style={[styles.helper, { color: theme.colors.mutedForeground }]}
            >
              Add an account first before recording money lent.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {accounts.map((account) => {
                const isActive = sourceAccountId === account.id;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setSourceAccountId(account.id);
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
            Decreases this account&apos;s balance. Not counted as an expense.
          </Text>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Lent Date
          </Text>
          <Input
            value={lentDate}
            onChangeText={setLentDate}
            placeholder="YYYY-MM-DD"
          />
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
            Purpose (optional)
          </Text>
          <Input
            value={purpose}
            onChangeText={setPurpose}
            placeholder="e.g. Emergency loan"
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Note (optional)
          </Text>
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="Any additional details"
          />
        </View>

        {activeSpaces.length > 0 ? (
          <View style={styles.group}>
            <Text style={[styles.label, { color: theme.colors.foreground }]}>
              Space (optional)
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              <Pressable
                onPress={() => setSpaceId("")}
                style={[styles.pill, pillStyle(spaceId === "")]}
              >
                <Text style={[styles.pillText, pillTextStyle(spaceId === "")]}>
                  None
                </Text>
              </Pressable>
              {activeSpaces.map((space) => {
                const isActive = spaceId === space.id;
                return (
                  <Pressable
                    key={space.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setSpaceId(space.id ?? "");
                    }}
                    style={[styles.pill, pillStyle(isActive)]}
                  >
                    <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                      {space.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <Button
          onPress={handleSave}
          loading={isSubmitting}
          disabled={
            !personName.trim() ||
            !originalAmount ||
            !sourceAccountId ||
            isSubmitting
          }
        >
          <Text style={{ fontWeight: "800", color: theme.colors.primaryForeground }}>
            Record Money Lent
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

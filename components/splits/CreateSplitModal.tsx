import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Plus, Trash2, Users, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/providers/AuthProvider";
import { useCategories } from "@/hooks/useCategories";
import { useSplits } from "@/hooks/useSplits";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Participant, SplitType } from "@/shared/types/split";
import {
  calculateEqualSplits,
  validateCustomSplits,
} from "@/shared/utils/splitMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface CreateSplitModalProps {
  visible: boolean;
  onClose: () => void;
}

interface TempParticipant {
  id: string;
  name: string;
  amount: string;
  upiId: string;
  isCurrentUser: boolean;
}

export function CreateSplitModal({ visible, onClose }: CreateSplitModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();
  const { settings: system } = useSystemSettings();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { createSplit } = useSplits();

  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [category, setCategory] = useState("Food & Dining");
  const [logPersonalExpense, setLogPersonalExpense] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [participants, setParticipants] = useState<TempParticipant[]>([]);

  useEffect(() => {
    if (visible) {
      setTitle("");
      setTotalAmount("");
      setSplitType("equal");
      setCategory("Food & Dining");
      setLogPersonalExpense(true);
      setSelectedAccountId(accounts.length > 0 ? accounts[0].id : "");
      setParticipants([
        {
          id: "curr-user",
          name: "You (Payer)",
          amount: "",
          upiId: "",
          isCurrentUser: true,
        },
        {
          id: "p-2",
          name: "",
          amount: "",
          upiId: "",
          isCurrentUser: false,
        },
      ]);
    }
  }, [visible, accounts]);

  const numTotal = parseFloat(totalAmount) || 0;

  // Auto-calculated equal shares preview
  const equalShares = useMemo(() => {
    if (splitType !== "equal" || numTotal <= 0 || participants.length === 0) {
      return [];
    }
    return calculateEqualSplits(numTotal, participants);
  }, [splitType, numTotal, participants]);

  // Custom split difference validation
  const customValidation = useMemo(() => {
    if (splitType !== "custom") return { isValid: true, difference: 0 };
    const customList: Participant[] = participants.map((p) => ({
      name: p.name || "Friend",
      amount: parseFloat(p.amount) || 0,
      paid: p.isCurrentUser,
      upiId: p.upiId,
      isCurrentUser: p.isCurrentUser,
    }));
    return validateCustomSplits(numTotal, customList);
  }, [splitType, numTotal, participants]);

  const handleAddParticipant = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setParticipants((prev) => [
      ...prev,
      {
        id: `p-${Date.now()}`,
        name: "",
        amount: "",
        upiId: "",
        isCurrentUser: false,
      },
    ]);
  };

  const handleRemoveParticipant = (id: string) => {
    if (participants.length <= 2) {
      Alert.alert("Notice", "A split requires at least 2 participants.");
      return;
    }
    Haptics.selectionAsync().catch(() => undefined);
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpdateParticipant = (
    id: string,
    field: "name" | "amount" | "upiId",
    value: string
  ) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a split title.");
      return;
    }

    if (numTotal <= 0) {
      Alert.alert("Error", "Please enter a valid total amount.");
      return;
    }

    const namedParticipants = participants.filter((p) => p.name.trim().length > 0);
    if (namedParticipants.length < 2) {
      Alert.alert("Error", "Please provide names for at least 2 participants.");
      return;
    }

    let finalParticipants: Participant[] = [];

    if (splitType === "equal") {
      finalParticipants = calculateEqualSplits(numTotal, namedParticipants);
    } else {
      if (!customValidation.isValid) {
        Alert.alert(
          "Amount Mismatch",
          `The sum of custom amounts is off by ${system.defaultCurrency} ${Math.abs(
            customValidation.difference
          ).toFixed(2)}.`
        );
        return;
      }
      finalParticipants = namedParticipants.map((p) => ({
        name: p.name.trim(),
        amount: parseFloat(p.amount) || 0,
        paid: p.isCurrentUser,
        upiId: p.upiId.trim() || undefined,
        isCurrentUser: p.isCurrentUser,
      }));
    }

    setIsSubmitting(true);
    try {
      await createSplit(
        {
          title: title.trim(),
          totalAmount: numTotal,
          splitType,
          category,
          participants: finalParticipants,
        },
        {
          createPersonalExpense: logPersonalExpense,
          accountId: selectedAccountId || undefined,
        }
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text
                style={[styles.title, { color: theme.colors.cardForeground }]}
              >
                Split an Expense
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                Divide costs with friends & request UPI payments
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { opacity: 0.6 },
              ]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                SPLIT TITLE
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Weekend BBQ, Goa Trip Hotel, Movie Night"
                placeholderTextColor={theme.colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.02)",
                    borderColor: theme.colors.border,
                    color: theme.colors.foreground,
                  },
                ]}
              />
            </View>

            {/* Total Amount */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                TOTAL BILL ({system.defaultCurrency})
              </Text>
              <TextInput
                value={totalAmount}
                onChangeText={setTotalAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.02)",
                    borderColor: theme.colors.border,
                    color: theme.colors.foreground,
                    fontSize: theme.typography.lg,
                    fontWeight: "700",
                  },
                ]}
              />
            </View>

            {/* Split Type Selector */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                SPLIT METHOD
              </Text>
              <View
                style={[
                  styles.segmentRow,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.04)",
                  },
                ]}
              >
                {(
                  [
                    { key: "equal", label: "Equal Split" },
                    { key: "custom", label: "Custom Amounts" },
                  ] as const
                ).map((item) => {
                  const isSelected = splitType === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setSplitType(item.key);
                      }}
                      style={[
                        styles.segmentBtn,
                        isSelected && {
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isSelected
                              ? theme.colors.primaryForeground
                              : theme.colors.mutedForeground,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Participants Builder */}
            <View style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  PARTICIPANTS ({participants.length})
                </Text>
                <Pressable
                  onPress={handleAddParticipant}
                  style={({ pressed }) => [
                    styles.addFriendBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Plus size={12} color={theme.colors.primary} />
                  <Text
                    style={[
                      styles.addFriendText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    Add Friend
                  </Text>
                </Pressable>
              </View>

              {participants.map((p, index) => {
                const calculatedShare = equalShares[index]?.amount || 0;

                return (
                  <View
                    key={p.id}
                    style={[
                      styles.participantCard,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.03)"
                          : "rgba(0,0,0,0.02)",
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.participantTop}>
                      <TextInput
                        value={p.name}
                        onChangeText={(val) =>
                          handleUpdateParticipant(p.id, "name", val)
                        }
                        placeholder={
                          p.isCurrentUser
                            ? "You (Payer)"
                            : `Friend ${index}`
                        }
                        placeholderTextColor={theme.colors.mutedForeground}
                        style={[
                          styles.participantNameInput,
                          { color: theme.colors.foreground },
                        ]}
                      />

                      {splitType === "equal" ? (
                        <Text
                          style={[
                            styles.equalSharePreview,
                            { color: theme.colors.foreground },
                          ]}
                        >
                          {system.defaultCurrency} {calculatedShare.toFixed(2)}
                        </Text>
                      ) : (
                        <TextInput
                          value={p.amount}
                          onChangeText={(val) =>
                            handleUpdateParticipant(p.id, "amount", val)
                          }
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          placeholderTextColor={theme.colors.mutedForeground}
                          style={[
                            styles.customAmountInput,
                            {
                              backgroundColor: isDark
                                ? "rgba(255,255,255,0.06)"
                                : "rgba(0,0,0,0.04)",
                              borderColor: theme.colors.border,
                              color: theme.colors.foreground,
                            },
                          ]}
                        />
                      )}

                      {!p.isCurrentUser && (
                        <Pressable
                          onPress={() => handleRemoveParticipant(p.id)}
                          style={({ pressed }) => [
                            styles.deleteBtn,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <Trash2 size={16} color={theme.colors.destructive} />
                        </Pressable>
                      )}
                    </View>

                    {!p.isCurrentUser && (
                      <TextInput
                        value={p.upiId}
                        onChangeText={(val) =>
                          handleUpdateParticipant(p.id, "upiId", val)
                        }
                        placeholder="UPI ID (optional, e.g. name@okaxis)"
                        placeholderTextColor={theme.colors.mutedForeground}
                        style={[
                          styles.upiInput,
                          {
                            borderColor: theme.colors.border,
                            color: theme.colors.mutedForeground,
                          },
                        ]}
                      />
                    )}
                  </View>
                );
              })}

              {splitType === "custom" && !customValidation.isValid && (
                <Text style={{ fontSize: 11, color: theme.colors.destructive, fontWeight: "600" }}>
                  {customValidation.difference > 0
                    ? `Remaining to allocate: ${system.defaultCurrency} ${customValidation.difference.toFixed(2)}`
                    : `Over allocated by: ${system.defaultCurrency} ${Math.abs(customValidation.difference).toFixed(2)}`}
                </Text>
              )}
            </View>

            {/* Category */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                CATEGORY
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {categories.map((c) => {
                  const isSelected = category === c.name;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setCategory(c.name)}
                      style={[
                        styles.chip,
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
                          styles.chipText,
                          {
                            color: isSelected
                              ? theme.colors.primaryForeground
                              : theme.colors.foreground,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Log Personal Share Toggle */}
            <View
              style={[
                styles.toggleCard,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(0,0,0,0.02)",
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: theme.typography.sm,
                    fontWeight: "700",
                    color: theme.colors.foreground,
                  }}
                >
                  Record my share as expense
                </Text>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Auto-adds your portion to this month's ledger
                </Text>
              </View>
              <Switch
                value={logPersonalExpense}
                onValueChange={setLogPersonalExpense}
                trackColor={{
                  true: theme.colors.primary,
                  false: theme.colors.muted,
                }}
              />
            </View>

            {/* Account Selector if logging personal share */}
            {logPersonalExpense && (
              <View style={{ gap: 6 }}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  PAID FROM ACCOUNT
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {accounts.map((acc) => {
                    const isSelected = selectedAccountId === acc.id;
                    return (
                      <Pressable
                        key={acc.id}
                        onPress={() => setSelectedAccountId(acc.id)}
                        style={[
                          styles.chip,
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
                            styles.chipText,
                            {
                              color: isSelected
                                ? theme.colors.primaryForeground
                                : theme.colors.foreground,
                              fontWeight: isSelected ? "700" : "500",
                            },
                          ]}
                        >
                          {acc.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.actionFooter}>
            <Button
              variant="outline"
              onPress={onClose}
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={handleSave}
              disabled={isSubmitting}
              style={{ flex: 2 }}
            >
              {isSubmitting ? "Creating Split..." : "Create Split"}
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
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
  closeButton: {
    padding: 4,
  },
  scrollArea: {
    maxHeight: 460,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  segmentRow: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 11,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  addFriendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addFriendText: {
    fontSize: 11,
    fontWeight: "700",
  },
  participantCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  participantTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  participantNameInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    padding: 0,
  },
  equalSharePreview: {
    fontSize: 13,
    fontWeight: "700",
  },
  customAmountInput: {
    width: 80,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: "right",
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: "700",
  },
  deleteBtn: {
    padding: 4,
  },
  upiInput: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    fontSize: 11,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  actionFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
});

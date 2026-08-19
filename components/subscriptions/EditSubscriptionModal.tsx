import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
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
  Repeat,
  Trash2,
  X,
} from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Subscription, SubscriptionFrequency } from "@/shared/types/subscription";
import { subscriptionFrequency } from "@/shared/types/subscription";
import { todayDateKey } from "@/shared/utils/dates";
import { acceptRecurringSuggestion } from "@/services/sms/smsRecurringSync";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface EditSubscriptionModalProps {
  visible: boolean;
  subscription?: Subscription | null;
  suggestionKey?: string | null;
  onClose: () => void;
}

export function EditSubscriptionModal({
  visible,
  subscription,
  suggestionKey,
  onClose,
}: EditSubscriptionModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { addSubscription, updateSubscription, deleteSubscription } =
    useSubscriptions();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"subscription" | "emi" | "transfer">(
    "subscription"
  );
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [frequency, setFrequency] = useState<SubscriptionFrequency>("monthly");
  const [intervalDays, setIntervalDays] = useState("2");
  const [category, setCategory] = useState("Subscriptions");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [endYear, setEndYear] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (subscription) {
      setName(subscription.name || "");
      setAmount(subscription.amount ? String(subscription.amount) : "");
      setType(subscription.type || "subscription");
      setDayOfMonth(String(subscription.dayOfMonth || 1));
      setFrequency(subscriptionFrequency(subscription));
      setIntervalDays(String(subscription.intervalDays || 2));
      setCategory(subscription.category || "Subscriptions");
      setAccountId(subscription.accountId || "");
      setToAccountId(subscription.toAccountId || "");
      setEndMonth(subscription.endMonth ? String(subscription.endMonth) : "");
      setEndYear(subscription.endYear ? String(subscription.endYear) : "");
    } else {
      setName("");
      setAmount("");
      setType("subscription");
      setDayOfMonth("1");
      setFrequency("monthly");
      setIntervalDays("2");
      setCategory("Subscriptions");
      setAccountId(accounts.length > 0 ? accounts[0].id : "");
      setToAccountId(accounts.length > 1 ? accounts[1].id : "");
      setEndMonth("");
      setEndYear("");
    }
  }, [subscription, visible, accounts]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a recurring name.");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("Error", "Please enter a valid amount.");
      return;
    }

    const effectiveFrequency: SubscriptionFrequency =
      type === "emi" ? "monthly" : frequency;

    if (effectiveFrequency === "monthly") {
      const numDay = parseInt(dayOfMonth, 10);
      if (isNaN(numDay) || numDay < 1 || numDay > 31) {
        Alert.alert("Error", "Day of month must be between 1 and 31.");
        return;
      }
    }

    const numInterval = parseInt(intervalDays, 10);
    if (effectiveFrequency === "every_n_days") {
      if (isNaN(numInterval) || numInterval < 1 || numInterval > 365) {
        Alert.alert("Error", "Repeat every N days must be between 1 and 365.");
        return;
      }
    }

    const numDay = parseInt(dayOfMonth, 10);

    if (type === "transfer" && accountId && toAccountId && accountId === toAccountId) {
      Alert.alert("Error", "Source and destination accounts must be different.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<Subscription, "id"> = {
        name: name.trim(),
        amount: numAmount,
        type,
        dayOfMonth: Number.isFinite(numDay) && numDay >= 1 ? Math.min(31, numDay) : 1,
        frequency: effectiveFrequency,
        intervalDays:
          effectiveFrequency === "every_n_days" ? numInterval : undefined,
        category: type === "transfer" ? "Transfers" : category || "Subscriptions",
        isActive: subscription ? subscription.isActive : true,
        lastProcessed: subscription?.lastProcessed || "",
        lastProcessedDate:
          subscription?.lastProcessedDate ||
          (effectiveFrequency === "every_n_days" ? todayDateKey() : undefined),
        accountId: accountId || undefined,
        toAccountId: type === "transfer" ? toAccountId || undefined : undefined,
        endMonth: type === "emi" && endMonth ? parseInt(endMonth, 10) : undefined,
        endYear: type === "emi" && endYear ? parseInt(endYear, 10) : undefined,
        source: subscription?.source,
      };

      if (subscription?.id) {
        await updateSubscription(subscription.id, payload);
      } else {
        const id = await addSubscription(payload);
        if (id && suggestionKey) {
          await acceptRecurringSuggestion(suggestionKey);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!subscription?.id) return;
    Alert.alert(
      "Delete Recurring Item",
      `Are you sure you want to delete "${subscription.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteSubscription(subscription.id!);
            onClose();
          },
        },
      ]
    );
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
                {subscription?.id
                  ? "Edit Recurring"
                  : suggestionKey
                    ? "Review Recurring"
                    : "New Recurring"}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                Manage scheduled bills, EMIs, and auto-transfers
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
            {/* Type Selector */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                TYPE
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
                    { key: "subscription", label: "Subscription" },
                    { key: "emi", label: "EMI / Loan" },
                    { key: "transfer", label: "Auto-Transfer" },
                  ] as const
                ).map((item) => {
                  const isSelected = type === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setType(item.key);
                        if (item.key === "emi") setFrequency("monthly");
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

            {/* Name */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                NAME
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Netflix 4K, Car EMI, SIP Savings"
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

            {/* Amount */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                AMOUNT ({system.defaultCurrency})
              </Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
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

            {/* Frequency */}
            {type !== "emi" ? (
              <View style={{ gap: 6 }}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  FREQUENCY
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
                      { key: "every_n_days", label: "Every N days" },
                      { key: "monthly", label: "Monthly" },
                    ] as const
                  ).map((item) => {
                    const isSelected = frequency === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => undefined);
                          setFrequency(item.key);
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
            ) : null}

            {type !== "emi" && frequency === "every_n_days" ? (
              <View style={{ gap: 6 }}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  REPEAT EVERY N DAYS
                </Text>
                <TextInput
                  value={intervalDays}
                  onChangeText={setIntervalDays}
                  placeholder="2"
                  keyboardType="number-pad"
                  maxLength={3}
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
            ) : (
              <View style={{ gap: 6 }}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  BILLING DAY OF MONTH (1–31)
                </Text>
                <TextInput
                  value={dayOfMonth}
                  onChangeText={setDayOfMonth}
                  placeholder="1"
                  keyboardType="number-pad"
                  maxLength={2}
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
            )}

            {/* Category (if not transfer) */}
            {type !== "transfer" && (
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
            )}

            {/* Account Selector */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                {type === "transfer" ? "SOURCE ACCOUNT" : "LINKED ACCOUNT"}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {accounts.map((acc) => {
                  const isSelected = accountId === acc.id;
                  return (
                    <Pressable
                      key={acc.id}
                      onPress={() => setAccountId(acc.id)}
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

            {/* Destination Account (if transfer) */}
            {type === "transfer" && (
              <View style={{ gap: 6 }}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  DESTINATION ACCOUNT
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {accounts.map((acc) => {
                    const isSelected = toAccountId === acc.id;
                    return (
                      <Pressable
                        key={acc.id}
                        onPress={() => setToAccountId(acc.id)}
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

            {/* EMI End Date (if EMI) */}
            {type === "emi" && (
              <View style={{ gap: 6 }}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  FINAL TERM (END MONTH & YEAR)
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput
                    value={endMonth}
                    onChangeText={setEndMonth}
                    placeholder="Month (1-12)"
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.02)",
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                  <TextInput
                    value={endYear}
                    onChangeText={setEndYear}
                    placeholder="Year (e.g. 2028)"
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.02)",
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionFooter}>
            {subscription?.id ? (
              <Button
                variant="destructive"
                onPress={handleDelete}
                style={{ flex: 1 }}
              >
                Delete
              </Button>
            ) : null}
            <Button
              variant="primary"
              onPress={handleSave}
              disabled={isSubmitting}
              style={{ flex: subscription?.id ? 2 : 1 }}
            >
              {isSubmitting
                ? "Saving..."
                : subscription?.id
                  ? "Update Recurring"
                  : suggestionKey
                    ? "Add Recurring"
                    : "Save Recurring"}
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
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
  },
  actionFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
});

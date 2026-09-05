import { useEffect, useRef, useState } from "react";
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
import type { Subscription, SubscriptionFrequency } from "@/shared/types/subscription";
import { subscriptionFrequency } from "@/shared/types/subscription";
import { todayDateKey } from "@/shared/utils/dates";
import { acceptRecurringSuggestion } from "@/services/sms/smsRecurringSync";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface EditSubscriptionModalProps {
  visible: boolean;
  subscription?: Subscription | null;
  suggestionKey?: string | null;
  onClose: () => void;
}

/**
 * The month a new monthly item should first debit in.
 *
 * Adding an EMI billed on the 3rd on the 5th of the month must not backdate a
 * payment into the month that has already passed its billing day — the first
 * debit belongs to the next month. Returns `{ month, year }` (month is 1-12).
 */
export function defaultFirstDebit(
  billingDay: number,
  today = new Date()
): { month: number; year: number } {
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const daysThisMonth = new Date(year, month, 0).getDate();
  const effectiveDay = Math.min(Math.max(1, billingDay || 1), daysThisMonth);

  if (today.getDate() <= effectiveDay) return { month, year };
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
}

export function EditSubscriptionModal({
  visible,
  subscription,
  suggestionKey,
  onClose,
}: EditSubscriptionModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
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
  const [startMonth, setStartMonth] = useState("");
  const [startYear, setStartYear] = useState("");
  const startTouched = useRef(false);
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
      setCategory(subscription.category || "Entertainment");
      setAccountId(subscription.accountId || "");
      setToAccountId(subscription.toAccountId || "");
      startTouched.current = true;
      setStartMonth(
        subscription.startMonth ? String(Number(subscription.startMonth.slice(5, 7))) : ""
      );
      setStartYear(subscription.startMonth ? subscription.startMonth.slice(0, 4) : "");
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
      startTouched.current = false;
      setStartMonth("");
      setStartYear("");
      setEndMonth("");
      setEndYear("");
    }
  }, [subscription, visible, accounts]);

  // Suggest the first debit month for a new monthly item, and keep the
  // suggestion in step with the billing day until the user overrides it.
  const monthlyCadence = type === "emi" || frequency === "monthly";
  useEffect(() => {
    if (subscription?.id || startTouched.current || !monthlyCadence) return;
    const day = parseInt(dayOfMonth, 10);
    const suggestion = defaultFirstDebit(Number.isFinite(day) ? day : 1);
    setStartMonth(String(suggestion.month));
    setStartYear(String(suggestion.year));
  }, [dayOfMonth, monthlyCadence, subscription?.id, visible]);

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

    const numStartMonth = parseInt(startMonth, 10);
    const numStartYear = parseInt(startYear, 10);
    const hasStart =
      effectiveFrequency === "monthly" && !!startMonth.trim() && !!startYear.trim();
    if (hasStart) {
      if (
        isNaN(numStartMonth) ||
        numStartMonth < 1 ||
        numStartMonth > 12 ||
        isNaN(numStartYear) ||
        numStartYear < 2000 ||
        numStartYear > 2100
      ) {
        Alert.alert("Error", "First debit month must be 1-12 with a valid year.");
        return;
      }
    } else if (
      effectiveFrequency === "monthly" &&
      (startMonth.trim() || startYear.trim())
    ) {
      Alert.alert("Error", "Enter both the first debit month and year.");
      return;
    }

    const startKey = hasStart
      ? `${numStartYear}-${String(numStartMonth).padStart(2, "0")}`
      : undefined;

    const numEndMonth = parseInt(endMonth, 10);
    const numEndYear = parseInt(endYear, 10);
    if (type === "emi" && endMonth && endYear && startKey) {
      const endKey = `${numEndYear}-${String(numEndMonth).padStart(2, "0")}`;
      if (endKey < startKey) {
        Alert.alert("Error", "The final term cannot be before the first debit.");
        return;
      }
    }

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
        startMonth: startKey,
        endMonth: type === "emi" && endMonth ? numEndMonth : undefined,
        endYear: type === "emi" && endYear ? numEndYear : undefined,
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

      haptic.success().catch(
        () => undefined
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Plain-language echo of when the first payment will actually be posted. */
  const firstDebitHint = (() => {
    const month = parseInt(startMonth, 10);
    const year = parseInt(startYear, 10);
    const day = parseInt(dayOfMonth, 10);
    if (
      isNaN(month) ||
      month < 1 ||
      month > 12 ||
      isNaN(year) ||
      String(year).length !== 4
    ) {
      return "Leave blank to start from the current month.";
    }
    const daysInMonth = new Date(year, month, 0).getDate();
    const effectiveDay = Math.min(
      Math.max(1, Number.isFinite(day) ? day : 1),
      daysInMonth
    );
    const key = `${year}-${String(month).padStart(2, "0")}-${String(
      effectiveDay
    ).padStart(2, "0")}`;
    const verb = type === "transfer" ? "transfer" : "debit";
    return `First ${verb} on ${key}, then every month on day ${effectiveDay}.`;
  })();

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
                        haptic.selection().catch(() => undefined);
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
                AMOUNT ({displayCurrency})
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
                          haptic.selection().catch(() => undefined);
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

            {/* First debit month — monthly cadence only */}
            {monthlyCadence && (
              <View style={{ gap: 6 }}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  {type === "transfer"
                    ? "FIRST TRANSFER FROM (MONTH & YEAR)"
                    : "FIRST DEBIT FROM (MONTH & YEAR)"}
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput
                    value={startMonth}
                    onChangeText={(value) => {
                      startTouched.current = true;
                      setStartMonth(value);
                    }}
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
                    value={startYear}
                    onChangeText={(value) => {
                      startTouched.current = true;
                      setStartYear(value);
                    }}
                    placeholder="Year (e.g. 2026)"
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
                <Text
                  style={[styles.helperText, { color: theme.colors.mutedForeground }]}
                >
                  {firstDebitHint}
                </Text>
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
                {type === "transfer"
                  ? "SOURCE ACCOUNT"
                  : type === "emi"
                    ? "AUTO-DEBIT ACCOUNT"
                    : "LINKED ACCOUNT"}
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
  helperText: {
    fontSize: 11,
    lineHeight: 15,
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

import { appDialog } from "@/lib/appDialog";
import { toast } from "@/lib/toast";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { DayOfMonthSelect } from "@/components/common/DayOfMonthSelect";
import { MonthYearSelect } from "@/components/common/MonthYearSelect";
import { Input } from "@/components/ui/Input";
import { Chip } from "@/components/ui/Chip";
import {
  validateSubscriptionInput,
  type SubscriptionField,
} from "@/shared/utils/subscriptionInput";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import type { Subscription, SubscriptionFrequency } from "@/shared/types/subscription";
import { subscriptionFrequency } from "@/shared/types/subscription";
import { todayDateKey } from "@/shared/utils/dates";
import { acceptRecurringSuggestion } from "@/services/sms/smsRecurringSync";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
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

type WizardStep = 1 | 2 | 3;

const STEP_TITLES: Record<WizardStep, string> = {
  1: "Basics",
  2: "Schedule",
  3: "Classification",
};

/**
 * Which step owns each validation failure, so a save blocked on step 1 sends
 * the user back to step 1 rather than just showing a toast they cannot act on.
 */
const FIELD_STEP: Record<SubscriptionField, WizardStep> = {
  name: 1,
  amount: 1,
  dayOfMonth: 2,
  intervalDays: 2,
  start: 2,
  end: 2,
  accounts: 3,
};

export function EditSubscriptionModal({
  visible,
  subscription,
  suggestionKey,
  onClose,
}: EditSubscriptionModalProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
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
  // Latest accounts without making them a reset trigger — see the reset effect.
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const [endMonth, setEndMonth] = useState("");
  const [endYear, setEndYear] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);

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
      const available = accountsRef.current;
      setAccountId(available.length > 0 ? available[0].id : "");
      setToAccountId(available.length > 1 ? available[1].id : "");
      startTouched.current = false;
      setStartMonth("");
      setStartYear("");
      setEndMonth("");
      setEndYear("");
    }
    // `accounts` is read through a ref on purpose. It only seeds defaults, but
    // as a dependency it re-ran this whole reset every time the Firestore
    // snapshot re-emitted a new array, wiping whatever the user had typed.
    setStep(1);
  }, [subscription, visible]);

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

  const currentValues = {
    name,
    amount,
    type,
    frequency,
    dayOfMonth,
    intervalDays,
    startMonth,
    startYear,
    endMonth,
    endYear,
    accountId,
    toAccountId,
  };

  const handleNext = () => {
    // One validator for the whole form; only complain about problems the user
    // has actually reached, so a blank amount does not block leaving step 1
    // before they have seen the field.
    const checked = validateSubscriptionInput(currentValues);
    if (!checked.ok && FIELD_STEP[checked.field] <= step) {
      toast.error(checked.message);
      return;
    }
    haptic.selection().catch(() => undefined);
    setStep((prev) => Math.min(3, prev + 1) as WizardStep);
  };

  const handleBack = () => {
    haptic.selection().catch(() => undefined);
    setStep((prev) => Math.max(1, prev - 1) as WizardStep);
  };

  const handleSave = async () => {
    const checked = validateSubscriptionInput(currentValues);

    if (!checked.ok) {
      toast.error(checked.message);
      setStep(FIELD_STEP[checked.field]);
      return;
    }

    // Names kept so the payload below stays exactly as it was — that object
    // drives auto-posting and Firestore field deletion, and is the one part of
    // this form worth not touching.
    const numAmount = checked.amount;
    const effectiveFrequency = checked.effectiveFrequency;
    const numDay = checked.dayOfMonth;
    const numInterval = checked.intervalDays;
    const startKey = checked.startKey;
    const numEndMonth = parseInt(endMonth, 10);
    const numEndYear = parseInt(endYear, 10);

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
    appDialog.alert(
      `Delete "${subscription.name}"?`,
      // Say what actually happens. Deleting writes one doc delete and nothing
      // else: already-posted charges keep their `subscriptionId` and stay in
      // the ledger. Deleting also calls `rememberDeletedSubscription`, which
      // dismisses the merchant so SMS detection stops re-suggesting it —
      // surprising enough to be worth stating.
      "Future charges stop. Transactions it has already added to your ledger stay where they are.\n\nThis also stops SMS detection suggesting this merchant again.",
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
                Step {step} of 3 · {STEP_TITLES[step]}
              </Text>
            </View>
            <Button
              variant="ghost"
              size="icon"
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
              style={styles.closeButton}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Button>
          </View>

          <View style={styles.stepRow}>
            {([1, 2, 3] as WizardStep[]).map((s) => (
              <View
                key={s}
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      s <= step ? theme.colors.primary : theme.colors.muted,
                    height: s === step ? 4 : 3,
                  },
                ]}
              />
            ))}
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {step === 1 ? (
              <>
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
                    backgroundColor: surfaces.control,
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
              <Input
                value={name}
                onChangeText={setName}
                placeholder="e.g. Netflix 4K, Car EMI, SIP Savings"
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
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>

              </>
            ) : null}

            {step === 2 ? (
              <>
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
                      backgroundColor: surfaces.control,
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
                <Input
                  value={intervalDays}
                  onChangeText={setIntervalDays}
                  placeholder="2"
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
            ) : (
              <DayOfMonthSelect
                label="Billing day of month"
                value={parseInt(dayOfMonth, 10)}
                onChange={(day) => setDayOfMonth(String(day))}
              />
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
                    ? "FIRST TRANSFER FROM"
                    : "FIRST DEBIT FROM"}
                </Text>
                <MonthYearSelect
                  month={parseInt(startMonth, 10) || 0}
                  year={parseInt(startYear, 10) || 0}
                  clearable
                  placeholder="Start from this month"
                  onChange={({ month, year }) => {
                    startTouched.current = true;
                    setStartMonth(month ? String(month) : "");
                    setStartYear(year ? String(year) : "");
                  }}
                />
                <Text
                  style={[styles.helperText, { color: theme.colors.mutedForeground }]}
                >
                  {firstDebitHint}
                </Text>
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
                  FINAL TERM
                </Text>
                <MonthYearSelect
                  month={parseInt(endMonth, 10) || 0}
                  year={parseInt(endYear, 10) || 0}
                  clearable
                  placeholder="No end date"
                  onChange={({ month, year }) => {
                    setEndMonth(month ? String(month) : "");
                    setEndYear(year ? String(year) : "");
                  }}
                />
              </View>
            )}
              </>
            ) : null}

            {step === 3 ? (
              <>
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
                      <Chip
                        key={c.id}
                        label={c.name}
                        selected={isSelected}
                        onPress={() => setCategory(c.name)}
                      />
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
                    <Chip
                      key={acc.id}
                      label={acc.name}
                      selected={isSelected}
                      onPress={() => setAccountId(acc.id)}
                    />
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
                      <Chip
                        key={acc.id}
                        label={acc.name}
                        selected={isSelected}
                        onPress={() => setToAccountId(acc.id)}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            )}

              </>
            ) : null}

          </ScrollView>

          {/* Action Buttons. Delete is deliberately not in this row: it used
              to sit beside the primary action at a third of its width, which
              is a lot of destructive surface next to the button people mean
              to press. */}
          <View style={styles.actionFooter}>
            {step > 1 ? (
              <Button variant="outline" onPress={handleBack} style={{ flex: 1 }}>
                Back
              </Button>
            ) : null}
            {step < 3 ? (
              <Button
                variant="primary"
                onPress={handleNext}
                style={{ flex: step > 1 ? 2 : 1 }}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="primary"
                onPress={handleSave}
                disabled={isSubmitting}
                style={{ flex: 2 }}
              >
                {isSubmitting
                  ? "Saving..."
                  : subscription?.id
                    ? "Update Recurring"
                    : suggestionKey
                      ? "Add Recurring"
                      : "Save Recurring"}
              </Button>
            )}
          </View>

          {subscription?.id ? (
            <Pressable
              onPress={handleDelete}
              style={({ pressed }) => [
                styles.deleteRow,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${subscription.name}`}
            >
              <Text style={[styles.deleteLabel, { color: theme.colors.destructive }]}>
                Delete recurring
              </Text>
            </Pressable>
          ) : null}
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
  stepRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 14,
  },
  stepDot: {
    flex: 1,
    borderRadius: 4,
  },
  actionFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  deleteRow: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 4,
  },
  deleteLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
});

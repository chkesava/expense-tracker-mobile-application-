import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CreditCard,
  FolderTree,
  Plus,
  Receipt,
  Sparkles,
  Tag,
  Wallet,
  X,
} from "lucide-react-native";

import { MagicChatModal } from "@/components/ai/MagicChatModal";
import { ReceiptScannerModal } from "@/components/ai/ReceiptScannerModal";
import type { ParsedTransaction } from "@/shared/utils/magicParser";
import type { ExtractedReceiptData } from "@/services/ocrService";
import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { space } from "@/theme/tokens";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useReceivables } from "@/hooks/useReceivables";
import { useSpaces } from "@/hooks/useSpaces";
import { getFirestoreDb } from "@/lib/firebase";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { createExpense, createIncome } from "@/services/ledger/createLedgerTransaction";
import {
  updateExpense,
  updateIncome,
} from "@/services/ledger/mutateLedgerTransaction";
import { useAuth } from "@/providers/AuthProvider";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  DEFAULT_EXPENSE_CATEGORY,
  DEFAULT_EXPENSE_SUBCATEGORY,
  suggestCategoryFromNote,
} from "@/shared/data/categoryTaxonomy";
import {
  INCOME_SOURCES,
  type Expense,
  type Income,
} from "@/shared/types/expense";
import {
  getAccountKind,
} from "@/shared/utils/accountKind";
import {
  previewBalanceAfterTransaction,
} from "@/shared/utils/accountBalance";
import { pushRecentCategoryPair } from "@/shared/utils/categoryPreferences";
import {
  currentMonthKey,
  monthFromDateKey,
  nowTimeHm,
  todayDateKey,
} from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface ExpenseFormProps {
  editingExpense?: Expense | null;
  editingIncome?: Income | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  /**
   * When true, render without an outer ScrollView so a parent sheet/page
   * owns scrolling. Prevents nested ScrollViews from clipping the save button.
   */
  embedded?: boolean;
  /**
   * Which tab a fresh form starts on. Ignored when editing, since the record
   * being edited already determines its own type.
   */
  initialType?: "expense" | "income";
  /** Edit mode only: fires when the form diverges from (or returns to) the saved row. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function ExpenseForm({
  editingExpense,
  editingIncome,
  onSuccess,
  onCancel,
  embedded = false,
  initialType = "expense",
  onDirtyChange,
}: ExpenseFormProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { user } = useAuth();
  const uid = user?.uid;
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();
  const { isReceiptScannerOpen, setIsReceiptScannerOpen } = useModals();
  const displayCurrency = useDisplayCurrency();
  const { celebrateMilestone } = useCelebration();

  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { spaces } = useSpaces();
  const { rules } = useCategorizationRules();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { payments } = useAccountPayments();
  const { entries } = useAccountEntries();
  const { transfers } = useAccountTransfers();
  const { borrowings, repayments: borrowingRepayments } = useBorrowings();
  const { receivables, repayments: receivableRepayments } = useReceivables();
  const { bills } = useCreditCardBills();

  const [type, setType] = useState<"expense" | "income">(
    editingIncome ? "income" : initialType
  );
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState<string>(
    settings.defaultCategory || DEFAULT_EXPENSE_CATEGORY
  );
  const [subcategory, setSubcategory] = useState<string>(DEFAULT_EXPENSE_SUBCATEGORY);
  const [source, setSource] = useState<string>("Salary");
  const [accountId, setAccountId] = useState<string>("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [spaceId, setSpaceId] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [suggestionHint, setSuggestionHint] = useState<string | null>(null);
  const [showCategoryPickerModal, setShowCategoryPickerModal] = useState(false);
  const [isMagicModalOpen, setIsMagicModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  useEffect(() => {
    if (isReceiptScannerOpen) {
      setIsReceiptModalOpen(true);
    }
  }, [isReceiptScannerOpen]);

  const closeReceiptScanner = () => {
    setIsReceiptModalOpen(false);
    setIsReceiptScannerOpen(false);
  };

  const handleApplyMagicParsed = (parsed: ParsedTransaction) => {
    setType(parsed.type);
    if (parsed.amount) setAmount(String(parsed.amount));
    if (parsed.date) setDate(parsed.date);
    if (parsed.category) setCategory(parsed.category);
    if (parsed.subcategory) setSubcategory(parsed.subcategory);
    if (parsed.accountId) setAccountId(parsed.accountId);
    if (parsed.note) setNote(parsed.note);
    setCategoryTouched(true);
  };

  const handleApplyReceiptParsed = (data: ExtractedReceiptData) => {
    setType("expense");
    if (data.total) setAmount(String(data.total));
    if (data.date) setDate(data.date);
    if (data.merchant) setNote(data.merchant);
    if (data.suggestedCategory) setCategory(data.suggestedCategory);
    if (data.suggestedSubcategory) setSubcategory(data.suggestedSubcategory);
    setCategoryTouched(true);
  };

  // Initialize or reset form values
  useEffect(() => {
    if (editingExpense) {
      setType("expense");
      setAmount(String(editingExpense.amount || ""));
      setDate(editingExpense.date || todayDateKey(settings.timezone));
      setCategory(editingExpense.category || DEFAULT_EXPENSE_CATEGORY);
      setSubcategory(editingExpense.subcategory || "Other");
      setAccountId(editingExpense.accountId || "");
      setNote(editingExpense.note || "");
      setTags(editingExpense.tags || []);
      setSpaceId(editingExpense.spaceId || "");
      setCategoryTouched(true);
    } else if (editingIncome) {
      setType("income");
      setAmount(String(editingIncome.amount || ""));
      setDate(editingIncome.date || todayDateKey(settings.timezone));
      setSource(editingIncome.source || "Salary");
      setAccountId(editingIncome.accountId || "");
      setNote(editingIncome.note || "");
      setTags([]);
      setSpaceId("");
      setCategoryTouched(true);
    } else {
      setType(initialType);
      setAmount("");
      setDate(todayDateKey(settings.timezone));
      setCategory(settings.defaultCategory || DEFAULT_EXPENSE_CATEGORY);
      setSubcategory(DEFAULT_EXPENSE_SUBCATEGORY);
      setSource("Salary");
      setAccountId(accounts.length > 0 ? accounts[0].id : "");
      setNote("");
      setTags([]);
      setSpaceId("");
      setCategoryTouched(false);
    }
  }, [
    editingExpense,
    editingIncome,
    initialType,
    settings.defaultCategory,
    settings.timezone,
    accounts,
  ]);

  // Must mirror the hydration above so an untouched edit never reads as dirty.
  const editBaseline = useMemo(() => {
    if (editingExpense) {
      return JSON.stringify([
        "expense",
        String(editingExpense.amount || ""),
        editingExpense.date || todayDateKey(settings.timezone),
        editingExpense.category || DEFAULT_EXPENSE_CATEGORY,
        editingExpense.subcategory || "Other",
        editingExpense.accountId || "",
        editingExpense.note || "",
        editingExpense.tags || [],
        editingExpense.spaceId || "",
      ]);
    }
    if (editingIncome) {
      return JSON.stringify([
        "income",
        String(editingIncome.amount || ""),
        editingIncome.date || todayDateKey(settings.timezone),
        editingIncome.source || "Salary",
        editingIncome.accountId || "",
        editingIncome.note || "",
      ]);
    }
    return null;
  }, [editingExpense, editingIncome, settings.timezone]);

  const editCurrent =
    type === "income"
      ? JSON.stringify(["income", amount, date, source, accountId, note])
      : JSON.stringify([
          "expense",
          amount,
          date,
          category,
          subcategory,
          accountId,
          note,
          tags,
          spaceId,
        ]);
  const isEditDirty = editBaseline !== null && editCurrent !== editBaseline;

  useEffect(() => {
    onDirtyChange?.(isEditDirty);
  }, [isEditDirty, onDirtyChange]);

  // An archived space stays on its existing expenses but is no longer offered.
  const selectableSpaces = useMemo(
    () =>
      spaces.filter(
        (space) => space.status !== "ARCHIVED" || space.id === spaceId
      ),
    [spaces, spaceId]
  );

  // Account helper lookups
  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );

  const selectedTypeName = useMemo(
    () => (selectedAccount ? typeMap.get(selectedAccount.typeId) || "" : ""),
    [selectedAccount, typeMap]
  );

  // Auto-categorization rule match on note change
  useEffect(() => {
    if (editingExpense || categoryTouched || type === "income") return;

    const normalizedNote = note.trim().toLowerCase();
    if (!normalizedNote) {
      setSuggestionHint(null);
      return;
    }

    const ruleMatch = rules.find((rule) =>
      normalizedNote.includes(rule.keyword.toLowerCase())
    );
    if (ruleMatch) {
      setCategory(ruleMatch.category);
      if (ruleMatch.subcategory) setSubcategory(ruleMatch.subcategory);
      setSuggestionHint(
        `${ruleMatch.category} › ${ruleMatch.subcategory || "…"}`
      );
      return;
    }

    const suggestion = suggestCategoryFromNote(note);
    if (suggestion) {
      setCategory(suggestion.category);
      setSubcategory(suggestion.subcategory);
      setSuggestionHint(`${suggestion.category} › ${suggestion.subcategory}`);
    } else {
      setSuggestionHint(null);
    }
  }, [note, rules, editingExpense, categoryTouched, type]);

  // Balance preview calculation
  const balancePreview = useMemo(() => {
    if (!selectedAccount || !amount) return null;
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) return null;
    const excludeId = editingExpense?.id || editingIncome?.id;

    return previewBalanceAfterTransaction(
      selectedAccount,
      selectedTypeName,
      expenses,
      incomes,
      type,
      num,
      payments,
      entries,
      transfers,
      excludeId,
      borrowings,
      borrowingRepayments,
      receivables,
      receivableRepayments,
      bills,
      todayDateKey(settings.timezone)
    );
  }, [
    selectedAccount,
    selectedTypeName,
    amount,
    type,
    expenses,
    incomes,
    payments,
    entries,
    transfers,
    borrowings,
    borrowingRepayments,
    receivables,
    receivableRepayments,
    bills,
    settings.timezone,
    editingExpense?.id,
    editingIncome?.id,
  ]);

  const handleAddQuickAmount = (val: number) => {
      void haptic.selection();
    const curr = Number(amount) || 0;
    setAmount(String(curr + val));
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().replace(/^#/, "");
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSelectCategoryPair = (
    cat: string,
    sub?: string,
    options?: { fromUser?: boolean }
  ) => {
    setCategory(cat);
    if (sub) setSubcategory(sub);
    if (options?.fromUser) {
      setCategoryTouched(true);
      setSuggestionHint(null);
    }
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;

    const db = getFirestoreDb();
    if (!uid || !db) {
      toast.error("Not authenticated");
      return;
    }

    const numAmount = roundMoney(Number(amount));
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (!date) {
      toast.error("Please choose a date");
      return;
    }

    const txMonth = monthFromDateKey(date);
    const activeCurrentMonth = currentMonthKey(settings.timezone);

    if (settings.lockPastMonths && txMonth < activeCurrentMonth) {
      toast.error("Past months are locked in settings");
      return;
    }

    // Editing without a Firestore doc id would otherwise silently insert a duplicate.
    if (type === "expense" && editingExpense && !editingExpense.id?.trim()) {
      toast.error("Cannot update expense — missing id");
      return;
    }
    if (type === "income" && editingIncome && !editingIncome.id?.trim()) {
      toast.error("Cannot update income — missing id");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (type === "expense") {
        const payload = {
          amount: numAmount,
          category: category.trim(),
          subcategory: subcategory.trim() || "Other",
          date: date.trim(),
          month: txMonth,
          accountId: accountId || null,
          note: note.trim(),
          tags: tags.length > 0 ? tags : [],
          ...(spaceId ? { spaceId } : {}),
          ...(!editingExpense ? { time: nowTimeHm(settings.timezone) } : {}),
        };

        if (editingExpense) {
          const outcome = (
            await updateExpense(uid, editingExpense.id!.trim(), payload, {
              lockPastMonths: settings.lockPastMonths,
              timezone: settings.timezone,
            })
          ).outcome;
          toast.success(writeSavedMessage(outcome, "Expense updated"));
        } else {
          const { outcome } = await createExpense(uid, payload);
          toast.success(writeSavedMessage(outcome, "Expense logged"));

          // Celebrate first expense milestone with subtle confetti & animation
          celebrateMilestone("milestone_first_expense", {
            title: "First Expense Logged!",
            subtitle: "You've taken the first step towards mindful spending!",
            badgeEmoji: "🎉",
            pointsEarned: 25,
          });
        }

        // Store recent category preference
        pushRecentCategoryPair(category, subcategory);
      } else {
        const payload = {
          amount: numAmount,
          source: source.trim() || "Salary",
          date: date.trim(),
          month: txMonth,
          accountId: accountId || null,
          note: note.trim(),
          ...(!editingIncome ? { time: nowTimeHm(settings.timezone) } : {}),
        };

        if (editingIncome) {
          const outcome = (
            await updateIncome(uid, editingIncome.id!.trim(), payload, {
              lockPastMonths: settings.lockPastMonths,
              timezone: settings.timezone,
            })
          ).outcome;
          toast.success(writeSavedMessage(outcome, "Income updated"));
        } else {
          const { outcome } = await createIncome(uid, payload);
          toast.success(writeSavedMessage(outcome, "Income logged"));
        }
      }

      onSuccess?.();
    } catch (err) {
      logError("expenseForm.expenseformSubmission", err);
      toast.error(friendlyErrorMessage(err, "Failed to save transaction"));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const formBody = (
    <>
      {/* Type Switcher */}
      {!editingExpense && !editingIncome ? (
        <SegmentedControl
          value={type}
          onChange={setType}
          options={[
            {
              value: "expense",
              label: "Expense",
              activeColor: theme.colors.destructive,
              icon: (color) => <ArrowUpRight size={18} color={color} />,
            },
            {
              value: "income",
              label: "Income",
              activeColor: theme.colors.success,
              icon: (color) => <ArrowDownLeft size={18} color={color} />,
            },
          ]}
        />
      ) : null}

      {/* AI Quick Actions Toolbar */}
      {system.enableAIFeatures && !editingExpense && !editingIncome ? (
        <View style={styles.aiQuickStrip}>
          <Button
            variant="tonal"
            size="sm"
            haptic={false}
            onPress={() => {
              void haptic.selection();
              setIsMagicModalOpen(true);
            }}
            style={styles.aiQuickButton}
          >
            <Sparkles size={15} color={theme.colors.onSecondaryContainer} />
            <Text
              style={[
                styles.aiQuickButtonText,
                { color: theme.colors.onSecondaryContainer },
              ]}
            >
              Magic NLP Input
            </Text>
          </Button>

          <Button
            variant="outline"
            size="sm"
            haptic={false}
            onPress={() => {
              void haptic.selection();
              setIsReceiptModalOpen(true);
            }}
            style={styles.aiQuickButton}
          >
            <Receipt size={15} color={theme.colors.foreground} />
            <Text
              style={[
                styles.aiQuickButtonText,
                { color: theme.colors.foreground },
              ]}
            >
              Scan Receipt OCR
            </Text>
          </Button>
        </View>
      ) : null}

      {/* Amount Input Card */}
      <Card density="compact">
        <View style={{ gap: FORM_SPACING.labelGap }}>
          <Text
            style={{
              fontSize: theme.typography.xs,
              fontWeight: "600",
              color: theme.colors.mutedForeground,
            }}
          >
            AMOUNT ({displayCurrency})
          </Text>
          <View style={styles.amountInputRow}>
            <Text
              style={{
                fontSize: 28,
                fontWeight: "800",
                color:
                  type === "income"
                    ? theme.colors.success
                    : theme.colors.primary,
              }}
            >
              {displayCurrency}
            </Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.colors.mutedForeground}
              style={[
                styles.amountInput,
                {
                  color: theme.colors.foreground,
                  fontSize: 32,
                  fontWeight: "800",
                },
              ]}
              autoFocus={!editingExpense && !editingIncome}
            />
          </View>

          {/* Quick Amount Increment Pills */}
          {/* Scrolls rather than clipping "+2000" on narrow phones. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickPillsRow}
          >
            {[100, 500, 1000, 2000].map((pill) => (
              <Chip
                key={pill}
                size="sm"
                label={`+${pill}`}
                haptic={false}
                onPress={() => handleAddQuickAmount(pill)}
                accessibilityLabel={`Add ${pill}`}
              />
            ))}
          </ScrollView>
        </View>
      </Card>

      {/* Category / Source Picker */}
      {type === "expense" ? (
        <Card density="compact">
          <View style={{ gap: FORM_SPACING.labelGap }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  fontWeight: "600",
                  color: theme.colors.mutedForeground,
                }}
              >
                CATEGORY & SUBCATEGORY
              </Text>
              {suggestionHint ? (
                <View style={styles.suggestionBadge}>
                  <Sparkles size={12} color={theme.colors.primary} />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: theme.colors.primary,
                    }}
                  >
                    Auto-suggested
                  </Text>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() => setShowCategoryPickerModal(true)}
              style={[
                styles.selectorButton,
                {
                  backgroundColor: surfaces.tile,
                  borderColor: theme.colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Category ${category}${subcategory ? `, ${subcategory}` : ""}. Change`}
            >
              <View style={styles.selectorLeft}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: surfaces.wash(theme.colors.primary) },
                  ]}
                >
                  <FolderTree size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: theme.typography.md,
                      fontWeight: "700",
                      color: theme.colors.foreground,
                    }}
                  >
                    {category}
                  </Text>
                  <Text
                    style={{
                      fontSize: theme.typography.xs,
                      color: theme.colors.mutedForeground,
                    }}
                  >
                    {subcategory || "Select subcategory"}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  fontWeight: "700",
                  color: theme.colors.primary,
                }}
              >
                Change ›
              </Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <Card density="compact">
          <View style={{ gap: FORM_SPACING.labelGap }}>
            <Text
              style={{
                fontSize: theme.typography.xs,
                fontWeight: "600",
                color: theme.colors.mutedForeground,
              }}
            >
              INCOME SOURCE
            </Text>
            <View style={styles.sourcesRow}>
              {INCOME_SOURCES.map((src) => (
                <Chip
                  key={src}
                  label={src}
                  tone="success"
                  selected={source === src}
                  onPress={() => setSource(src)}
                />
              ))}
            </View>
          </View>
        </Card>
      )}

      {/* Account Selection with Balance Preview */}
      <Card density="compact">
        <View style={{ gap: FORM_SPACING.labelGap }}>
          <Text
            style={{
              fontSize: theme.typography.xs,
              fontWeight: "600",
              color: theme.colors.mutedForeground,
            }}
          >
            ACCOUNT
          </Text>

          {accounts.length === 0 ? (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.sm,
              }}
            >
              No accounts added yet. (Will log to default ledger).
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {accounts.map((acc) => {
                const kind = getAccountKind(typeMap.get(acc.typeId) || "");
                const KindIcon = kind === "credit" ? CreditCard : Wallet;
                const active = accountId === acc.id;
                return (
                  <Chip
                    key={acc.id}
                    label={acc.name}
                    appearance="outline"
                    selected={active}
                    onPress={() => setAccountId(acc.id)}
                    style={styles.accountChip}
                    icon={(color) => (
                      <KindIcon
                        size={16}
                        color={active ? color : theme.colors.mutedForeground}
                      />
                    )}
                  />
                );
              })}
            </ScrollView>
          )}

          {balancePreview != null && selectedAccount ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
                flexWrap: "wrap",
              }}
            >
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  fontWeight: "700",
                  color:
                    balancePreview < 0
                      ? theme.colors.destructive
                      : theme.colors.mutedForeground,
                }}
              >
                {getAccountKind(selectedTypeName) === "credit"
                  ? "Available credit after"
                  : "Balance after"}
              </Text>
              <Amount
                value={balancePreview}
                currency={displayCurrency}
                ghostable
                style={{
                  fontSize: theme.typography.xs,
                  fontWeight: "700",
                  color:
                    balancePreview < 0
                      ? theme.colors.destructive
                      : theme.colors.mutedForeground,
                }}
              />
            </View>
          ) : null}
        </View>
      </Card>

      {/* Note & Date Details */}
      <Card density="compact">
        <View style={{ gap: FORM_SPACING.fieldGap }}>
          <Input
            label="NOTE / DESCRIPTION"
            value={note}
            onChangeText={setNote}
            placeholder={
              type === "expense" ? "e.g. Dinner with team" : "e.g. Monthly salary"
            }
          />

          <Input
            label="DATE (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="2026-08-05"
          />

          {/* Tags */}
          {type === "expense" ? (
            <View style={{ gap: FORM_SPACING.labelGap }}>
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  fontWeight: "600",
                  color: theme.colors.mutedForeground,
                }}
              >
                TAGS
              </Text>
              <View style={styles.tagsContainer}>
                {tags.map((t) => (
                  <View
                    key={t}
                    style={[
                      styles.tagBadge,
                      {
                        backgroundColor: theme.colors.muted,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Tag size={12} color={theme.colors.mutedForeground} />
                    <Text
                      style={{
                        fontSize: theme.typography.xs,
                        fontWeight: "600",
                        color: theme.colors.foreground,
                      }}
                    >
                      {t}
                    </Text>
                    <Pressable
                      onPress={() => handleRemoveTag(t)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove tag ${t}`}
                    >
                      <X size={12} color={theme.colors.mutedForeground} />
                    </Pressable>
                  </View>
                ))}
              </View>

              <View style={styles.tagInputRow}>
                <Input
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={handleAddTag}
                  returnKeyType="done"
                  placeholder="Add tag..."
                  containerStyle={styles.tagInput}
                />
                <Button variant="outline" size="sm" onPress={handleAddTag}>
                  Add
                </Button>
              </View>
            </View>
          ) : null}

          {/* Spending Space (optional grouping label) */}
          {type === "expense" && selectableSpaces.length > 0 ? (
            <View style={{ gap: FORM_SPACING.labelGap }}>
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  fontWeight: "600",
                  color: theme.colors.mutedForeground,
                }}
              >
                SPACE (OPTIONAL)
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.spacePillRow}
              >
                {[{ id: "", name: "None" }, ...selectableSpaces].map((option) => {
                  const optionId = option.id ?? "";
                  return (
                    <Chip
                      key={optionId || "none"}
                      label={option.name}
                      selected={spaceId === optionId}
                      onPress={() => setSpaceId(optionId)}
                    />
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Action Buttons */}
      <View style={{ gap: FORM_SPACING.controlGap, marginTop: FORM_SPACING.footerOffset, marginBottom: space.sm }}>
        <Button loading={isSubmitting} onPress={handleSubmit}>
          {editingExpense || editingIncome
            ? "Update Transaction"
            : type === "expense"
              ? "Save Expense"
              : "Save Income"}
        </Button>

        {onCancel ? (
          <Button variant="outline" onPress={onCancel}>
            Cancel
          </Button>
        ) : null}
      </View>

      {/* Category Picker Modal — stays open until subcategory is chosen */}
      <Modal
        visible={showCategoryPickerModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCategoryPickerModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: theme.colors.foreground,
                }}
              >
                Select Category
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  marginTop: 2,
                  color: theme.colors.mutedForeground,
                }}
              >
                Pick a category, then a subcategory
              </Text>
            </View>
            <Button
              variant="tonal"
              size="icon"
              onPress={() => setShowCategoryPickerModal(false)}
              accessibilityLabel="Close category picker"
            >
              <X size={18} color={theme.colors.onSecondaryContainer} />
            </Button>
          </View>
          <CategoryPicker
            inline
            category={category}
            subcategory={subcategory}
            onCategoryChange={handleSelectCategoryPair}
            onComplete={() => setShowCategoryPickerModal(false)}
          />
        </View>
      </Modal>

      {/* AI Modals */}
      <MagicChatModal
        visible={isMagicModalOpen}
        onClose={() => setIsMagicModalOpen(false)}
        onApplyParsed={handleApplyMagicParsed}
      />

      <ReceiptScannerModal
        visible={isReceiptModalOpen}
        onClose={closeReceiptScanner}
        onApplyReceipt={handleApplyReceiptParsed}
      />
    </>
  );

  // Parent Modal owns scrolling when embedded — nested ScrollViews hide the
  // save button because the outer sheet never gets a bounded scroll range.
  if (embedded) {
    return <View style={styles.embeddedBody}>{formBody}</View>;
  }

  return (
    <ScrollView
      style={styles.pageScroll}
      contentContainerStyle={styles.pageScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {formBody}
    </ScrollView>
  );
}

/**
 * SPENDLY-173: the Add Transaction form's one spacing contract, built from
 * the Spendly space tokens. Section cards use `Card density="compact"`.
 */
const FORM_SPACING = {
  /** Between section cards. */
  sectionGap: space.md,
  /** A section label to its control. */
  labelGap: space.xs + 2,
  /** Between controls inside a section (chips, pills). */
  controlGap: space.sm,
  /** Between stacked inputs (note, date, tags). */
  fieldGap: space.md,
  /** Extra room above the Save/Cancel actions, on top of `sectionGap`. */
  footerOffset: space.xs,
} as const;

const styles = StyleSheet.create({
  embeddedBody: {
    gap: FORM_SPACING.sectionGap,
    paddingBottom: 8,
  },
  pageScroll: {
    flex: 1,
  },
  pageScrollContent: {
    gap: FORM_SPACING.sectionGap,
    paddingTop: 8,
    paddingBottom: 48,
  },
  aiQuickStrip: {
    flexDirection: "row",
    gap: 8,
  },
  aiQuickButton: {
    flex: 1,
    gap: 6,
  },
  aiQuickButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 0,
  },
  quickPillsRow: {
    flexDirection: "row",
    gap: FORM_SPACING.controlGap,
  },
  suggestionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  selectorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  selectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sourcesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  tagInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tagInput: {
    flex: 1,
  },
  accountChip: {
    minHeight: 40,
    borderRadius: 14,
  },
  spacePillRow: {
    flexDirection: "row",
    gap: 8,
  },
});

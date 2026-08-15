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
import {
  doc,
  updateDoc,
} from "firebase/firestore";
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
import { Input } from "@/components/ui/Input";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSpaces } from "@/hooks/useSpaces";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { createExpense, createIncome } from "@/services/ledger/createLedgerTransaction";
import { useAuth } from "@/providers/AuthProvider";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { suggestCategoryFromNote } from "@/shared/data/categoryTaxonomy";
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
  todayDateKey,
} from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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
}

export function ExpenseForm({
  editingExpense,
  editingIncome,
  onSuccess,
  onCancel,
  embedded = false,
}: ExpenseFormProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();
  const uid = user?.uid;
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();
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

  const [type, setType] = useState<"expense" | "income">(
    editingIncome ? "income" : "expense"
  );
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState<string>(
    settings.defaultCategory || "Food & Dining"
  );
  const [subcategory, setSubcategory] = useState<string>("Groceries");
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
      setCategory(editingExpense.category || "Food & Dining");
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
      setType("expense");
      setAmount("");
      setDate(todayDateKey(settings.timezone));
      setCategory(settings.defaultCategory || "Food & Dining");
      setSubcategory("Groceries");
      setSource("Salary");
      setAccountId(accounts.length > 0 ? accounts[0].id : "");
      setNote("");
      setTags([]);
      setSpaceId("");
      setCategoryTouched(false);
    }
  }, [editingExpense, editingIncome, settings.defaultCategory, settings.timezone, accounts]);

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
      excludeId
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

    const numAmount = Number(amount);
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
        };

        if (editingExpense) {
          const outcome = await commitWrite(
            () =>
              updateDoc(
                doc(db, "users", uid, "expenses", editingExpense.id!.trim()),
                // An edit must be able to clear the space, which needs an explicit null.
                { ...payload, spaceId: spaceId || null }
              ),
            { label: "expense" }
          );
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
        };

        if (editingIncome) {
          const outcome = await commitWrite(
            () =>
              updateDoc(
                doc(db, "users", uid, "incomes", editingIncome.id!.trim()),
                payload
              ),
            { label: "income" }
          );
          toast.success(writeSavedMessage(outcome, "Income updated"));
        } else {
          const { outcome } = await createIncome(uid, payload);
          toast.success(writeSavedMessage(outcome, "Income logged"));
        }
      }

      onSuccess?.();
    } catch (err) {
      console.error("ExpenseForm submission error:", err);
      toast.error("Failed to save transaction");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const formBody = (
    <>
      {/* Type Switcher */}
      {!editingExpense && !editingIncome ? (
        <View
          style={[
            styles.typeSegment,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Pressable
            onPress={() => {
                void haptic.selection();
              setType("expense");
            }}
            style={[
              styles.typeTab,
              type === "expense" && {
                backgroundColor: theme.colors.card,
                shadowColor: "#000",
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
              },
            ]}
          >
            <ArrowUpRight
              size={18}
              color={
                type === "expense"
                  ? theme.colors.destructive
                  : theme.colors.mutedForeground
              }
            />
            <Text
              style={[
                styles.typeTabText,
                {
                  color:
                    type === "expense"
                      ? theme.colors.foreground
                      : theme.colors.mutedForeground,
                  fontWeight: type === "expense" ? "700" : "500",
                },
              ]}
            >
              Expense
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
                void haptic.selection();
              setType("income");
            }}
            style={[
              styles.typeTab,
              type === "income" && {
                backgroundColor: theme.colors.card,
                shadowColor: "#000",
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
              },
            ]}
          >
            <ArrowDownLeft
              size={18}
              color={
                type === "income"
                  ? theme.colors.success
                  : theme.colors.mutedForeground
              }
            />
            <Text
              style={[
                styles.typeTabText,
                {
                  color:
                    type === "income"
                      ? theme.colors.foreground
                      : theme.colors.mutedForeground,
                  fontWeight: type === "income" ? "700" : "500",
                },
              ]}
            >
              Income
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* AI Quick Actions Toolbar */}
      {system.enableAIFeatures && !editingExpense && !editingIncome ? (
        <View style={styles.aiQuickStrip}>
          <Pressable
            onPress={() => {
                void haptic.selection();
              setIsMagicModalOpen(true);
            }}
            style={({ pressed }) => [
              styles.aiQuickButton,
              {
                backgroundColor: isDark
                  ? "rgba(99,102,241,0.15)"
                  : "rgba(99,102,241,0.08)",
                borderColor: "rgba(99,102,241,0.3)",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Sparkles size={15} color={theme.colors.primary} />
            <Text
              style={[
                styles.aiQuickButtonText,
                { color: theme.colors.primary },
              ]}
            >
              Magic NLP Input
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
                void haptic.selection();
              setIsReceiptModalOpen(true);
            }}
            style={({ pressed }) => [
              styles.aiQuickButton,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
                borderColor: theme.colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
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
          </Pressable>
        </View>
      ) : null}

      {/* Amount Input Card */}
      <Card>
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: theme.typography.xs,
              fontWeight: "600",
              color: theme.colors.mutedForeground,
            }}
          >
            AMOUNT ({system.defaultCurrency})
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
              {system.defaultCurrency}
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
          <View style={styles.quickPillsRow}>
            {[100, 500, 1000, 2000].map((pill) => (
              <Pressable
                key={pill}
                onPress={() => handleAddQuickAmount(pill)}
                style={[
                  styles.quickPill,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.04)",
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    fontWeight: "600",
                    color: theme.colors.foreground,
                  }}
                >
                  +{pill}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Card>

      {/* Category / Source Picker */}
      {type === "expense" ? (
        <Card>
          <View style={{ gap: 8 }}>
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
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.02)",
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.selectorLeft}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: theme.colors.primary + "18" },
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
        <Card>
          <View style={{ gap: 8 }}>
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
              {INCOME_SOURCES.map((src) => {
                const active = source === src;
                return (
                  <Pressable
                    key={src}
                    onPress={() => {
                        void haptic.selection();
                      setSource(src);
                    }}
                    style={[
                      styles.sourceChip,
                      {
                        backgroundColor: active
                          ? theme.colors.success
                          : isDark
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.03)",
                        borderColor: active
                          ? theme.colors.success
                          : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: theme.typography.xs,
                        fontWeight: "700",
                        color: active
                          ? theme.colors.primaryForeground
                          : theme.colors.foreground,
                      }}
                    >
                      {src}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>
      )}

      {/* Account Selection with Balance Preview */}
      <Card>
        <View style={{ gap: 8 }}>
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
                const active = accountId === acc.id;
                const kind = getAccountKind(typeMap.get(acc.typeId) || "");
                return (
                  <Pressable
                    key={acc.id}
                    onPress={() => {
                        void haptic.selection();
                      setAccountId(acc.id);
                    }}
                    style={[
                      styles.accountCard,
                      {
                        backgroundColor: active
                          ? isDark
                            ? "rgba(107,99,255,0.18)"
                            : "rgba(79,70,255,0.1)"
                          : isDark
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.03)",
                        borderColor: active
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.accountCardTop}>
                      {kind === "credit" ? (
                        <CreditCard
                          size={16}
                          color={
                            active
                              ? theme.colors.primary
                              : theme.colors.mutedForeground
                          }
                        />
                      ) : (
                        <Wallet
                          size={16}
                          color={
                            active
                              ? theme.colors.primary
                              : theme.colors.mutedForeground
                          }
                        />
                      )}
                      <Text
                        style={{
                          fontSize: theme.typography.sm,
                          fontWeight: "700",
                          color: theme.colors.foreground,
                        }}
                      >
                        {acc.name}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {balancePreview != null && selectedAccount ? (
            <Text
              style={{
                fontSize: theme.typography.xs,
                fontWeight: "700",
                color:
                  balancePreview < 0
                    ? theme.colors.destructive
                    : theme.colors.mutedForeground,
                marginTop: 2,
              }}
            >
              {getAccountKind(selectedTypeName) === "credit"
                ? `Available credit after: ${system.defaultCurrency}${balancePreview.toLocaleString()}`
                : `Balance after: ${system.defaultCurrency}${balancePreview.toLocaleString()}`}
            </Text>
          ) : null}
        </View>
      </Card>

      {/* Note & Date Details */}
      <Card>
        <View style={{ gap: 12 }}>
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
            <View style={{ gap: 8 }}>
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
                    <Pressable onPress={() => handleRemoveTag(t)}>
                      <X size={12} color={theme.colors.mutedForeground} />
                    </Pressable>
                  </View>
                ))}
              </View>

              <View style={styles.tagInputRow}>
                <TextInput
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={handleAddTag}
                  placeholder="Add tag..."
                  placeholderTextColor={theme.colors.mutedForeground}
                  style={[
                    styles.tagTextInput,
                    {
                      color: theme.colors.foreground,
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.03)",
                      borderColor: theme.colors.border,
                    },
                  ]}
                />
                <Button variant="outline" size="sm" onPress={handleAddTag}>
                  Add
                </Button>
              </View>
            </View>
          ) : null}

          {/* Spending Space (optional grouping label) */}
          {type === "expense" && selectableSpaces.length > 0 ? (
            <View style={{ gap: 8 }}>
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
                  const isActive = spaceId === optionId;
                  return (
                    <Pressable
                      key={optionId || "none"}
                      onPress={() => setSpaceId(optionId)}
                      style={[
                        styles.spacePill,
                        {
                          backgroundColor: isActive
                            ? theme.colors.primary
                            : isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)",
                          borderColor: isActive
                            ? theme.colors.primary
                            : theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: theme.typography.xs,
                          fontWeight: isActive ? "700" : "500",
                          color: isActive
                            ? theme.colors.primaryForeground
                            : theme.colors.foreground,
                        }}
                      >
                        {option.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Action Buttons */}
      <View style={{ gap: 10, marginTop: 16, marginBottom: 8 }}>
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
            <Pressable
              onPress={() => setShowCategoryPickerModal(false)}
              style={{
                padding: 8,
                borderRadius: 20,
                backgroundColor: theme.colors.muted,
              }}
              accessibilityLabel="Close category picker"
            >
              <X size={18} color={theme.colors.foreground} />
            </Pressable>
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
        onClose={() => setIsReceiptModalOpen(false)}
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

const styles = StyleSheet.create({
  embeddedBody: {
    gap: 16,
    paddingBottom: 8,
  },
  pageScroll: {
    flex: 1,
  },
  pageScrollContent: {
    gap: 16,
    paddingTop: 8,
    paddingBottom: 48,
  },
  aiQuickStrip: {
    flexDirection: "row",
    gap: 8,
  },
  aiQuickButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  aiQuickButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  typeSegment: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  typeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  typeTabText: {
    fontSize: 14,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 4,
  },
  quickPillsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  quickPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
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
  sourceChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  accountCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  accountCardTop: {
    flexDirection: "row",
    alignItems: "center",
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
  spacePillRow: {
    flexDirection: "row",
    gap: 8,
  },
  spacePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  tagTextInput: {
    flex: 1,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
  },
});

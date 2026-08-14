import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { updateProfile } from "firebase/auth";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Coins,
  CreditCard,
  DollarSign,
  PiggyBank,
  Receipt,
  Sparkles,
  User,
  Wallet,
  X,
} from "lucide-react-native";

import { InstitutionSearchField } from "@/components/accounts/InstitutionSearchField";
import { useAccountsContext } from "@/providers/FinanceDataProvider";
import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { getInstitutionById } from "@/shared/data/institutions";
import type { CanonicalAccountTypeId } from "@/shared/types/expense";
import {
  requiresCatalogInstitution,
  suggestedAccountDisplayName,
} from "@/shared/utils/accountIdentity";
import { canonicalAccountTypeId } from "@/shared/utils/accountKind";
import { useAuth } from "@/providers/AuthProvider";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham" },
  { code: "CAD", symbol: "$", label: "Canadian Dollar" },
  { code: "AUD", symbol: "$", label: "Australian Dollar" },
  { code: "SGD", symbol: "$", label: "Singapore Dollar" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
];

const AVATAR_EMOJIS = ["💰", "🚀", "👑", "🌟", "⚡", "🎯", "💎", "📈", "🔥", "🦁"];

const BUDGET_PRESETS = [15000, 30000, 50000, 100000, 250000];

const ACCOUNT_TYPE_OPTIONS = [
  { key: "bank", label: "Bank Account", icon: PiggyBank },
  { key: "cash", label: "Cash Wallet", icon: Wallet },
  { key: "credit", label: "Credit Card", icon: CreditCard },
  { key: "investment", label: "Investment", icon: Coins },
];

function wizardAccountTypeId(key: string): CanonicalAccountTypeId {
  if (key === "credit") return "credit_card";
  if (key === "bank") return "bank";
  if (key === "cash") return "cash";
  return "other";
}

const WIZARD_STEPS = [
  { title: "Profile", subtitle: "Personalize your account", icon: User },
  { title: "Currency", subtitle: "Select your primary currency", icon: DollarSign },
  { title: "Monthly Budget", subtitle: "Set spending boundary", icon: PiggyBank },
  { title: "First Account", subtitle: "Where do you hold money?", icon: Wallet },
  { title: "First Expense", subtitle: "Log a recent purchase", icon: Receipt },
];

export function SetupWizardModal() {
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { isSetupWizardOpen, setIsSetupWizardOpen, setupWizardInitialStep } = useModals();
  const { user } = useAuth();
  const { data: userDoc } = useUserDoc();
  const { settings, updateSettings } = useSettings();
  const { settings: systemSettings } = useSystemSettings();
  const { addAccount, accountTypes } = useAccountsContext();
  const { celebrate, celebrateMilestone } = useCelebration();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 0: Profile
  const [username, setUsername] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("💰");

  // Step 1: Currency
  const [selectedCurrency, setSelectedCurrency] = useState(systemSettings.defaultCurrency || "INR");

  // Step 2: Budget
  const [budgetAmount, setBudgetAmount] = useState(settings.monthlyBudget ? String(settings.monthlyBudget) : "30000");

  // Step 3: Account
  const [accountName, setAccountName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [accountTypeKey, setAccountTypeKey] = useState("bank");
  const [accountBalance, setAccountBalance] = useState("10000");
  const [institutionId, setInstitutionId] = useState("");
  const [accountLast4, setAccountLast4] = useState("");

  // Step 4: Expense
  const [expenseAmount, setExpenseAmount] = useState("250");
  const [expenseCategory] = useState("Food");
  const [expenseNote, setExpenseNote] = useState("Coffee & snacks");

  useEffect(() => {
    if (isSetupWizardOpen) {
      setCurrentStep(setupWizardInitialStep || 0);
      setUsername(userDoc?.username || user?.displayName || "");
      setSelectedCurrency(systemSettings.defaultCurrency || "INR");
      if (settings.monthlyBudget > 0) {
        setBudgetAmount(String(settings.monthlyBudget));
      }
    }
  }, [isSetupWizardOpen, setupWizardInitialStep, userDoc, user, systemSettings, settings]);

  if (!isSetupWizardOpen) return null;

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setIsSetupWizardOpen(false);
  };

  const handleNext = async () => {
    setLoading(true);
    const db = getFirestoreDb();
    try {
      if (currentStep === 0) {
        // Save Profile
        if (username.trim() && user && db) {
          await setDoc(
            doc(db, "users", user.uid),
            {
              username: username.trim(),
              avatar: selectedEmoji,
            },
            { merge: true }
          );
          await updateProfile(user, { displayName: username.trim() }).catch(() => undefined);
        }
      } else if (currentStep === 1) {
        // Save Currency
        if (db) {
          await setDoc(
            doc(db, "system_settings", "global"),
            {
              defaultCurrency: selectedCurrency,
            },
            { merge: true }
          );
        }
      } else if (currentStep === 2) {
        // Save Monthly Budget
        const num = parseFloat(budgetAmount);
        if (!isNaN(num) && num > 0) {
          await updateSettings({
            monthlyBudget: num,
          });
          celebrateMilestone("milestone_first_budget", {
            title: "First Budget Set!",
            subtitle: "Setting limits is the secret to financial freedom.",
            badgeEmoji: "🎯",
            pointsEarned: 25,
          });
        }
      } else if (currentStep === 3) {
        const accountTypeId = wizardAccountTypeId(accountTypeKey);
        const catalog = getInstitutionById(institutionId);
        if (requiresCatalogInstitution(accountTypeId) && !catalog) {
          toast.error("Select an institution from the list");
          return;
        }
        const displayName =
          accountName.trim() ||
          suggestedAccountDisplayName(catalog, accountTypeId);
        if (!displayName) {
          toast.error("Enter a display name or select an institution");
          return;
        }
        const bal = parseFloat(accountBalance) || 0;
        const matchedType =
          accountTypes.find(
            (t) => canonicalAccountTypeId(t.name) === accountTypeId
          ) ||
          accountTypes.find((t) =>
            t.name.toLowerCase().includes(accountTypeKey)
          );
        const typeId = matchedType?.id || accountTypes[0]?.id || "default_bank";
        await addAccount(displayName, typeId, {
          currency: selectedCurrency,
          openingBalance: bal,
          displayName,
          institutionId: catalog?.id || "",
          last4: accountLast4.trim() || undefined,
          accountTypeId,
        });
      } else if (currentStep === 4) {
        // Save First Expense
        const exp = parseFloat(expenseAmount);
        if (!isNaN(exp) && exp > 0 && user && db) {
          await addDoc(collection(db, "users", user.uid, "expenses"), {
            amount: exp,
            category: expenseCategory,
            description: expenseNote || "First expense",
            date: new Date().toISOString().split("T")[0],
            createdAt: serverTimestamp(),
          });
          celebrateMilestone("milestone_first_expense", {
            title: "First Expense Logged!",
            subtitle: "You've taken the first step towards mindful spending!",
            badgeEmoji: "🎉",
            pointsEarned: 25,
          });
        }
        toast.success("Setup complete! Your workspace is ready.");
        setIsSetupWizardOpen(false);
        return;
      }

      Haptics.selectionAsync().catch(() => undefined);
      if (currentStep < WIZARD_STEPS.length - 1) {
        setCurrentStep((prev) => prev + 1);
      } else {
        celebrate({
          title: "Setup Completed!",
          subtitle: "Your financial hub is ready",
          badgeEmoji: "🎉",
        });
        setIsSetupWizardOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      Haptics.selectionAsync().catch(() => undefined);
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    Haptics.selectionAsync().catch(() => undefined);
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      setIsSetupWizardOpen(false);
    }
  };

  const currentStepData = WIZARD_STEPS[currentStep];

  return (
    <Modal
      visible={isSetupWizardOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background,
            paddingTop: insets.top + 8,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {currentStep > 0 ? (
                <Pressable
                  onPress={handleBack}
                  style={styles.iconBtn}
                  accessibilityLabel="Previous step"
                >
                  <ArrowLeft size={22} color={theme.colors.foreground} />
                </Pressable>
              ) : null}
              <View>
                <Text style={[styles.stepCountText, { color: theme.colors.primary }]}>
                  STEP {currentStep + 1} OF {WIZARD_STEPS.length}
                </Text>
                <Text style={[styles.headerTitle, { color: theme.colors.foreground }]}>
                  {currentStepData.title}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleClose}
              style={[
                styles.iconBtn,
                { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" },
              ]}
              accessibilityLabel="Close wizard"
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Progress Bar Meter */}
          <View style={[styles.progressBarBg, { backgroundColor: theme.colors.border }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: theme.colors.primary,
                  width: `${((currentStep + 1) / WIZARD_STEPS.length) * 100}%`,
                },
              ]}
            />
          </View>

          {/* Body Content */}
          <ScrollView
            contentContainerStyle={styles.scrollBody}
            keyboardShouldPersistTaps="handled"
          >
            {/* Step 0: Profile */}
            {currentStep === 0 && (
              <View style={styles.stepContainer}>
                <View style={[styles.stepHeroCircle, { backgroundColor: isDark ? "rgba(99, 102, 241, 0.15)" : "rgba(99, 102, 241, 0.1)" }]}>
                  <Text style={{ fontSize: 44 }}>{selectedEmoji}</Text>
                </View>

                <Text style={[styles.stepHeading, { color: theme.colors.foreground }]}>
                  What should we call you?
                </Text>
                <Text style={[styles.stepSubheading, { color: theme.colors.mutedForeground }]}>
                  Your name will appear across your financial workspaces and shared vaults.
                </Text>

                {/* Name Input */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Display Name
                  </Text>
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter your name"
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                </View>

                {/* Avatar Picker */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Choose Avatar Emoji
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow}>
                    {AVATAR_EMOJIS.map((emoji) => (
                      <Pressable
                        key={emoji}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => undefined);
                          setSelectedEmoji(emoji);
                        }}
                        style={[
                          styles.emojiChip,
                          selectedEmoji === emoji && [
                            styles.emojiChipActive,
                            { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + "20" },
                          ],
                        ]}
                      >
                        <Text style={{ fontSize: 24 }}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Step 1: Currency */}
            {currentStep === 1 && (
              <View style={styles.stepContainer}>
                <View style={[styles.stepHeroCircle, { backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.1)" }]}>
                  <DollarSign size={36} color="#10B981" />
                </View>

                <Text style={[styles.stepHeading, { color: theme.colors.foreground }]}>
                  Choose Primary Currency
                </Text>
                <Text style={[styles.stepSubheading, { color: theme.colors.mutedForeground }]}>
                  All net worth totals and overall analytics will be standardized to this currency.
                </Text>

                <View style={styles.currencyGrid}>
                  {CURRENCIES.map((curr) => {
                    const isSelected = selectedCurrency === curr.code;
                    return (
                      <Pressable
                        key={curr.code}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => undefined);
                          setSelectedCurrency(curr.code);
                        }}
                        style={[
                          styles.currencyCard,
                          {
                            backgroundColor: isSelected
                              ? isDark
                                ? "rgba(107, 99, 255, 0.18)"
                                : "rgba(79, 70, 255, 0.1)"
                              : theme.colors.card,
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                      >
                        <View style={styles.currencyTop}>
                          <Text style={[styles.currSymbol, { color: isSelected ? theme.colors.primary : theme.colors.foreground }]}>
                            {curr.symbol}
                          </Text>
                          {isSelected && <Check size={16} color={theme.colors.primary} strokeWidth={3} />}
                        </View>
                        <Text style={[styles.currCode, { color: theme.colors.foreground }]}>
                          {curr.code}
                        </Text>
                        <Text style={[styles.currLabel, { color: theme.colors.mutedForeground }]}>
                          {curr.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Step 2: Budget */}
            {currentStep === 2 && (
              <View style={styles.stepContainer}>
                <View style={[styles.stepHeroCircle, { backgroundColor: isDark ? "rgba(236, 72, 153, 0.15)" : "rgba(236, 72, 153, 0.1)" }]}>
                  <PiggyBank size={36} color="#EC4899" />
                </View>

                <Text style={[styles.stepHeading, { color: theme.colors.foreground }]}>
                  Set Monthly Spending Target
                </Text>
                <Text style={[styles.stepSubheading, { color: theme.colors.mutedForeground }]}>
                  We will monitor your daily burn rate and notify you before you overspend.
                </Text>

                {/* Amount Input */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Monthly Budget ({selectedCurrency})
                  </Text>
                  <TextInput
                    value={budgetAmount}
                    onChangeText={setBudgetAmount}
                    keyboardType="numeric"
                    placeholder="e.g. 50000"
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                        fontSize: 22,
                        fontWeight: "800",
                      },
                    ]}
                  />
                </View>

                {/* Quick Presets */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Quick Presets
                  </Text>
                  <View style={styles.presetsRow}>
                    {BUDGET_PRESETS.map((amount) => (
                      <Pressable
                        key={amount}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => undefined);
                          setBudgetAmount(String(amount));
                        }}
                        style={[
                          styles.presetChip,
                          budgetAmount === String(amount) && [
                            styles.presetChipActive,
                            { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                          ],
                          { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetText,
                            {
                              color: budgetAmount === String(amount) ? "#FFFFFF" : theme.colors.foreground,
                              fontWeight: "700",
                            },
                          ]}
                        >
                          {selectedCurrency} {amount.toLocaleString()}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Step 3: First Account */}
            {currentStep === 3 && (
              <View style={styles.stepContainer}>
                <View style={[styles.stepHeroCircle, { backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.1)" }]}>
                  <Wallet size={36} color="#F59E0B" />
                </View>

                <Text style={[styles.stepHeading, { color: theme.colors.foreground }]}>
                  Add Your Primary Account
                </Text>
                <Text style={[styles.stepSubheading, { color: theme.colors.mutedForeground }]}>
                  Where do your transactions flow from? You can add unlimited accounts later.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Account Type
                  </Text>
                  <View style={styles.typeGrid}>
                    {ACCOUNT_TYPE_OPTIONS.map((t) => {
                      const Icon = t.icon;
                      const isSelected = accountTypeKey === t.key;
                      return (
                        <Pressable
                          key={t.key}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => undefined);
                            setAccountTypeKey(t.key);
                            const nextTypeId = wizardAccountTypeId(t.key);
                            if (!requiresCatalogInstitution(nextTypeId)) {
                              setInstitutionId("");
                            }
                            if (!displayNameTouched) {
                              setAccountName(
                                suggestedAccountDisplayName(
                                  requiresCatalogInstitution(nextTypeId)
                                    ? getInstitutionById(institutionId)
                                    : undefined,
                                  nextTypeId
                                )
                              );
                            }
                          }}
                          style={[
                            styles.typeCard,
                            {
                              backgroundColor: isSelected
                                ? isDark
                                  ? "rgba(107, 99, 255, 0.18)"
                                  : "rgba(79, 70, 255, 0.1)"
                                : theme.colors.card,
                              borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                            },
                          ]}
                        >
                          <Icon size={20} color={isSelected ? theme.colors.primary : theme.colors.mutedForeground} />
                          <Text style={[styles.typeLabel, { color: isSelected ? theme.colors.primary : theme.colors.foreground }]}>
                            {t.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {requiresCatalogInstitution(wizardAccountTypeId(accountTypeKey)) ? (
                  <View style={[styles.inputGroup, { width: "100%" }]}>
                    <InstitutionSearchField
                      selectedId={institutionId}
                      required
                      onSelect={(institution) => {
                        const nextId = institution?.id ?? "";
                        setInstitutionId(nextId);
                        if (!displayNameTouched) {
                          setAccountName(
                            suggestedAccountDisplayName(
                              institution ?? undefined,
                              wizardAccountTypeId(accountTypeKey)
                            )
                          );
                        }
                      }}
                    />
                  </View>
                ) : null}

                {requiresCatalogInstitution(wizardAccountTypeId(accountTypeKey)) ? (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                      Last 4
                    </Text>
                    <TextInput
                      value={accountLast4}
                      onChangeText={setAccountLast4}
                      placeholder="e.g. 4521"
                      keyboardType="number-pad"
                      placeholderTextColor={theme.colors.mutedForeground}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: theme.colors.card,
                          borderColor: theme.colors.border,
                          color: theme.colors.foreground,
                        },
                      ]}
                    />
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Display Name
                  </Text>
                  <TextInput
                    value={accountName}
                    onChangeText={(value) => {
                      setDisplayNameTouched(true);
                      setAccountName(value);
                    }}
                    placeholder={
                      suggestedAccountDisplayName(
                        getInstitutionById(institutionId),
                        wizardAccountTypeId(accountTypeKey)
                      ) || "Optional nickname"
                    }
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Current Balance ({selectedCurrency})
                  </Text>
                  <TextInput
                    value={accountBalance}
                    onChangeText={setAccountBalance}
                    keyboardType="numeric"
                    placeholder="e.g. 10000"
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* Step 4: First Expense */}
            {currentStep === 4 && (
              <View style={styles.stepContainer}>
                <View style={[styles.stepHeroCircle, { backgroundColor: isDark ? "rgba(107, 99, 255, 0.15)" : "rgba(79, 70, 255, 0.1)" }]}>
                  <Sparkles size={36} color={theme.colors.primary} />
                </View>

                <Text style={[styles.stepHeading, { color: theme.colors.foreground }]}>
                  Log Your First Expense
                </Text>
                <Text style={[styles.stepSubheading, { color: theme.colors.mutedForeground }]}>
                  Record any recent transaction to initiate your personal financial charts.
                </Text>

                {/* Amount */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Amount ({selectedCurrency})
                  </Text>
                  <TextInput
                    value={expenseAmount}
                    onChangeText={setExpenseAmount}
                    keyboardType="numeric"
                    placeholder="e.g. 250"
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                        fontSize: 22,
                        fontWeight: "800",
                      },
                    ]}
                  />
                </View>

                {/* Note / Description */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Description / Note
                  </Text>
                  <TextInput
                    value={expenseNote}
                    onChangeText={setExpenseNote}
                    placeholder="e.g. Coffee & snacks"
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Controls */}
          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Pressable
              onPress={handleSkip}
              style={styles.skipBtn}
              accessibilityRole="button"
              accessibilityLabel="Skip this step"
            >
              <Text style={[styles.skipBtnText, { color: theme.colors.mutedForeground }]}>
                Skip
              </Text>
            </Pressable>

            <Pressable
              onPress={handleNext}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.colors.primary },
                pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel={currentStep === WIZARD_STEPS.length - 1 ? "Finish Setup" : "Save & Continue"}
            >
              <Text style={styles.primaryBtnText}>
                {currentStep === WIZARD_STEPS.length - 1 ? "Finish Setup" : "Save & Continue"}
              </Text>
              {currentStep === WIZARD_STEPS.length - 1 ? (
                <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2.4} />
              ) : (
                <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.4} />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepCountText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBarBg: {
    height: 4,
    width: "100%",
  },
  progressBarFill: {
    height: "100%",
  },
  scrollBody: {
    padding: 24,
  },
  stepContainer: {
    gap: 16,
    alignItems: "center",
  },
  stepHeroCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  stepHeading: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  stepSubheading: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  inputGroup: {
    width: "100%",
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  textInput: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  emojiRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 4,
  },
  emojiChip: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  emojiChipActive: {
    borderWidth: 2,
  },
  currencyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
  },
  currencyCard: {
    width: "31%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  currencyTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  currSymbol: {
    fontSize: 18,
    fontWeight: "900",
  },
  currCode: {
    fontSize: 14,
    fontWeight: "800",
  },
  currLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetChipActive: {},
  presetText: {
    fontSize: 13,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  typeCard: {
    width: "48%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 48,
    borderRadius: 14,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});

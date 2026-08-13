import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ScrollView,
  Modal,
  TextInput,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  HelpCircle,
  Tag,
  Target,
  PiggyBank,
  Wallet,
  CreditCard,
  Sparkles,
} from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useAccounts } from "@/hooks/useAccounts";
import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InstitutionSearchField } from "@/components/accounts/InstitutionSearchField";
import { SmsMatchingUnconfiguredText } from "@/components/accounts/SmsMatchingUnconfiguredText";
import { getInstitutionById } from "@/shared/data/institutions";
import {
  requiresCatalogInstitution,
  suggestedAccountDisplayName,
} from "@/shared/utils/accountIdentity";
import {
  canonicalAccountTypeId,
  isCreditAccount,
} from "@/shared/utils/accountKind";
import { Amount } from "@/components/common/Amount";

// -------------------------------------------------------------
// Helper Component: Material 3 Collapsible Section
// -------------------------------------------------------------
function CollapsibleSection({
  title,
  subtitle,
  children,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ size: number; color: string }>;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setExpanded(!expanded);
  };

  return (
    <View
      style={[
        styles.sectionCard,
        theme.elevation[1],
        {
          backgroundColor: theme.colors.card,
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        },
      ]}
    >
      <Pressable
        onPress={toggleExpand}
        android_ripple={{
          color: theme.colors.primary + "18",
          borderless: false,
        }}
        style={styles.sectionHeader}
        accessibilityRole="button"
        accessibilityLabel={`${title} section, ${expanded ? "expanded" : "collapsed"}`}
      >
        <View style={styles.sectionTitleRow}>
          {Icon ? (
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: isDark
                    ? "rgba(107, 99, 255, 0.15)"
                    : "rgba(79, 70, 255, 0.08)",
                },
              ]}
            >
              <Icon size={18} color={theme.colors.primary} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.sectionSubtitle, { color: theme.colors.mutedForeground }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.chevronBox,
            { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
          ]}
        >
          {expanded ? (
            <ChevronUp size={20} color={theme.colors.foreground} />
          ) : (
            <ChevronDown size={20} color={theme.colors.foreground} />
          )}
        </View>
      </Pressable>

      {expanded ? (
        <View style={[styles.sectionBody, { borderTopColor: theme.colors.border }]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

// -------------------------------------------------------------
// 1. Dashboard Widget Toggles (Personalization)
// -------------------------------------------------------------
const WIDGET_DEFS = [
  { id: "subscriptions", label: "Subscriptions", desc: "Recurring subscriptions & bills" },
  { id: "focus", label: "Focus Mode", desc: "Monthly limits & financial goals" },
  { id: "gamification", label: "Gamification", desc: "Daily streaks, badges & XP" },
  { id: "topCategories", label: "Top Categories", desc: "Top spending distribution" },
] as const;

export function DashboardWidgetToggles() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings, updateSettings } = useSettings();

  const toggleWidget = (id: keyof typeof settings.dashboardWidgets) => {
    Haptics.selectionAsync().catch(() => undefined);
    const current = settings.dashboardWidgets || {};
    const updated = {
      ...current,
      [id]: !(current[id] ?? true),
    };
    void updateSettings({ dashboardWidgets: updated });
  };

  return (
    <View style={{ gap: 12 }}>
      <View>
        <Text style={{ color: theme.colors.foreground, fontWeight: "800", fontSize: 16 }}>
          Dashboard Widgets
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 13, marginTop: 2 }}>
          Customize what appears on your home dashboard.
        </Text>
      </View>

      <View style={{ gap: 8, marginTop: 4 }}>
        {WIDGET_DEFS.map((widget) => {
          const checked = settings.dashboardWidgets?.[widget.id] ?? true;
          return (
            <Pressable
              key={widget.id}
              onPress={() => toggleWidget(widget.id as any)}
              android_ripple={{
                color: theme.colors.primary + "14",
                borderless: false,
              }}
              style={[
                styles.tileRow,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(0,0,0,0.02)",
                  borderColor: theme.colors.border,
                },
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked }}
            >
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ color: theme.colors.foreground, fontWeight: "700", fontSize: 15 }}>
                  {widget.label}
                </Text>
                <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {widget.desc}
                </Text>
              </View>
              <Switch
                value={checked}
                onValueChange={() => toggleWidget(widget.id as any)}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor="#FFFFFF"
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// 2. Auto-Categorization Rules (Personalization)
// -------------------------------------------------------------
export function AutoCategorizationRulesManager() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { rules, addRule, deleteRule } = useCategorizationRules();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("Food & Dining");
  const [subcategory, setSubcategory] = useState("Groceries");

  const handleAdd = () => {
    if (!keyword.trim() || !category) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    void addRule(keyword.trim(), category, subcategory);
    setKeyword("");
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    deleteRule(id);
  };

  return (
    <CollapsibleSection
      title="Auto-Categorization Rules"
      subtitle={`Auto-assign categories by keyword (${rules.length} active)`}
      icon={Sparkles}
    >
      <View style={{ gap: 14 }}>
        <Input
          label="Keyword Trigger"
          placeholder='e.g. "netflix", "uber", "starbucks"'
          value={keyword}
          onChangeText={setKeyword}
          autoCapitalize="none"
        />

        <CategoryPicker
          category={category}
          subcategory={subcategory}
          onCategoryChange={(cat, sub) => {
            setCategory(cat);
            setSubcategory(sub);
          }}
          label="Target Category & Subcategory"
        />

        <Button
          onPress={handleAdd}
          disabled={!keyword.trim() || !category}
          style={{ height: 48, borderRadius: 12 }}
        >
          Add Rule
        </Button>

        <View style={{ gap: 8, marginTop: 8 }}>
          {rules.length === 0 ? (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: 13,
                fontStyle: "italic",
                textAlign: "center",
                paddingVertical: 12,
              }}
            >
              No rules yet. Any transaction note matching a keyword will be categorized automatically.
            </Text>
          ) : (
            rules.map((rule) => (
              <View
                key={rule.id}
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.02)",
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: theme.colors.foreground, fontWeight: "800", fontSize: 14 }}>
                    "{rule.keyword}"
                  </Text>
                  <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 3 }}>
                    → {rule.category} {rule.subcategory ? `› ${rule.subcategory}` : ""}
                  </Text>
                </View>

                {/* 48x48dp Touch Target Delete Button */}
                <Pressable
                  onPress={() => handleDelete(rule.id)}
                  android_ripple={{
                    color: "rgba(239, 68, 68, 0.2)",
                    borderless: true,
                    radius: 24,
                  }}
                  style={styles.touchActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete rule for ${rule.keyword}`}
                >
                  <Trash2 size={18} color={theme.colors.destructive} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>
    </CollapsibleSection>
  );
}

// -------------------------------------------------------------
// 3. Category Budgets (Manage)
// -------------------------------------------------------------
export function CategoryBudgetsManager() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { budgets, addBudget, deleteBudget } = useCategoryBudgets();
  const { celebrateMilestone } = useCelebration();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food & Dining");
  const [subcategory, setSubcategory] = useState("Groceries");

  const [month, setMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}`;
  });

  const handleAdd = () => {
    const amt = Number(amount);
    if (!category || !month || isNaN(amt) || amt <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    void addBudget(category, amt, month, subcategory);
    celebrateMilestone("milestone_first_budget", {
      title: "First Budget Set!",
      subtitle: "Setting limits is the secret to financial freedom.",
      badgeEmoji: "🎯",
      pointsEarned: 25,
    });
    setAmount("");
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    deleteBudget(id);
  };

  return (
    <CollapsibleSection
      title="Category Budgets"
      subtitle={`Set category spending boundaries (${budgets.length} active)`}
      icon={PiggyBank}
    >
      <View style={{ gap: 14 }}>
        <CategoryPicker
          category={category}
          subcategory={subcategory}
          onCategoryChange={(cat, sub) => {
            setCategory(cat);
            setSubcategory(sub);
          }}
          label="Budget Category"
        />

        <Input
          label="Month (YYYY-MM)"
          placeholder="e.g. 2026-08"
          value={month}
          onChangeText={setMonth}
        />

        <Input
          label="Limit Amount"
          placeholder="e.g. 15000"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />

        <Button
          onPress={handleAdd}
          disabled={!category || !month || !amount}
          style={{ height: 48, borderRadius: 12 }}
        >
          Add Budget
        </Button>

        <View style={{ gap: 8, marginTop: 8 }}>
          {budgets.length === 0 ? (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: 13,
                fontStyle: "italic",
                textAlign: "center",
                paddingVertical: 12,
              }}
            >
              No category budgets set for this month.
            </Text>
          ) : (
            budgets.map((b) => (
              <View
                key={b.id}
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.02)",
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: theme.colors.foreground, fontWeight: "800", fontSize: 14 }}>
                    {b.category} {b.subcategory ? `› ${b.subcategory}` : ""}
                  </Text>
                  <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 3 }}>
                    {b.month} · <Amount value={b.amount} style={{ fontWeight: "700" }} />
                  </Text>
                </View>

                {/* 48x48dp Touch Target Delete Button */}
                <Pressable
                  onPress={() => handleDelete(b.id)}
                  android_ripple={{
                    color: "rgba(239, 68, 68, 0.2)",
                    borderless: true,
                    radius: 24,
                  }}
                  style={styles.touchActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Delete budget"
                >
                  <Trash2 size={18} color={theme.colors.destructive} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>
    </CollapsibleSection>
  );
}

// -------------------------------------------------------------
// 4. Financial Goals (Manage)
// -------------------------------------------------------------
export function FinancialGoalsManager() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { goals, addGoal, deleteGoal } = useFinancialGoals();
  const { celebrateMilestone } = useCelebration();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [deadline, setDeadline] = useState("");

  const handleAdd = () => {
    const tgt = Number(target);
    const cur = Number(current);
    if (!name.trim() || isNaN(tgt) || tgt <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    void addGoal(name.trim(), tgt, cur, deadline);
    celebrateMilestone("milestone_first_goal", {
      title: "First Goal Created!",
      subtitle: "Every dream begins with a target. Keep going!",
      badgeEmoji: "✨",
      pointsEarned: 50,
    });
    setName("");
    setTarget("");
    setCurrent("");
    setDeadline("");
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    deleteGoal(id);
  };

  return (
    <CollapsibleSection
      title="Financial Goals"
      subtitle={`Track savings targets and milestones (${goals.length} active)`}
      icon={Target}
    >
      <View style={{ gap: 14 }}>
        <Input
          label="Goal Name"
          placeholder="e.g. Emergency Fund, Vacation, New Laptop"
          value={name}
          onChangeText={setName}
        />

        <Input
          label="Target Amount"
          placeholder="e.g. 50000"
          value={target}
          onChangeText={setTarget}
          keyboardType="numeric"
        />

        <Input
          label="Current Savings"
          placeholder="e.g. 10000 (starting balance)"
          value={current}
          onChangeText={setCurrent}
          keyboardType="numeric"
        />

        <Input
          label="Deadline (optional)"
          placeholder="YYYY-MM-DD"
          value={deadline}
          onChangeText={setDeadline}
        />

        <Button
          onPress={handleAdd}
          disabled={!name.trim() || !target}
          style={{ height: 48, borderRadius: 12 }}
        >
          Add Goal
        </Button>

        <View style={{ gap: 8, marginTop: 8 }}>
          {goals.length === 0 ? (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: 13,
                fontStyle: "italic",
                textAlign: "center",
                paddingVertical: 12,
              }}
            >
              No financial goals set yet.
            </Text>
          ) : (
            goals.map((g) => {
              const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
              return (
                <View
                  key={g.id}
                  style={[
                    styles.itemCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(0,0,0,0.02)",
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ color: theme.colors.foreground, fontWeight: "800", fontSize: 14 }}>
                      {g.name}
                    </Text>
                    <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 3 }}>
                      <Amount value={g.currentAmount} /> / <Amount value={g.targetAmount} /> ({pct}%)
                      {g.deadline ? ` · ${g.deadline}` : ""}
                    </Text>

                    {/* Mini Progress Bar */}
                    <View
                      style={[
                        styles.goalProgressBarBg,
                        { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
                      ]}
                    >
                      <View
                        style={[
                          styles.goalProgressBarFill,
                          {
                            backgroundColor: theme.colors.primary,
                            width: `${pct}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* 48x48dp Touch Target Delete Button */}
                  <Pressable
                    onPress={() => handleDelete(g.id)}
                    android_ripple={{
                      color: "rgba(239, 68, 68, 0.2)",
                      borderless: true,
                      radius: 24,
                    }}
                    style={styles.touchActionBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete goal ${g.name}`}
                  >
                    <Trash2 size={18} color={theme.colors.destructive} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </View>
    </CollapsibleSection>
  );
}

// -------------------------------------------------------------
// 5. Account Types (Accounts)
// -------------------------------------------------------------
export function AccountTypesManager() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { accountTypes, addAccountType, deleteAccountType } = useAccountTypes();
  const [newType, setNewType] = useState("");

  const handleAdd = () => {
    if (!newType.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    void addAccountType(newType.trim());
    setNewType("");
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    deleteAccountType(id);
  };

  return (
    <CollapsibleSection
      title="Account Types"
      subtitle={`Define categories of accounts (${accountTypes.length} types)`}
      icon={Wallet}
    >
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Input
              label="New Account Type"
              placeholder="e.g. Bank, Credit Card, Cash, Crypto"
              value={newType}
              onChangeText={setNewType}
            />
          </View>
          <Button
            onPress={handleAdd}
            disabled={!newType.trim()}
            style={{ height: 48, paddingHorizontal: 20, borderRadius: 12 }}
          >
            Add
          </Button>
        </View>

        <View style={{ gap: 8, marginTop: 8 }}>
          {accountTypes.length === 0 ? (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: 13,
                fontStyle: "italic",
                textAlign: "center",
                paddingVertical: 12,
              }}
            >
              No custom account types.
            </Text>
          ) : (
            accountTypes.map((t) => (
              <View
                key={t.id}
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.02)",
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.foreground, fontWeight: "700", fontSize: 15 }}>
                  {t.name}
                </Text>

                {/* 48x48dp Touch Target Delete Button */}
                <Pressable
                  onPress={() => handleDelete(t.id)}
                  android_ripple={{
                    color: "rgba(239, 68, 68, 0.2)",
                    borderless: true,
                    radius: 24,
                  }}
                  style={styles.touchActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete account type ${t.name}`}
                >
                  <Trash2 size={18} color={theme.colors.destructive} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>
    </CollapsibleSection>
  );
}

// -------------------------------------------------------------
// 6. Custom Accounts (Accounts)
// -------------------------------------------------------------
export function AccountsManager() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { accounts, addAccount, deleteAccount } = useAccounts();
  const { accountTypes } = useAccountTypes();

  const [name, setName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [billGenerationDay, setBillGenerationDay] = useState("");
  const [last4, setLast4] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [showTypePicker, setShowTypePicker] = useState(false);

  const selectedTypeName = useMemo(() => {
    const match = accountTypes.find((t) => t.id === typeId);
    return match ? match.name : "";
  }, [accountTypes, typeId]);

  const isCredit = useMemo(() => {
    return isCreditAccount(selectedTypeName);
  }, [selectedTypeName]);

  const accountTypeId = canonicalAccountTypeId(selectedTypeName);
  const needsInstitution = requiresCatalogInstitution(accountTypeId);
  const catalogInstitution = getInstitutionById(institutionId);
  const suggestedName = suggestedAccountDisplayName(
    catalogInstitution,
    accountTypeId
  );
  const canAdd =
    Boolean(typeId) && (!needsInstitution || Boolean(catalogInstitution));

  const handleAdd = () => {
    if (!canAdd) return;
    const displayName = name.trim() || suggestedName;
    if (!displayName) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

    const extras: any = {
      displayName,
      last4: last4.trim() || undefined,
      institutionId: catalogInstitution?.id || "",
      accountTypeId,
    };
    if (isCredit) {
      if (creditLimit) extras.creditLimit = Number(creditLimit);
      if (billGenerationDay) extras.billGenerationDay = Number(billGenerationDay);
    } else {
      if (openingBalance) {
        extras.openingBalance = Number(openingBalance);
        extras.balanceInitialized = true;
        extras.balanceAsOfDate = new Date().toISOString().split("T")[0];
      }
    }

    void addAccount(displayName, typeId, extras);

    setName("");
    setDisplayNameTouched(false);
    setTypeId("");
    setOpeningBalance("");
    setCreditLimit("");
    setBillGenerationDay("");
    setLast4("");
    setInstitutionId("");
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    deleteAccount(id);
  };

  return (
    <CollapsibleSection
      title="Financial Accounts"
      subtitle={`Configure bank accounts, wallets, and cards (${accounts.length} active)`}
      icon={CreditCard}
    >
      <View style={{ gap: 14 }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setShowTypePicker(true);
          }}
        >
          <Input
            label="Account Type"
            value={selectedTypeName || "Tap to select type..."}
            editable={false}
            pointerEvents="none"
          />
        </Pressable>

        {needsInstitution ? (
          <InstitutionSearchField
            selectedId={institutionId}
            required
            disabled={!typeId}
            onSelect={(institution) => {
              const nextId = institution?.id ?? "";
              setInstitutionId(nextId);
              if (!displayNameTouched) {
                setName(
                  suggestedAccountDisplayName(
                    institution ?? undefined,
                    accountTypeId
                  )
                );
              }
            }}
          />
        ) : null}

        {typeId && accountTypeId !== "cash" ? (
          <Input
            label="Last 4 digits"
            placeholder="e.g. 4521"
            value={last4}
            onChangeText={setLast4}
            keyboardType="numeric"
          />
        ) : null}

        {typeId && !isCredit ? (
          <Input
            label="Starting Balance"
            placeholder="e.g. 5000"
            value={openingBalance}
            onChangeText={setOpeningBalance}
            keyboardType="numeric"
          />
        ) : null}

        {typeId && isCredit ? (
          <>
            <Input
              label="Credit Limit"
              placeholder="e.g. 100000"
              value={creditLimit}
              onChangeText={setCreditLimit}
              keyboardType="numeric"
            />
            <Input
              label="Bill Generation Day (1-28)"
              placeholder="e.g. 15"
              value={billGenerationDay}
              onChangeText={setBillGenerationDay}
              keyboardType="numeric"
            />
          </>
        ) : null}

        <Input
          label="Display Name"
          placeholder={suggestedName || "e.g. Super Money Credit Card"}
          value={name}
          onChangeText={(value) => {
            setDisplayNameTouched(true);
            setName(value);
          }}
          helperText="Optional. Separate from institution identity."
        />

        <Button
          onPress={handleAdd}
          disabled={!canAdd}
          style={{ height: 48, borderRadius: 12 }}
        >
          Add Account
        </Button>

        <View style={{ gap: 8, marginTop: 8 }}>
          {accounts.length === 0 ? (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: 13,
                fontStyle: "italic",
                textAlign: "center",
                paddingVertical: 12,
              }}
            >
              No custom accounts added yet.
            </Text>
          ) : (
            accounts.map((acc) => {
              const typeName =
                accountTypes.find((t) => t.id === acc.typeId)?.name || "Account";
              return (
                <View
                  key={acc.id}
                  style={[
                    styles.itemCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(0,0,0,0.02)",
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ color: theme.colors.foreground, fontWeight: "800", fontSize: 15 }}>
                      {acc.name}
                    </Text>
                    <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 3 }}>
                      {[
                        typeName,
                        acc.institutionName,
                        acc.last4 ? `•••• ${acc.last4}` : null,
                        acc.creditLimit
                          ? `Limit: ${acc.creditLimit.toLocaleString()}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    <SmsMatchingUnconfiguredText
                      account={acc}
                      typeName={typeName}
                    />
                  </View>

                  {/* 48x48dp Touch Target Delete Button */}
                  <Pressable
                    onPress={() => handleDelete(acc.id)}
                    android_ripple={{
                      color: "rgba(239, 68, 68, 0.2)",
                      borderless: true,
                      radius: 24,
                    }}
                    style={styles.touchActionBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete account ${acc.name}`}
                  >
                    <Trash2 size={18} color={theme.colors.destructive} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {/* Material 3 Bottom Sheet Type Selector */}
        <Modal
          visible={showTypePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTypePicker(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
            <Pressable style={styles.modalBackdrop} onPress={() => setShowTypePicker(false)} />
            <View
              style={[
                styles.modalBottomSheet,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.sheetHandle} />
              <Text style={[styles.modalTitle, { color: theme.colors.foreground }]}>
                Select Account Type
              </Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {accountTypes.length === 0 ? (
                  <Text style={{ color: theme.colors.mutedForeground, padding: 16, textAlign: "center" }}>
                    No custom types defined yet. Add an account type first.
                  </Text>
                ) : (
                  accountTypes.map((type) => (
                    <Pressable
                      key={type.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setTypeId(type.id);
                        const nextTypeId = canonicalAccountTypeId(type.name);
                        if (!requiresCatalogInstitution(nextTypeId)) {
                          setInstitutionId("");
                        }
                        if (!displayNameTouched) {
                          setName(
                            suggestedAccountDisplayName(
                              requiresCatalogInstitution(nextTypeId)
                                ? getInstitutionById(institutionId)
                                : undefined,
                              nextTypeId
                            )
                          );
                        }
                        setShowTypePicker(false);
                      }}
                      android_ripple={{
                        color: theme.colors.primary + "1A",
                        borderless: false,
                      }}
                      style={({ pressed }) => [
                        styles.pickerItem,
                        {
                          borderBottomColor: theme.colors.border,
                          backgroundColor: pressed
                            ? isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)"
                            : "transparent",
                        },
                      ]}
                    >
                      <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>
                        {type.name}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
              <Button
                onPress={() => setShowTypePicker(false)}
                variant="outline"
                style={{ marginTop: 12, height: 48, borderRadius: 12 }}
              >
                Cancel
              </Button>
            </View>
          </View>
        </Modal>
      </View>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  chevronBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sectionBody: {
    padding: 16,
    borderTopWidth: 1,
  },
  tileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 56,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 52,
  },
  touchActionBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  goalProgressBarBg: {
    height: 4,
    borderRadius: 2,
    width: "100%",
    marginTop: 6,
    overflow: "hidden",
  },
  goalProgressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalBottomSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.4)",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },
  pickerItem: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
});

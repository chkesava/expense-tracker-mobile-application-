import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Switch, ScrollView, Modal, FlatList, TextInput } from "react-native";
import { Trash2, Plus, ChevronDown, ChevronUp, FolderPlus, HelpCircle } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { isCreditAccount } from "@/shared/utils/accountKind";
import { Amount } from "@/components/common/Amount";

// -------------------------------------------------------------
// Helper Component: Collapsible Section
// -------------------------------------------------------------
function CollapsibleSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      title={title}
      subtitle={subtitle}
      headerRight={
        <Pressable onPress={() => setExpanded(!expanded)} style={{ padding: 4 }}>
          {expanded ? (
            <ChevronUp size={20} color={theme.colors.foreground} />
          ) : (
            <ChevronDown size={20} color={theme.colors.foreground} />
          )}
        </Pressable>
      }
    >
      {expanded ? <View style={{ marginTop: theme.space.md, gap: theme.space.md }}>{children}</View> : null}
    </Card>
  );
}

// -------------------------------------------------------------
// 1. Dashboard Widget Toggles (Personalization)
// -------------------------------------------------------------
const WIDGET_DEFS = [
  { id: "subscriptions", label: "Subscriptions", desc: "Recurring payments" },
  { id: "focus", label: "Focus Mode", desc: "Goals & limits" },
  { id: "gamification", label: "Gamification", desc: "Streaks & XP" },
  { id: "topCategories", label: "Top Categories", desc: "Rank by spend" },
] as const;

export function DashboardWidgetToggles() {
  const { theme } = useTheme();
  const { settings, updateSettings } = useSettings();

  const toggleWidget = (id: keyof typeof settings.dashboardWidgets) => {
    const current = settings.dashboardWidgets || {};
    const updated = {
      ...current,
      [id]: !(current[id] ?? true),
    };
    void updateSettings({ dashboardWidgets: updated });
  };

  return (
    <View style={{ gap: theme.space.sm }}>
      <Text style={{ color: theme.colors.foreground, fontWeight: "bold", fontSize: 15 }}>
        Dashboard widgets
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
        Hide widgets you don’t use.
      </Text>
      <View style={{ gap: theme.space.xs, marginTop: theme.space.xs }}>
        {WIDGET_DEFS.map((widget) => {
          const checked = settings.dashboardWidgets?.[widget.id] ?? true;
          return (
            <View
              key={widget.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: theme.space.sm,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <View style={{ flex: 1, marginRight: theme.space.md }}>
                <Text style={{ color: theme.colors.foreground, fontWeight: "600", fontSize: 14 }}>
                  {widget.label}
                </Text>
                <Text style={{ color: theme.colors.mutedForeground, fontSize: 11 }}>
                  {widget.desc}
                </Text>
              </View>
              <Switch
                value={checked}
                onValueChange={() => toggleWidget(widget.id as any)}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>
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
  const { theme } = useTheme();
  const { rules, addRule, deleteRule } = useCategorizationRules();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("Food & Dining");
  const [subcategory, setSubcategory] = useState("Groceries");

  const handleAdd = () => {
    if (!keyword.trim() || !category) return;
    void addRule(keyword.trim(), category, subcategory);
    setKeyword("");
  };

  return (
    <CollapsibleSection title="Auto-categorization Rules" subtitle={`Manage keywords (${rules.length} rules)`}>
      <View style={{ gap: theme.space.md, paddingBottom: theme.space.sm }}>
        <Input
          label="Keyword"
          placeholder='e.g. "netflix" or "uber"'
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
          label="Assign Category & Subcategory"
        />

        <Button onPress={handleAdd} disabled={!keyword.trim() || !category}>
          Add rule
        </Button>

        <View style={{ gap: theme.space.xs, marginTop: theme.space.md }}>
          {rules.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
              No rules yet. Keyword matches note text automatically.
            </Text>
          ) : (
            rules.map((rule) => (
              <View
                key={rule.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: theme.radius.md,
                  padding: theme.space.md,
                }}
              >
                <View style={{ flex: 1, marginRight: theme.space.md }}>
                  <Text style={{ color: theme.colors.foreground, fontWeight: "bold" }}>
                    "{rule.keyword}"
                  </Text>
                  <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                    → {rule.category} {rule.subcategory ? `· ${rule.subcategory}` : ""}
                  </Text>
                </View>
                <Pressable onPress={() => rule.id && deleteRule(rule.id)} style={{ padding: 6 }}>
                  <Trash2 size={16} color={theme.colors.destructive} />
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
  const { theme } = useTheme();
  const { budgets, addBudget, deleteBudget } = useCategoryBudgets();
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
    void addBudget(category, amt, month, subcategory);
    setAmount("");
  };

  return (
    <CollapsibleSection title="Category Budgets" subtitle={`Monthly limit alerts (${budgets.length} budgets)`}>
      <View style={{ gap: theme.space.md, paddingBottom: theme.space.sm }}>
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
          placeholder="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />

        <Button onPress={handleAdd} disabled={!category || !month || !amount}>
          Add budget
        </Button>

        <View style={{ gap: theme.space.xs, marginTop: theme.space.md }}>
          {budgets.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
              No category budgets set yet.
            </Text>
          ) : (
            budgets.map((b) => (
              <View
                key={b.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: theme.radius.md,
                  padding: theme.space.md,
                }}
              >
                <View style={{ flex: 1, marginRight: theme.space.md }}>
                  <Text style={{ color: theme.colors.foreground, fontWeight: "bold" }}>
                    {b.category} {b.subcategory ? `› ${b.subcategory}` : ""}
                  </Text>
                  <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                    {b.month} · <Amount value={b.amount} />
                  </Text>
                </View>
                <Pressable onPress={() => b.id && deleteBudget(b.id)} style={{ padding: 6 }}>
                  <Trash2 size={16} color={theme.colors.destructive} />
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
  const { theme } = useTheme();
  const { goals, addGoal, deleteGoal } = useFinancialGoals();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [deadline, setDeadline] = useState("");

  const handleAdd = () => {
    const tgt = Number(target);
    const cur = Number(current);
    if (!name.trim() || isNaN(tgt) || tgt <= 0) return;
    void addGoal(name.trim(), tgt, cur, deadline);
    setName("");
    setTarget("");
    setCurrent("");
    setDeadline("");
  };

  return (
    <CollapsibleSection title="Financial Goals" subtitle={`Track savings targets (${goals.length} goals)`}>
      <View style={{ gap: theme.space.md, paddingBottom: theme.space.sm }}>
        <Input
          label="Goal Name"
          placeholder="e.g. Emergency Fund"
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
          placeholder="e.g. 10000 (starting)"
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

        <Button onPress={handleAdd} disabled={!name.trim() || !target}>
          Add goal
        </Button>

        <View style={{ gap: theme.space.xs, marginTop: theme.space.md }}>
          {goals.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
              No financial goals set.
            </Text>
          ) : (
            goals.map((g) => (
              <View
                key={g.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: theme.radius.md,
                  padding: theme.space.md,
                }}
              >
                <View style={{ flex: 1, marginRight: theme.space.md }}>
                  <Text style={{ color: theme.colors.foreground, fontWeight: "bold" }}>
                    {g.name}
                  </Text>
                  <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                    Progress: <Amount value={g.currentAmount} /> / <Amount value={g.targetAmount} />
                    {g.deadline ? ` · By ${g.deadline}` : ""}
                  </Text>
                </View>
                <Pressable onPress={() => g.id && deleteGoal(g.id)} style={{ padding: 6 }}>
                  <Trash2 size={16} color={theme.colors.destructive} />
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
// 5. Account Types (Accounts)
// -------------------------------------------------------------
export function AccountTypesManager() {
  const { theme } = useTheme();
  const { accountTypes, addAccountType, deleteAccountType } = useAccountTypes();
  const [newType, setNewType] = useState("");

  const handleAdd = () => {
    if (!newType.trim()) return;
    void addAccountType(newType.trim());
    setNewType("");
  };

  return (
    <CollapsibleSection title="Account Types" subtitle={`Define types (${accountTypes.length} types)`}>
      <View style={{ gap: theme.space.md, paddingBottom: theme.space.sm }}>
        <View style={{ flexDirection: "row", gap: theme.space.sm, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Input
              label="New Type"
              placeholder="e.g. Bank, Card, Cash"
              value={newType}
              onChangeText={setNewType}
            />
          </View>
          <Button onPress={handleAdd} disabled={!newType.trim()} style={{ height: 46 }}>
            Add
          </Button>
        </View>

        <View style={{ gap: theme.space.xs, marginTop: theme.space.md }}>
          {accountTypes.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
              No custom account types.
            </Text>
          ) : (
            accountTypes.map((t) => (
              <View
                key={t.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: theme.radius.md,
                  padding: theme.space.md,
                }}
              >
                <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
                  {t.name}
                </Text>
                <Pressable onPress={() => t.id && deleteAccountType(t.id)} style={{ padding: 6 }}>
                  <Trash2 size={16} color={theme.colors.destructive} />
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
  const { theme } = useTheme();
  const { accounts, addAccount, deleteAccount } = useAccounts();
  const { accountTypes } = useAccountTypes();

  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [billGenerationDay, setBillGenerationDay] = useState("");

  const [showTypePicker, setShowTypePicker] = useState(false);

  const selectedTypeName = useMemo(() => {
    const match = accountTypes.find((t) => t.id === typeId);
    return match ? match.name : "";
  }, [accountTypes, typeId]);

  const isCredit = useMemo(() => {
    return isCreditAccount(selectedTypeName);
  }, [selectedTypeName]);

  const handleAdd = () => {
    if (!name.trim() || !typeId) return;
    
    const extras: any = {};
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

    void addAccount(name.trim(), typeId, extras);
    
    // Reset Form
    setName("");
    setTypeId("");
    setOpeningBalance("");
    setCreditLimit("");
    setBillGenerationDay("");
  };

  return (
    <CollapsibleSection title="Accounts" subtitle={`Configure accounts (${accounts.length} active)`}>
      <View style={{ gap: theme.space.md, paddingBottom: theme.space.sm }}>
        <Input
          label="Account Name"
          placeholder="e.g. Chase Checkings"
          value={name}
          onChangeText={setName}
        />

        <Pressable onPress={() => setShowTypePicker(true)}>
          <Input
            label="Account Type"
            value={selectedTypeName || "Select type..."}
            editable={false}
            pointerEvents="none"
          />
        </Pressable>

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
              placeholder="e.g. 10000"
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

        <Button onPress={handleAdd} disabled={!name.trim() || !typeId}>
          Add Account
        </Button>

        <View style={{ gap: theme.space.xs, marginTop: theme.space.md }}>
          {accounts.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
              No custom accounts added.
            </Text>
          ) : (
            accounts.map((acc) => {
              const typeName = accountTypes.find((t) => t.id === acc.typeId)?.name || "Unknown";
              return (
                <View
                  key={acc.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                    borderWidth: 1,
                    borderRadius: theme.radius.md,
                    padding: theme.space.md,
                  }}
                >
                  <View style={{ flex: 1, marginRight: theme.space.md }}>
                    <Text style={{ color: theme.colors.foreground, fontWeight: "bold" }}>
                      {acc.name}
                    </Text>
                    <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                      Type: {typeName} {acc.creditLimit ? `· Limit: ${acc.creditLimit}` : ""}
                    </Text>
                  </View>
                  <Pressable onPress={() => acc.id && deleteAccount(acc.id)} style={{ padding: 6 }}>
                    <Trash2 size={16} color={theme.colors.destructive} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {/* Modal Type Selector */}
        <Modal visible={showTypePicker} transparent animationType="fade">
          <Pressable style={styles.modalBg} onPress={() => setShowTypePicker(false)}>
            <View style={[styles.modalContent, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.foreground }]}>Select Account Type</Text>
              <ScrollView style={{ maxHeight: 300 }}>
                {accountTypes.length === 0 ? (
                  <Text style={{ color: theme.colors.mutedForeground, padding: 16, textAlign: "center" }}>
                    No custom types defined yet. Add type first above.
                  </Text>
                ) : (
                  accountTypes.map((type) => (
                    <Pressable
                      key={type.id}
                      onPress={() => {
                        setTypeId(type.id);
                        setShowTypePicker(false);
                      }}
                      style={({ pressed }) => [
                        styles.pickerItem,
                        {
                          borderBottomColor: theme.colors.border,
                          backgroundColor: pressed ? theme.colors.muted : "transparent",
                        },
                      ]}
                    >
                      <Text style={{ color: theme.colors.foreground, fontSize: 16 }}>{type.name}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
              <Button onPress={() => setShowTypePicker(false)} variant="outline" style={{ marginTop: 8 }}>
                Cancel
              </Button>
            </View>
          </Pressable>
        </Modal>
      </View>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  pickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
});

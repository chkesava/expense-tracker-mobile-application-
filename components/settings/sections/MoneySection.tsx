import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { X } from "lucide-react-native";

import { CategoryManager } from "@/components/categories/CategoryManager";
import { SettingsPanel } from "@/components/settings/SettingsControls";
import {
  CategoryBudgetsManager,
  FinancialGoalsManager,
} from "@/components/settings/SettingsSubmenus";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  formatMonthlyBudgetInput,
  parseMonthlyBudgetInput,
} from "@/shared/types/settings";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

export function MoneySection() {
  const { theme } = useTheme();
  const { settings, updateSettings } = useSettings();
  const { celebrateMilestone } = useCelebration();
  const [budgetText, setBudgetText] = useState(() =>
    formatMonthlyBudgetInput(settings.monthlyBudget)
  );
  const [budgetFocused, setBudgetFocused] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState(false);

  const budgetTextRef = useRef(budgetText);
  budgetTextRef.current = budgetText;
  const cloudBudgetRef = useRef(settings.monthlyBudget);
  cloudBudgetRef.current = settings.monthlyBudget;

  useEffect(() => {
    if (budgetFocused) return;
    setBudgetText(formatMonthlyBudgetInput(settings.monthlyBudget));
  }, [budgetFocused, settings.monthlyBudget]);

  const persistBudget = useCallback(
    async (amount: number, options?: { notify?: boolean }) => {
      if (amount === cloudBudgetRef.current) return true;
      const hadBudget = cloudBudgetRef.current > 0;
      await updateSettings({ monthlyBudget: amount });
      if (amount > 0 && !hadBudget) {
        celebrateMilestone("milestone_first_budget", {
          title: "First Budget Set!",
          subtitle: "Setting limits is the secret to financial freedom.",
          badgeEmoji: "🎯",
          pointsEarned: 25,
        });
      }
      if (options?.notify) {
        toast.success(
          amount > 0
            ? `Monthly budget saved · ${formatAmount(amount, settings.currency, {
                numberFormatStyle: settings.numberFormat,
              })}`
            : "Monthly budget cleared"
        );
      }
      return true;
    },
    [celebrateMilestone, settings.currency, settings.numberFormat, updateSettings]
  );

  const flushBudget = useCallback(
    async (options?: { notify?: boolean; allowClear?: boolean }) => {
      const parsed = parseMonthlyBudgetInput(budgetTextRef.current);
      if (parsed === null) {
        if (options?.allowClear && budgetTextRef.current.trim() === "") {
          await persistBudget(0, options);
          return true;
        }
        return false;
      }
      await persistBudget(parsed, options);
      return true;
    },
    [persistBudget]
  );

  useEffect(() => {
    const parsed = parseMonthlyBudgetInput(budgetText);
    if (parsed === null || parsed === settings.monthlyBudget) return;
    const timer = setTimeout(() => {
      void persistBudget(parsed);
    }, 500);
    return () => clearTimeout(timer);
  }, [budgetText, persistBudget, settings.monthlyBudget]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        void flushBudget();
      };
    }, [flushBudget])
  );

  const onSaveBudget = async () => {
    setSavingBudget(true);
    try {
      const ok = await flushBudget({ notify: true, allowClear: true });
      if (!ok) toast.error("Enter a valid monthly budget amount");
    } finally {
      setSavingBudget(false);
    }
  };

  const savedLabel =
    settings.monthlyBudget > 0
      ? `Saved in your account: ${formatAmount(settings.monthlyBudget, settings.currency, {
          numberFormatStyle: settings.numberFormat,
        })}`
      : "No monthly budget saved in your account yet";

  return (
    <View style={{ gap: 16 }}>
      <SettingsPanel title="Monthly budget" subtitle="Used for Home pacing and alerts">
        <Input
          label="Monthly budget"
          value={budgetText}
          onChangeText={setBudgetText}
          keyboardType="numeric"
          placeholder="e.g. 30000"
          helperText={savedLabel}
          onFocus={() => setBudgetFocused(true)}
          onBlur={() => {
            setBudgetFocused(false);
            void flushBudget();
          }}
        />
        <Button loading={savingBudget} onPress={() => void onSaveBudget()}>
          Save monthly budget
        </Button>
      </SettingsPanel>

      <SettingsPanel
        title="Categories & taxonomy"
        subtitle="Hierarchy, colors, emojis & merge"
      >
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            lineHeight: 18,
          }}
        >
          Customize expense categories, add subcategories, set favorites, or merge
          categories with automatic historical rewrites.
        </Text>
        <Button variant="outline" onPress={() => setShowCategoryManagerModal(true)}>
          Open Category Manager
        </Button>
      </SettingsPanel>

      <CategoryBudgetsManager />
      <FinancialGoalsManager />

      <Modal
        visible={showCategoryManagerModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCategoryManagerModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            paddingTop: 16,
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: theme.colors.foreground,
              }}
            >
              Categories & Taxonomy
            </Text>
            <Pressable
              onPress={() => setShowCategoryManagerModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Close category manager"
              style={{
                padding: 8,
                borderRadius: 20,
                backgroundColor: theme.colors.muted,
              }}
            >
              <X size={18} color={theme.colors.foreground} />
            </Pressable>
          </View>
          <CategoryManager />
        </View>
      </Modal>
    </View>
  );
}

import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";

import { CategoryManager } from "@/components/categories/CategoryManager";
import { SettingsPanel } from "@/components/settings/SettingsControls";
import {
  CategoryBudgetsManager,
  FinancialGoalsManager,
} from "@/components/settings/SettingsSubmenus";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

export function MoneySection() {
  const { theme } = useTheme();
  const { settings, setMonthlyBudget } = useSettings();
  const { celebrateMilestone } = useCelebration();
  const [budgetText, setBudgetText] = useState(String(settings.monthlyBudget || 0));
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState(false);

  useEffect(() => {
    setBudgetText(String(settings.monthlyBudget || 0));
  }, [settings.monthlyBudget]);

  return (
    <View style={{ gap: 16 }}>
      <SettingsPanel title="Monthly budget" subtitle="Used for Home pacing and alerts">
        <Input
          label="Monthly budget"
          value={budgetText}
          onChangeText={setBudgetText}
          keyboardType="numeric"
          onBlur={() => {
            const n = Number(budgetText);
            const validAmount = Number.isFinite(n) ? Math.max(0, n) : 0;
            setMonthlyBudget(validAmount);
            if (validAmount > 0) {
              celebrateMilestone("milestone_first_budget", {
                title: "First Budget Set!",
                subtitle: "Setting limits is the secret to financial freedom.",
                badgeEmoji: "🎯",
                pointsEarned: 25,
              });
            }
          }}
        />
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

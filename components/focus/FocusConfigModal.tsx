import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Compass,
  Flame,
  Layers,
  Sparkles,
  Target,
  X,
} from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCategories } from "@/hooks/useCategories";
import { toast } from "@/lib/toast";
import { FOCUS_DURATIONS } from "@/shared/types/focus";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface FocusConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onStart: (params: {
    category: string;
    dailyLimit: number;
    durationDays: number;
  }) => Promise<boolean>;
}

export function FocusConfigModal({
  visible,
  onClose,
  onStart,
}: FocusConfigModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { categories } = useCategories();
  const displayCurrency = useDisplayCurrency();

  const [selectedDuration, setSelectedDuration] = useState<number>(7);
  const [selectedCategory, setSelectedCategory] = useState<string>("Dining & Drinks");
  const [dailyLimit, setDailyLimit] = useState<string>("500");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStart = async () => {
    const limit = Number(dailyLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      toast.error("Please enter a valid daily budget limit");
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await onStart({
        category: selectedCategory,
        dailyLimit: limit,
        durationDays: selectedDuration,
      });
      if (ok) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryOptions = [
    "All Spending",
    "Dining & Drinks",
    "Shopping & Lifestyle",
    "Entertainment",
    "Groceries",
    "Coffee & Snacks",
    ...categories
      .map((c: { name: string }) => c.name)
      .filter(
        (n: string) =>
          ![
            "Dining & Drinks",
            "Shopping & Lifestyle",
            "Entertainment",
            "Groceries",
          ].includes(n)
      ),
  ].slice(0, 8);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: "rgba(99, 102, 241, 0.15)" },
                ]}
              >
                <Compass size={20} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.colors.foreground }]}>
                  Start Focus Sprint
                </Text>
                <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
                  Targeted spending discipline challenge
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Sprint Duration */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
                Sprint Duration
              </Text>
              <View style={styles.pillsRow}>
                {FOCUS_DURATIONS.map((days) => {
                  const isSelected = selectedDuration === days;
                  return (
                    <Pressable
                      key={days}
                      onPress={() => {
                        haptic.selection().catch(() => undefined);
                        setSelectedDuration(days);
                      }}
                      style={[
                        styles.durationPill,
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
                          styles.pillText,
                          {
                            color: isSelected
                              ? "#FFFFFF"
                              : theme.colors.foreground,
                            fontWeight: isSelected ? "800" : "600",
                          },
                        ]}
                      >
                        {days} Days {days === 7 ? "🔥" : days === 30 ? "🏆" : "⚡"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Target Category */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
                Target Category Focus
              </Text>
              <View style={styles.categoryGrid}>
                {categoryOptions.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => {
                        haptic.selection().catch(() => undefined);
                        setSelectedCategory(cat);
                      }}
                      style={[
                        styles.categoryPill,
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
                        style={{
                          fontSize: 12,
                          color: isSelected
                            ? "#FFFFFF"
                            : theme.colors.foreground,
                          fontWeight: isSelected ? "700" : "500",
                        }}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Daily Limit */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
                Daily Spend Limit ({displayCurrency})
              </Text>
              <Input
                value={dailyLimit}
                onChangeText={setDailyLimit}
                placeholder="e.g. 500"
                keyboardType="numeric"
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Button
              onPress={handleStart}
              loading={isSubmitting}
              style={{ flex: 1 }}
            >
              <Flame size={18} color="#FFFFFF" />
              <Text style={{ marginLeft: 8, fontWeight: "800", color: "#FFFFFF" }}>
                Start {selectedDuration}-Day Challenge
              </Text>
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    maxHeight: "85%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 20,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  pillsRow: {
    flexDirection: "row",
    gap: 8,
  },
  durationPill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
  },
});

import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { RotateCcw, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useAccounts } from "@/hooks/useAccounts";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type DatePreset = "all" | "this_month" | "last_30_days" | "this_year";

export interface LabFilters {
  query: string;
  type: "all" | "expense" | "income";
  datePreset: DatePreset;
  categories: string[];
  accountIds: string[];
  minAmount: string;
  maxAmount: string;
}

export interface FilterSheetModalProps {
  visible: boolean;
  onClose: () => void;
  filters: LabFilters;
  onApply: (filters: LabFilters) => void;
  availableCategories: string[];
}

export function FilterSheetModal({
  visible,
  onClose,
  filters,
  onApply,
  availableCategories,
}: FilterSheetModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { accounts } = useAccounts();

  const [draft, setDraft] = React.useState<LabFilters>(filters);

  React.useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const toggleCategory = (cat: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    setDraft((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
  };

  const toggleAccount = (accId: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    setDraft((prev) => ({
      ...prev,
      accountIds: prev.accountIds.includes(accId)
        ? prev.accountIds.filter((id) => id !== accId)
        : [...prev.accountIds, accId],
    }));
  };

  const handleReset = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    setDraft({
      query: "",
      type: "all",
      datePreset: "all",
      categories: [],
      accountIds: [],
      minAmount: "",
      maxAmount: "",
    });
  };

  const handleSave = () => {
    Haptics.selectionAsync().catch(() => undefined);
    onApply(draft);
    onClose();
  };

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
            <View>
              <Text style={[styles.title, { color: theme.colors.foreground }]}>
                Filter Transactions
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
                Refine discovery with multi-faceted criteria
              </Text>
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
            {/* Transaction Type */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
                TRANSACTION TYPE
              </Text>
              <View style={styles.chipRow}>
                {(["all", "expense", "income"] as const).map((t) => {
                  const isSelected = draft.type === t;
                  const label = t === "all" ? "All Types" : t === "expense" ? "Expenses" : "Incomes";
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setDraft((p) => ({ ...p, type: t }));
                      }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected
                            ? theme.colors.primary
                            : isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: isSelected ? "#FFFFFF" : theme.colors.foreground,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Date Range Preset */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
                DATE RANGE
              </Text>
              <View style={styles.chipRow}>
                {(
                  [
                    { id: "all", label: "All Time" },
                    { id: "this_month", label: "This Month" },
                    { id: "last_30_days", label: "Last 30 Days" },
                    { id: "this_year", label: "This Year" },
                  ] as const
                ).map((dp) => {
                  const isSelected = draft.datePreset === dp.id;
                  return (
                    <Pressable
                      key={dp.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setDraft((p) => ({ ...p, datePreset: dp.id }));
                      }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected
                            ? theme.colors.primary
                            : isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: isSelected ? "#FFFFFF" : theme.colors.foreground,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {dp.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Amount Range */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
                AMOUNT RANGE
              </Text>
              <View style={styles.amountInputsRow}>
                <View style={styles.amountInputCol}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Min Amount
                  </Text>
                  <TextInput
                    value={draft.minAmount}
                    onChangeText={(t) => setDraft((p) => ({ ...p, minAmount: t }))}
                    placeholder="0"
                    placeholderTextColor={theme.colors.mutedForeground}
                    keyboardType="numeric"
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                </View>

                <View style={styles.amountInputCol}>
                  <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
                    Max Amount
                  </Text>
                  <TextInput
                    value={draft.maxAmount}
                    onChangeText={(t) => setDraft((p) => ({ ...p, maxAmount: t }))}
                    placeholder="No limit"
                    placeholderTextColor={theme.colors.mutedForeground}
                    keyboardType="numeric"
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* Categories */}
            {availableCategories.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
                  CATEGORIES ({draft.categories.length ? draft.categories.length : "All"})
                </Text>
                <View style={styles.chipRow}>
                  {availableCategories.map((cat) => {
                    const isSelected = draft.categories.includes(cat);
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => toggleCategory(cat)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected
                              ? theme.colors.primary
                              : isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)",
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            {
                              color: isSelected ? "#FFFFFF" : theme.colors.foreground,
                              fontWeight: isSelected ? "700" : "500",
                            },
                          ]}
                        >
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Accounts */}
            {accounts.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
                  ACCOUNTS ({draft.accountIds.length ? draft.accountIds.length : "All"})
                </Text>
                <View style={styles.chipRow}>
                  {accounts.map((acc) => {
                    const isSelected = draft.accountIds.includes(acc.id);
                    return (
                      <Pressable
                        key={acc.id}
                        onPress={() => toggleAccount(acc.id)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected
                              ? theme.colors.primary
                              : isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)",
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            {
                              color: isSelected ? "#FFFFFF" : theme.colors.foreground,
                              fontWeight: isSelected ? "700" : "500",
                            },
                          ]}
                        >
                          {acc.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Button variant="outline" onPress={handleReset} style={{ flex: 1 }}>
              <RotateCcw size={16} color={theme.colors.foreground} />
              <Text style={{ marginLeft: 6, fontWeight: "700", color: theme.colors.foreground }}>
                Reset
              </Text>
            </Button>

            <Button onPress={handleSave} style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", color: "#FFFFFF" }}>Apply Filters</Text>
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
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
  },
  section: {
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
  },
  amountInputsRow: {
    flexDirection: "row",
    gap: 12,
  },
  amountInputCol: {
    flex: 1,
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

import React, { useState } from "react";
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
import { Check, Plus, Shield, Users, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { SharedVault } from "@/shared/types/vault";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface CreateVaultModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (vault: {
    name: string;
    description?: string;
    budget: number;
    currency: string;
    themeColor: string;
  }) => Promise<any>;
}

const THEME_COLORS = [
  "#6366F1", // Indigo
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
  "#F97316", // Orange
];

export function CreateVaultModal({
  visible,
  onClose,
  onSubmit,
}: CreateVaultModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [themeColor, setThemeColor] = useState(THEME_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Vault name is required");
      return;
    }

    const numBudget = Number(budget) || 0;
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        budget: numBudget,
        currency: system.defaultCurrency,
        themeColor,
      });
      setName("");
      setDescription("");
      setBudget("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
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
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: `${themeColor}20` },
                ]}
              >
                <Users size={20} color={themeColor} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.colors.foreground }]}>
                  Create Shared Vault
                </Text>
                <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
                  Group space for joint budgets and expenses
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Vault Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Vault Name *
              </Text>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="e.g. Apartment Expenses, Japan Trip"
                autoFocus
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Description
              </Text>
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder="Optional notes or purpose..."
              />
            </View>

            {/* Target Budget */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Monthly Budget Limit ({system.defaultCurrency})
              </Text>
              <Input
                value={budget}
                onChangeText={setBudget}
                placeholder="e.g. 25000"
                keyboardType="numeric"
              />
            </View>

            {/* Theme Color Selector */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Accent Color
              </Text>
              <View style={styles.colorsRow}>
                {THEME_COLORS.map((c) => {
                  const isSelected = themeColor === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setThemeColor(c);
                      }}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: c },
                        isSelected && styles.colorCircleSelected,
                      ]}
                    >
                      {isSelected && <Check size={14} color="#FFFFFF" />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Button
              onPress={handleSave}
              loading={isSubmitting}
              disabled={!name.trim() || isSubmitting}
              style={{ flex: 1 }}
            >
              <Text style={{ fontWeight: "800", color: "#FFFFFF" }}>
                Create Vault
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
    alignItems: "flex-start",
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
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  colorsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  colorCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
});

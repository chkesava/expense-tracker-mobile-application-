import React, { useMemo, useState } from "react";
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
import {
  ArrowRight,
  Check,
  CreditCard,
  FolderTree,
  Sparkles,
  Tag,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  parseNaturalLanguageTransaction,
  type ParsedTransaction,
} from "@/shared/utils/magicParser";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface MagicChatModalProps {
  visible: boolean;
  onClose: () => void;
  onApplyParsed: (parsed: ParsedTransaction) => void;
}

const SAMPLE_PROMPTS = [
  "Spent 450 on groceries yesterday with HDFC",
  "Coffee and snacks at Starbucks 220 rs cash",
  "50k salary received today in SBI",
  "Electricity bill 1850 paid via HDFC",
  "Uber ride to office 340",
];

export function MagicChatModal({
  visible,
  onClose,
  onApplyParsed,
}: MagicChatModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { accounts } = useAccounts();
  const { rules } = useCategorizationRules();

  const [input, setInput] = useState("");

  const parsed = useMemo(() => {
    if (!input.trim()) return null;
    return parseNaturalLanguageTransaction(input, {
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      rules,
      defaultCurrency: system.defaultCurrency,
    });
  }, [input, accounts, rules, system.defaultCurrency]);

  const handleApply = () => {
    if (!parsed) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined
    );
    onApplyParsed(parsed);
    setInput("");
    onClose();
  };

  const handleSelectSample = (sample: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    setInput(sample);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
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
                  {
                    backgroundColor: isDark
                      ? "rgba(99,102,241,0.2)"
                      : "rgba(99,102,241,0.1)",
                  },
                ]}
              >
                <Sparkles size={20} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.colors.foreground }]}>
                  Magic Natural Language
                </Text>
                <Text
                  style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
                >
                  Type or paste phrases to auto-fill transactions
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
            {/* Input Box */}
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.03)",
                  borderColor: parsed?.amount
                    ? theme.colors.primary
                    : theme.colors.border,
                },
              ]}
            >
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="e.g. Spent 350 for lunch with friends yesterday HDFC..."
                placeholderTextColor={theme.colors.mutedForeground}
                multiline
                numberOfLines={3}
                style={[styles.textInput, { color: theme.colors.foreground }]}
                autoFocus
              />
            </View>

            {/* Quick Sample Prompts */}
            <View style={styles.samplesSection}>
              <Text
                style={[
                  styles.samplesTitle,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                TRY THESE EXAMPLES
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.samplesScroll}
              >
                {SAMPLE_PROMPTS.map((sample, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => handleSelectSample(sample)}
                    style={({ pressed }) => [
                      styles.sampleChip,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
                        borderColor: theme.colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sampleChipText,
                        { color: theme.colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {sample}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Live Parsing Preview Card */}
            {parsed && (
              <Card style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <Text
                    style={[
                      styles.previewLabel,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    PARSED PREVIEW
                  </Text>
                  <View
                    style={[
                      styles.confidenceBadge,
                      {
                        backgroundColor:
                          parsed.confidence >= 0.7
                            ? "rgba(34,197,94,0.15)"
                            : "rgba(245,158,11,0.15)",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: parsed.confidence >= 0.7 ? "#22C55E" : "#F59E0B",
                      }}
                    >
                      {Math.round(parsed.confidence * 100)}% Confidence
                    </Text>
                  </View>
                </View>

                {/* Extracted Details Grid */}
                <View style={styles.detailsGrid}>
                  <View style={styles.detailRow}>
                    <Text
                      style={[
                        styles.detailKey,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      Type & Amount
                    </Text>
                    <View style={styles.detailValueRow}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color:
                            parsed.type === "expense"
                              ? theme.colors.destructive
                              : theme.colors.success,
                          textTransform: "uppercase",
                        }}
                      >
                        {parsed.type} •
                      </Text>
                      {parsed.amount ? (
                        <Amount
                          value={parsed.amount}
                          currency={system.defaultCurrency}
                          style={{
                            fontSize: 16,
                            fontWeight: "900",
                            color: theme.colors.foreground,
                          }}
                        />
                      ) : (
                        <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                          Amount not detected
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <Text
                      style={[
                        styles.detailKey,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      Category
                    </Text>
                    <Text
                      style={[
                        styles.detailVal,
                        { color: theme.colors.foreground },
                      ]}
                    >
                      {parsed.category || "General"}
                      {parsed.subcategory ? ` › ${parsed.subcategory}` : ""}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text
                      style={[
                        styles.detailKey,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      Date
                    </Text>
                    <Text
                      style={[
                        styles.detailVal,
                        { color: theme.colors.foreground },
                      ]}
                    >
                      {parsed.date}
                    </Text>
                  </View>

                  {parsed.accountName && (
                    <View style={styles.detailRow}>
                      <Text
                        style={[
                          styles.detailKey,
                          { color: theme.colors.mutedForeground },
                        ]}
                      >
                        Account
                      </Text>
                      <Text
                        style={[
                          styles.detailVal,
                          { color: theme.colors.primary, fontWeight: "700" },
                        ]}
                      >
                        {parsed.accountName}
                      </Text>
                    </View>
                  )}

                  {parsed.note && (
                    <View style={styles.detailRow}>
                      <Text
                        style={[
                          styles.detailKey,
                          { color: theme.colors.mutedForeground },
                        ]}
                      >
                        Note
                      </Text>
                      <Text
                        style={[
                          styles.detailVal,
                          { color: theme.colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {parsed.note}
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            )}
          </ScrollView>

          {/* Footer Action */}
          <View
            style={[
              styles.footer,
              { borderTopColor: theme.colors.border },
            ]}
          >
            <Button
              onPress={handleApply}
              disabled={!parsed || !parsed.amount}
              style={{ flex: 1 }}
            >
              <Check size={18} color="#FFFFFF" />
              <Text style={{ marginLeft: 8, fontWeight: "800", color: "#FFFFFF" }}>
                Auto-Fill Form
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
  },
  inputWrapper: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 14,
  },
  textInput: {
    fontSize: 15,
    minHeight: 64,
    textAlignVertical: "top",
  },
  samplesSection: {
    gap: 8,
    marginBottom: 16,
  },
  samplesTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  samplesScroll: {
    flexDirection: "row",
    gap: 8,
  },
  sampleChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 260,
  },
  sampleChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  previewCard: {
    padding: 14,
    borderRadius: 16,
    gap: 10,
    marginBottom: 16,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  detailsGrid: {
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailKey: {
    fontSize: 12,
    fontWeight: "500",
  },
  detailValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailVal: {
    fontSize: 13,
    fontWeight: "700",
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

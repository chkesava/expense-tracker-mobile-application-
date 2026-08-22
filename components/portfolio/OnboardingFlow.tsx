import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Rocket, Wallet, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import type { PortfolioSettings } from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

export interface OnboardingFlowProps {
  visible: boolean;
  currency: string;
  onComplete: (settings: Partial<PortfolioSettings>) => Promise<void>;
}

export function OnboardingFlow({
  visible,
  currency,
  onComplete,
}: OnboardingFlowProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const [cashAmount, setCashAmount] = useState("100000");
  const [hasExisting, setHasExisting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = async () => {
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setIsSubmitting(true);
    try {
      await onComplete({
        initialInvestmentAmount: amount,
        cashBalance: amount,
        hasExistingHoldings: hasExisting,
        onboardingComplete: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: "rgba(99, 102, 241, 0.15)" },
                ]}
              >
                <Rocket size={28} color={theme.colors.primary} />
              </View>
              <Text style={[styles.title, { color: theme.colors.foreground }]}>
                Welcome to Virtual Brokerage
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                Set up your virtual portfolio to track stocks, mutual funds, and
                crypto with mock buy/sell orders.
              </Text>
            </View>

            {/* Step 1: Cash Amount */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Wallet size={16} color={theme.colors.primary} />
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: theme.colors.foreground },
                  ]}
                >
                  Starting Virtual Cash ({currency})
                </Text>
              </View>
              <Text
                style={[
                  styles.sectionHint,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                This is your virtual trading capital. You can change it later.
              </Text>
              <Input
                value={cashAmount}
                onChangeText={setCashAmount}
                placeholder="e.g. 100000"
                keyboardType="numeric"
              />
            </View>

            {/* Step 2: Existing Holdings */}
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: theme.colors.foreground },
                ]}
              >
                Do you have existing holdings to import?
              </Text>
              <View style={styles.toggleRow}>
                {[
                  { label: "Start Fresh", value: false },
                  { label: "I Have Holdings", value: true },
                ].map((opt) => (
                  <Pressable
                    key={String(opt.value)}
                    onPress={() => {
                      haptic.selection().catch(() => undefined);
                      setHasExisting(opt.value);
                    }}
                    style={[
                      styles.togglePill,
                      {
                        backgroundColor:
                          hasExisting === opt.value
                            ? theme.colors.primary
                            : isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                        borderColor:
                          hasExisting === opt.value
                            ? theme.colors.primary
                            : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight:
                          hasExisting === opt.value ? "800" : "600",
                        color:
                          hasExisting === opt.value
                            ? "#FFFFFF"
                            : theme.colors.foreground,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* CTA */}
          <View
            style={[styles.footer, { borderTopColor: theme.colors.border }]}
          >
            <Button
              onPress={handleComplete}
              loading={isSubmitting}
              style={{ flex: 1 }}
            >
              <Rocket size={18} color="#FFFFFF" />
              <Text
                style={{ marginLeft: 8, fontWeight: "800", color: "#FFFFFF" }}
              >
                Launch Portfolio 🚀
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
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  section: {
    gap: 8,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  togglePill: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  footer: {
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

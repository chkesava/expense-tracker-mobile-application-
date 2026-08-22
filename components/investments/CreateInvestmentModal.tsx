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
import {
  Banknote,
  Landmark,
  Plus,
  TrendingUp,
  X,
} from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";
import type {
  InterestCreditFrequency,
  InterestMethod,
  Investment,
  InvestmentKind,
} from "@/shared/types/investment";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface CreateInvestmentModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (investment: Omit<Investment, "id">) => Promise<any>;
}

export function CreateInvestmentModal({
  visible,
  onClose,
  onSubmit,
}: CreateInvestmentModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();

  const [kind, setKind] = useState<InvestmentKind>("fixed_deposit");
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [startDate, setStartDate] = useState(todayDateKey());

  // Interest based fields
  const [annualRate, setAnnualRate] = useState("7.5");
  const [interestMethod, setInterestMethod] = useState<InterestMethod>("compound");
  const [creditFreq, setCreditFreq] = useState<InterestCreditFrequency>("quarterly");
  const [maturityDate, setMaturityDate] = useState("");

  // Mutual Fund fields
  const [units, setUnits] = useState("");
  const [purchaseNav, setPurchaseNav] = useState("");
  const [currentNav, setCurrentNav] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Investment name is required");
      return;
    }

    const numPrincipal = Number(principal);
    if (!Number.isFinite(numPrincipal) || numPrincipal <= 0) {
      toast.error("Please enter a valid principal amount");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<Investment, "id"> = {
        name: name.trim(),
        kind,
        principal: numPrincipal,
        startDate,
        status: "active",
      };

      if (kind === "fixed_deposit" || kind === "interest_savings") {
        payload.annualInterestRate = Number(annualRate) || 0;
        payload.interestMethod = interestMethod;
        payload.creditFrequency = creditFreq;
        if (maturityDate.trim()) {
          payload.maturityDate = maturityDate.trim();
        }
      } else if (kind === "mutual_fund") {
        if (units) payload.units = Number(units) || 0;
        if (purchaseNav) payload.purchaseNav = Number(purchaseNav) || 0;
        if (currentNav) payload.currentNav = Number(currentNav) || 0;
      }

      await onSubmit(payload);
      setName("");
      setPrincipal("");
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
                  {
                    backgroundColor:
                      kind === "fixed_deposit"
                        ? "rgba(59,130,246,0.15)"
                        : kind === "interest_savings"
                        ? "rgba(16,185,129,0.15)"
                        : "rgba(139,92,246,0.15)",
                  },
                ]}
              >
                {kind === "fixed_deposit" ? (
                  <Landmark size={20} color="#3B82F6" />
                ) : kind === "interest_savings" ? (
                  <Banknote size={20} color="#10B981" />
                ) : (
                  <TrendingUp size={20} color="#8B5CF6" />
                )}
              </View>
              <View>
                <Text style={[styles.title, { color: theme.colors.foreground }]}>
                  Add Investment Asset
                </Text>
                <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
                  Log FD, Savings account, or Mutual Fund
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
            {/* Kind Selector Pills */}
            <View style={styles.kindSelectorRow}>
              {[
                { id: "fixed_deposit", label: "Fixed Deposit", icon: Landmark },
                { id: "interest_savings", label: "Savings Acc", icon: Banknote },
                { id: "mutual_fund", label: "Mutual Fund", icon: TrendingUp },
              ].map((item) => {
                const isSelected = kind === item.id;
                const IconComp = item.icon;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      haptic.selection().catch(() => undefined);
                      setKind(item.id as InvestmentKind);
                    }}
                    style={[
                      styles.kindTab,
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
                    <IconComp
                      size={14}
                      color={isSelected ? "#FFFFFF" : theme.colors.foreground}
                    />
                    <Text
                      style={[
                        styles.kindTabText,
                        {
                          color: isSelected ? "#FFFFFF" : theme.colors.foreground,
                          fontWeight: isSelected ? "700" : "500",
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Asset Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Asset / Institution Name *
              </Text>
              <Input
                value={name}
                onChangeText={setName}
                placeholder={
                  kind === "fixed_deposit"
                    ? "e.g. HDFC 1-Year FD"
                    : kind === "interest_savings"
                    ? "e.g. Kotak 811 Interest Account"
                    : "e.g. Parag Parikh Flexi Cap"
                }
                autoFocus
              />
            </View>

            {/* Principal Invested */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Principal Amount ({displayCurrency}) *
              </Text>
              <Input
                value={principal}
                onChangeText={setPrincipal}
                placeholder="e.g. 50000"
                keyboardType="numeric"
              />
            </View>

            {/* Start Date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Start Date (YYYY-MM-DD)
              </Text>
              <Input
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
              />
            </View>

            {/* FD & Savings Specific Fields */}
            {(kind === "fixed_deposit" || kind === "interest_savings") && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.colors.foreground }]}>
                    Annual Interest Rate (% p.a.)
                  </Text>
                  <Input
                    value={annualRate}
                    onChangeText={setAnnualRate}
                    placeholder="e.g. 7.5"
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.colors.foreground }]}>
                    Maturity Date (Optional)
                  </Text>
                  <Input
                    value={maturityDate}
                    onChangeText={setMaturityDate}
                    placeholder="YYYY-MM-DD (e.g. 2027-08-01)"
                  />
                </View>
              </>
            )}

            {/* Mutual Fund Specific Fields */}
            {kind === "mutual_fund" && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.colors.foreground }]}>
                    Purchase NAV
                  </Text>
                  <Input
                    value={purchaseNav}
                    onChangeText={setPurchaseNav}
                    placeholder="e.g. 62.5"
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.colors.foreground }]}>
                    Current NAV
                  </Text>
                  <Input
                    value={currentNav}
                    onChangeText={setCurrentNav}
                    placeholder="e.g. 74.2"
                    keyboardType="numeric"
                  />
                </View>
              </>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Button
              onPress={handleSave}
              loading={isSubmitting}
              disabled={!name.trim() || !principal || isSubmitting}
              style={{ flex: 1 }}
            >
              <Text style={{ fontWeight: "800", color: "#FFFFFF" }}>
                Add Investment
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
    maxHeight: "88%",
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
    gap: 14,
  },
  kindSelectorRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  kindTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  kindTabText: {
    fontSize: 11,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
});

import React, { useMemo } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Archive,
  Banknote,
  Calendar,
  Landmark,
  Percent,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Investment } from "@/shared/types/investment";
import { todayDateKey } from "@/shared/utils/dates";
import { getInvestmentValuation } from "@/shared/utils/investmentInterest";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface InvestmentDetailModalProps {
  visible: boolean;
  investment: Investment | null;
  currency: string;
  onClose: () => void;
  onCloseInvestment: (id: string) => Promise<boolean>;
  onDeleteInvestment: (id: string) => Promise<boolean>;
}

export function InvestmentDetailModal({
  visible,
  investment,
  currency,
  onClose,
  onCloseInvestment,
  onDeleteInvestment,
}: InvestmentDetailModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const today = todayDateKey();
  const valuation = useMemo(() => {
    if (!investment) return null;
    return getInvestmentValuation(investment, today);
  }, [investment, today]);

  if (!investment || !valuation) return null;

  const isClosed = investment.status === "closed";
  const profit = valuation.totalValue - investment.principal;
  const returnRate =
    investment.principal > 0
      ? ((profit / investment.principal) * 100).toFixed(1)
      : "0.0";

  const kindLabel =
    investment.kind === "fixed_deposit"
      ? "Fixed Deposit"
      : investment.kind === "interest_savings"
      ? "Interest Savings"
      : "Mutual Fund";

  const kindColor =
    investment.kind === "fixed_deposit"
      ? "#3B82F6"
      : investment.kind === "interest_savings"
      ? "#10B981"
      : "#8B5CF6";

  const handleDelete = () => {
    Alert.alert(
      "Delete Investment",
      `Are you sure you want to delete "${investment.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await onDeleteInvestment(investment.id);
            onClose();
          },
        },
      ]
    );
  };

  const handleClose = () => {
    Alert.alert(
      "Maturity / Close Investment",
      `Mark "${investment.name}" as closed? It will remain in historical records.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Closed",
          onPress: async () => {
            await onCloseInvestment(investment.id);
            onClose();
          },
        },
      ]
    );
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
                  { backgroundColor: `${kindColor}20` },
                ]}
              >
                {investment.kind === "fixed_deposit" ? (
                  <Landmark size={20} color={kindColor} />
                ) : investment.kind === "interest_savings" ? (
                  <Banknote size={20} color={kindColor} />
                ) : (
                  <TrendingUp size={20} color={kindColor} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.title, { color: theme.colors.foreground }]}
                  numberOfLines={1}
                >
                  {investment.name}
                </Text>
                <Text
                  style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {kindLabel} • Started {investment.startDate}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              >
                <Trash2 size={18} color={theme.colors.destructive} />
              </Pressable>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              >
                <X size={20} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Big Valuation Card */}
            <Card style={styles.valuationCard}>
              <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                TOTAL VALUATION (AS OF TODAY)
              </Text>
              <Amount
                value={valuation.totalValue}
                currency={currency}
                style={{
                  fontSize: 28,
                  fontWeight: "900",
                  color: theme.colors.foreground,
                }}
              />

              <View
                style={[
                  styles.subMetricsRow,
                  { borderTopColor: theme.colors.border },
                ]}
              >
                <View style={styles.subMetric}>
                  <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                    Principal Invested
                  </Text>
                  <Amount
                    value={investment.principal}
                    currency={currency}
                    style={{ fontSize: 15, fontWeight: "700", color: theme.colors.foreground }}
                  />
                </View>

                <View style={[styles.subMetric, { alignItems: "flex-end" }]}>
                  <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                    Accrued Gain / Interest
                  </Text>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: profit >= 0 ? "#10B981" : "#EF4444",
                    }}
                  >
                    +{currency} {Math.round(profit).toLocaleString()} ({returnRate}%)
                  </Text>
                </View>
              </View>
            </Card>

            {/* Terms & Configuration */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
                INVESTMENT SPECIFICATIONS
              </Text>

              <Card style={{ padding: 14, gap: 12 }}>
                <View style={styles.specRow}>
                  <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                    Interest Rate
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground }}>
                    {investment.annualInterestRate !== undefined
                      ? `${investment.annualInterestRate}% p.a.`
                      : "Market Linked"}
                  </Text>
                </View>

                {investment.interestMethod && (
                  <View style={styles.specRow}>
                    <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                      Calculation Method
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground, textTransform: "capitalize" }}>
                      {investment.interestMethod} ({investment.creditFrequency || "Quarterly"})
                    </Text>
                  </View>
                )}

                {investment.maturityDate && (
                  <View style={styles.specRow}>
                    <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                      Maturity Date
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground }}>
                      {investment.maturityDate}
                    </Text>
                  </View>
                )}

                <View style={styles.specRow}>
                  <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                    Status
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: isClosed ? "#64748B" : "#22C55E",
                      textTransform: "uppercase",
                    }}
                  >
                    {investment.status}
                  </Text>
                </View>
              </Card>
            </View>
          </ScrollView>

          {/* Footer Action */}
          {!isClosed && (
            <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
              <Button
                variant="outline"
                onPress={handleClose}
                style={{ flex: 1 }}
              >
                <Archive size={16} color={theme.colors.foreground} />
                <Text style={{ marginLeft: 8, fontWeight: "700", color: theme.colors.foreground }}>
                  Mark as Matured / Closed
                </Text>
              </Button>
            </View>
          )}
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
    marginRight: 10,
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
  iconBtn: {
    padding: 6,
  },
  body: {
    paddingHorizontal: 20,
  },
  valuationCard: {
    padding: 18,
    borderRadius: 18,
    gap: 8,
    marginBottom: 16,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  subMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subMetric: {
    gap: 2,
  },
  section: {
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  specRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

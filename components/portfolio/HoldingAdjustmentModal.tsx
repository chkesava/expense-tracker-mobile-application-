import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { appDialog } from "@/lib/appDialog";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import type { HoldingWithMetrics } from "@/shared/features/portfolio/types";
import { todayDateKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import { executeMissingAcquisitionAdjustment, executeCostBasisAdjustment } from "@/services/portfolio/holdingAdjustments";

type AdjustmentType = "add_missing_acquisition" | "correct_cost_basis";

export function HoldingAdjustmentModal({
  visible,
  holding,
  currency,
  onClose,
}: {
  visible: boolean;
  holding: HoldingWithMetrics;
  currency: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const insets = useSafeAreaInsets();
  
  const [type, setType] = useState<AdjustmentType>("add_missing_acquisition");
  const [submitting, setSubmitting] = useState(false);

  // Missing Acquisition fields
  const [qtyStr, setQtyStr] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [dateStr, setDateStr] = useState(todayDateKey());
  const [fundingSource, setFundingSource] = useState<"investment_cash" | "external">("investment_cash");
  const [reasonAcq, setReasonAcq] = useState("Missing historical purchase");

  // Cost Basis fields
  const [investedStr, setInvestedStr] = useState("");
  const [reasonCost, setReasonCost] = useState("Correct existing cost basis");

  const existingQty = holding.quantity;
  const existingAvg = holding.averageBuyPrice ?? 0;
  const existingInvested = roundMoney(existingQty * existingAvg);

  // Computed previews
  let nextQty = existingQty;
  let nextInvested = existingInvested;
  let nextAvg = existingAvg;
  let diffInvested = 0;

  if (type === "add_missing_acquisition") {
    const q = Number(qtyStr) || 0;
    const p = Number(priceStr) || 0;
    const cost = roundMoney(q * p);
    nextQty = roundMoney(existingQty + q);
    nextInvested = roundMoney(existingInvested + cost);
    nextAvg = nextQty > 0 ? roundMoney(nextInvested / nextQty) : 0;
    diffInvested = cost;
  } else {
    const inv = Number(investedStr);
    if (!isNaN(inv) && investedStr !== "") {
      nextInvested = roundMoney(inv);
      nextAvg = existingQty > 0 ? roundMoney(nextInvested / existingQty) : 0;
      diffInvested = roundMoney(nextInvested - existingInvested);
    }
  }

  const handleConfirm = async () => {
    if (!user) return;

    if (type === "add_missing_acquisition") {
      const q = Number(qtyStr) || 0;
      const p = Number(priceStr) || 0;
      if (q <= 0) {
        toast.error("Enter a valid quantity");
        return;
      }
      if (p < 0) {
        toast.error("Enter a valid price");
        return;
      }
    } else {
      const inv = Number(investedStr);
      if (isNaN(inv) || inv < 0 || investedStr === "") {
        toast.error("Enter a valid total invested amount");
        return;
      }
    }

    void haptic.selection();
    appDialog.alert(
      "Confirm Adjustment",
      "This creates a permanent manual reconciliation record and recalculates your holding metrics. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            try {
              if (type === "add_missing_acquisition") {
                await executeMissingAcquisitionAdjustment(user.uid, {
                  holdingId: holding.id,
                  quantity: Number(qtyStr),
                  price: Number(priceStr),
                  date: dateStr,
                  fundingSource,
                  reason: reasonAcq,
                });
              } else {
                await executeCostBasisAdjustment(user.uid, {
                  holdingId: holding.id,
                  actualInvestedValue: Number(investedStr),
                  date: todayDateKey(),
                  reason: reasonCost,
                });
              }
              toast.success("Holding recalibrated successfully");
              onClose();
            } catch (error) {
              logError("portfolio.adjustHolding", error);
              toast.error(friendlyErrorMessage(error, "Failed to adjust holding"));
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
        <View style={[styles.header, { backgroundColor: theme.colors.card }]}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.iconBtn}>
            <ChevronLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.foreground }]}>Adjust Holding</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView style={[styles.body, { backgroundColor: theme.colors.background }]}>
          <View style={styles.content}>
            <Text style={[styles.holdingName, { color: theme.colors.foreground }]}>
              {holding.name || holding.symbol}
            </Text>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>Adjustment Type</Text>
              <View style={styles.typeButtons}>
                <Pressable
                  style={[
                    styles.typeBtn,
                    { borderColor: theme.colors.border },
                    type === "add_missing_acquisition" && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                  ]}
                  onPress={() => setType("add_missing_acquisition")}
                >
                  <Text style={[styles.typeText, type === "add_missing_acquisition" && { color: "#FFF" }]}>Add missing purchase</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeBtn,
                    { borderColor: theme.colors.border },
                    type === "correct_cost_basis" && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                  ]}
                  onPress={() => setType("correct_cost_basis")}
                >
                  <Text style={[styles.typeText, type === "correct_cost_basis" && { color: "#FFF" }]}>Correct cost basis</Text>
                </Pressable>
              </View>
            </View>

            {type === "add_missing_acquisition" ? (
              <View style={styles.section}>
                <View style={styles.row}>
                  <View style={styles.flex1}>
                    <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Quantity</Text>
                    <TextInput
                      style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border }]}
                      keyboardType="numeric"
                      value={qtyStr}
                      onChangeText={setQtyStr}
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.mutedForeground}
                    />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Buy Price</Text>
                    <TextInput
                      style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border }]}
                      keyboardType="numeric"
                      value={priceStr}
                      onChangeText={setPriceStr}
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.mutedForeground}
                    />
                  </View>
                </View>
                
                <Text style={[styles.label, { color: theme.colors.mutedForeground, marginTop: 12 }]}>Purchase Date</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border }]}
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.mutedForeground}
                />
                
                <Text style={[styles.label, { color: theme.colors.mutedForeground, marginTop: 12 }]}>Funding Source</Text>
                <View style={styles.typeButtons}>
                  <Pressable
                    style={[
                      styles.typeBtn,
                      { borderColor: theme.colors.border },
                      fundingSource === "investment_cash" && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                    ]}
                    onPress={() => setFundingSource("investment_cash")}
                  >
                    <Text style={[styles.typeText, fundingSource === "investment_cash" && { color: "#FFF" }]}>Investment Cash</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.typeBtn,
                      { borderColor: theme.colors.border },
                      fundingSource === "external" && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                    ]}
                    onPress={() => setFundingSource("external")}
                  >
                    <Text style={[styles.typeText, fundingSource === "external" && { color: "#FFF" }]}>External / Already owned</Text>
                  </Pressable>
                </View>

              </View>
            ) : (
              <View style={styles.section}>
                <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Actual Total Invested Amount</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border }]}
                  keyboardType="numeric"
                  value={investedStr}
                  onChangeText={setInvestedStr}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.mutedForeground}
                />
                <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
                  Average price will be automatically calculated.
                </Text>
              </View>
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>Preview</Text>
              <View style={[styles.previewBox, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewLabel, { color: theme.colors.mutedForeground }]}>Invested</Text>
                  <View style={styles.previewValues}>
                    <Amount value={existingInvested} currency={currency} style={[styles.previewOld, { color: theme.colors.mutedForeground }]} />
                    <Text style={{ color: theme.colors.mutedForeground }}> → </Text>
                    <Amount value={nextInvested} currency={currency} style={[styles.previewNew, { color: theme.colors.foreground }]} />
                  </View>
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewLabel, { color: theme.colors.mutedForeground }]}>Average</Text>
                  <View style={styles.previewValues}>
                    <Amount value={existingAvg} currency={currency} style={[styles.previewOld, { color: theme.colors.mutedForeground }]} />
                    <Text style={{ color: theme.colors.mutedForeground }}> → </Text>
                    <Amount value={nextAvg} currency={currency} style={[styles.previewNew, { color: theme.colors.foreground }]} />
                  </View>
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewLabel, { color: theme.colors.mutedForeground }]}>Difference</Text>
                  <Amount
                    value={Math.abs(diffInvested)}
                    currency={currency}
                    prefix={diffInvested >= 0 ? "+" : "-"}
                    style={[styles.previewNew, { color: diffInvested >= 0 ? theme.colors.primary : "#EF4444" }]}
                  />
                </View>
              </View>
            </View>

          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: theme.colors.border }]}>
          <Pressable
            onPress={handleConfirm}
            disabled={submitting}
            style={[styles.confirmBtn, { backgroundColor: theme.colors.primary, opacity: submitting ? 0.7 : 1 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.confirmText}>Confirm Adjustment</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  content: { padding: 16, gap: 24 },
  holdingName: { fontSize: 20, fontWeight: "800" },
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  typeButtons: { flexDirection: "row", gap: 12 },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
  },
  typeText: { fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12 },
  flex1: { flex: 1 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 16,
  },
  hint: { fontSize: 12, marginTop: 4 },
  previewBox: { padding: 16, borderRadius: 12, gap: 12 },
  previewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  previewLabel: { fontSize: 14, fontWeight: "500" },
  previewValues: { flexDirection: "row", alignItems: "center" },
  previewOld: { textDecorationLine: "line-through", fontSize: 14 },
  previewNew: { fontSize: 15, fontWeight: "700" },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: "#FFF" },
  confirmBtn: { height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});

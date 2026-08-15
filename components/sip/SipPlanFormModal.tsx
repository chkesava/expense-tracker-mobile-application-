import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Alert } from "react-native";
import { X } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { sipPlanFormSchema, SipPlanFormInput } from "@/shared/features/sip/schemas";
import { todayDateKey } from "@/shared/utils/dates";

export type SipPlanFormModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: SipPlanFormInput) => Promise<boolean>;
};

const ASSET_TYPES = [
  { label: "Stock", value: "stock" },
  { label: "Mutual Fund", value: "mutual_fund" },
  { label: "Crypto", value: "crypto" },
  { label: "ETF", value: "etf" },
] as const;

const FREQUENCIES = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Yearly", value: "yearly" },
] as const;

export function SipPlanFormModal({ visible, onClose, onSubmit }: SipPlanFormModalProps) {
  const { theme } = useTheme();

  const [assetType, setAssetType] = useState<"stock" | "etf" | "mutual_fund" | "crypto">("stock");
  const [symbol, setSymbol] = useState("");
  const [assetName, setAssetName] = useState("");
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly" | "quarterly" | "yearly">("monthly");
  const [executionDay, setExecutionDay] = useState("1");
  const [startDate, setStartDate] = useState(() => todayDateKey());
  
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    setErrors({});
    
    // Auto-generate quoteKey for simplicity (in a real app, this might come from a search API)
    let quoteKey = symbol;
    if (assetType === "mutual_fund") quoteKey = `MF:${symbol}`;
    if (assetType === "crypto") quoteKey = `CRYPTO:${symbol}`;

    const formData = {
      assetType,
      symbol,
      quoteKey,
      assetName,
      investmentAmount: parseFloat(investmentAmount) || 0,
      currency: "INR",
      frequency,
      executionDay: parseInt(executionDay, 10) || 0,
      startDate,
    };

    const parsed = sipPlanFormSchema.safeParse(formData);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const success = await onSubmit(parsed.data);
      if (success) {
        onClose();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create SIP");
    } finally {
      setLoading(false);
    }
  };

  const renderPill = (
    label: string,
    isActive: boolean,
    onPress: () => void
  ) => {
    return (
      <TouchableOpacity
        style={[
          styles.pill,
          {
            backgroundColor: isActive ? theme.colors.primary : theme.colors.card,
            borderColor: isActive ? theme.colors.primary : theme.colors.border,
          },
        ]}
        onPress={onPress}
      >
        <Text
          style={[
            styles.pillText,
            { color: isActive ? theme.colors.primaryForeground : theme.colors.foreground },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay]}>
        <ScrollView
          style={[styles.container, { backgroundColor: theme.colors.background }]}
          contentContainerStyle={styles.content}
        >
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.headerTitle, { color: theme.colors.foreground }]}>Create SIP Plan</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeBtn}
            >
              <X size={24} color={theme.colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>Asset Type</Text>
            <View style={styles.pillContainer}>
              {ASSET_TYPES.map((type) =>
                renderPill(type.label, assetType === type.value, () => setAssetType(type.value as any))
              )}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Input
              label="Symbol / Scheme Code"
              value={symbol}
              onChangeText={setSymbol}
              placeholder="e.g. INFOSYS"
              error={errors.symbol}
            />
          </View>

          <View style={styles.inputGroup}>
            <Input
              label="Asset Name"
              value={assetName}
              onChangeText={setAssetName}
              placeholder="e.g. Infosys Ltd"
              error={errors.assetName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Input
              label="Investment Amount"
              value={investmentAmount}
              onChangeText={setInvestmentAmount}
              keyboardType="numeric"
              placeholder="e.g. 5000"
              error={errors.investmentAmount}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>Frequency</Text>
            <View style={styles.pillContainer}>
              {FREQUENCIES.map((freq) =>
                renderPill(freq.label, frequency === freq.value, () => setFrequency(freq.value as any))
              )}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Input
              label="Execution Day (0-6 weekly, 1-28 monthly/yearly)"
              value={executionDay}
              onChangeText={setExecutionDay}
              keyboardType="numeric"
              placeholder="e.g. 1"
              error={errors.executionDay}
            />
          </View>

          <View style={styles.inputGroup}>
            <Input
              label="Start Date (YYYY-MM-DD)"
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              error={errors.startDate}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <Button onPress={handleSubmit} disabled={loading}>
            <Text style={{ color: theme.colors.primaryForeground, fontWeight: "800" }}>
              {loading ? "Creating..." : "Create Plan"}
            </Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  container: {
    flex: 1,
    marginTop: 60,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  pillContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 14,
    fontWeight: "500",
  },
  inputGroup: {
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    marginTop: -12,
    marginBottom: 12,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  closeBtn: {
    padding: 4,
  },
});

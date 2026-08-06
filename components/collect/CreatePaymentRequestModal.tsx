import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { usePaymentRequests } from "@/hooks/usePaymentRequests";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useAuth } from "@/providers/AuthProvider";
import type { QrStyleId } from "@/shared/utils/qrStyles";
import { QR_STYLES, storeQrStyleId } from "@/shared/utils/qrStyles";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const NOTE_PREFIXES = ["For", "Rent", "Split", "EMI", "Advance", "Dues", "Other"];

export interface CreatePaymentRequestModalProps {
  visible: boolean;
  onClose: () => void;
}

export function CreatePaymentRequestModal({
  visible,
  onClose,
}: CreatePaymentRequestModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();
  const { settings: userSettings } = useSettings();
  const { settings: system } = useSystemSettings();
  const { createPaymentRequest } = usePaymentRequests();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [notePrefix, setNotePrefix] = useState("For");
  const [selectedStyleId, setSelectedStyleId] = useState<QrStyleId>("indigo");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount("");
      setNote("");
      setNotePrefix("For");
      setSelectedStyleId("indigo");
    }
  }, [visible]);

  const upiId = userSettings.upiId || "";
  const payeeName = user?.displayName || user?.email?.split("@")[0] || "Me";

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      Alert.alert("Error", "Please enter a valid amount.");
      return;
    }
    if (!upiId) {
      Alert.alert(
        "UPI ID Required",
        "Please set your UPI ID in Settings before creating a payment request."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      storeQrStyleId(selectedStyleId);
      await createPaymentRequest({
        amount: numAmount,
        note: note.trim(),
        notePrefix,
        payeeName,
        upiId,
        qrStyleId: selectedStyleId,
        payeePhotoUrl: user?.photoURL || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text
                style={[styles.title, { color: theme.colors.cardForeground }]}
              >
                Request Payment
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                Generate a QR + UPI link to collect money
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { opacity: 0.6 },
              ]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* UPI ID display */}
            <View
              style={[
                styles.upiCard,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.02)",
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                RECEIVING UPI ID
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: upiId ? theme.colors.foreground : theme.colors.destructive,
                }}
              >
                {upiId || "⚠ Not set — add in Settings"}
              </Text>
            </View>

            {/* Amount */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                AMOUNT ({system.defaultCurrency})
              </Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.02)",
                    borderColor: theme.colors.border,
                    color: theme.colors.foreground,
                    fontSize: 22,
                    fontWeight: "800",
                  },
                ]}
              />
            </View>

            {/* Note Prefix */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                PURPOSE
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {NOTE_PREFIXES.map((prefix) => {
                  const isSelected = notePrefix === prefix;
                  return (
                    <Pressable
                      key={prefix}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setNotePrefix(prefix);
                      }}
                      style={[
                        styles.chip,
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
                          styles.chipText,
                          {
                            color: isSelected
                              ? theme.colors.primaryForeground
                              : theme.colors.foreground,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {prefix}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Note */}
            <View style={{ gap: 6 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                NOTE (optional)
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={`e.g. ${notePrefix} July Rent`}
                placeholderTextColor={theme.colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.02)",
                    borderColor: theme.colors.border,
                    color: theme.colors.foreground,
                  },
                ]}
              />
            </View>

            {/* QR Style Picker */}
            <View style={{ gap: 8 }}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                QR COLOUR STYLE
              </Text>
              <View style={styles.swatchRow}>
                {QR_STYLES.map((style) => {
                  const isSelected = selectedStyleId === style.id;
                  return (
                    <Pressable
                      key={style.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setSelectedStyleId(style.id);
                      }}
                      style={[
                        styles.swatch,
                        { backgroundColor: style.fg },
                        isSelected && styles.swatchSelected,
                      ]}
                    >
                      {isSelected && (
                        <View style={styles.swatchCheck} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.actionFooter}>
            <Button variant="outline" onPress={onClose} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={handleSave}
              disabled={isSubmitting}
              style={{ flex: 2 }}
            >
              {isSubmitting ? "Creating..." : "Generate QR & Link"}
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
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
  closeButton: {
    padding: 4,
  },
  scrollArea: {
    maxHeight: 440,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  upiCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
  },
  swatchRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  swatchCheck: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  actionFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
});

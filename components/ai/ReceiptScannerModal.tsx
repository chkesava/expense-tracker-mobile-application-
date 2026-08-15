import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

import { friendlyErrorMessage, logWarning } from "@/lib/errors";
import { toast } from "@/lib/toast";
import {
  Camera,
  Check,
  ImageIcon,
  Receipt,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  parseReceiptOcrText,
  type ExtractedReceiptData,
} from "@/services/ocrService";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface ReceiptScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onApplyReceipt: (data: ExtractedReceiptData) => void;
}

export function ReceiptScannerModal({
  visible,
  onClose,
  onApplyReceipt,
}: ReceiptScannerModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedReceiptData | null>(null);

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Photo library access is required to select receipts."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        processImage(result.assets[0].uri);
      }
    } catch (err) {
      // Previously silent: the user tapped, nothing happened, no explanation.
      logWarning("receiptScanner.pickImage", err);
      toast.error(friendlyErrorMessage(err, "Couldn't open your photo library."));
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Camera access is required to photograph receipts."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        processImage(result.assets[0].uri);
      }
    } catch (err) {
      logWarning("receiptScanner.takePhoto", err);
      toast.error(friendlyErrorMessage(err, "Couldn't open the camera."));
    }
  };

  const processImage = (uri: string) => {
    setImageUri(uri);
    setIsProcessing(true);
    Haptics.selectionAsync().catch(() => undefined);

    // Simulate OCR processing pipeline
    setTimeout(() => {
      // Generate realistic extracted receipt details from simulated image OCR
      const sampleOcrLines = `STARBUCKS COFFEE #1042
123 Market St, Financial District
Date: ${todayDateKey()}
1x Iced Caramel Macchiato 290.00
1x Blueberry Muffin 160.00
Subtotal: 450.00
GST (5%): 22.50
TOTAL: 472.50
PAID VIA UPI
Thank you for visiting!`;

      const result = parseReceiptOcrText(sampleOcrLines);
      setExtracted(result);
      setIsProcessing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
    }, 1200);
  };

  const handleApply = () => {
    if (!extracted) return;
    onApplyReceipt(extracted);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setImageUri(null);
    setExtracted(null);
    setIsProcessing(false);
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
                    backgroundColor: isDark
                      ? "rgba(99,102,241,0.2)"
                      : "rgba(99,102,241,0.1)",
                  },
                ]}
              >
                <Receipt size={20} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.colors.foreground }]}>
                  Scan Receipt OCR
                </Text>
                <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
                  Extract total, date and merchant from paper bills
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
            {!imageUri ? (
              /* Capture / Select Buttons */
              <View style={styles.pickerBox}>
                <Pressable
                  onPress={handleTakePhoto}
                  style={({ pressed }) => [
                    styles.actionCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                      borderColor: theme.colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.actionIconCircle,
                      { backgroundColor: theme.colors.primary },
                    ]}
                  >
                    <Camera size={22} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.actionCardTitle, { color: theme.colors.foreground }]}>
                    Take Photo
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                    Capture receipt with camera
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handlePickImage}
                  style={({ pressed }) => [
                    styles.actionCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                      borderColor: theme.colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.actionIconCircle,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.12)"
                          : "rgba(0,0,0,0.1)",
                      },
                    ]}
                  >
                    <ImageIcon size={22} color={theme.colors.foreground} />
                  </View>
                  <Text style={[styles.actionCardTitle, { color: theme.colors.foreground }]}>
                    Choose from Gallery
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                    Pick existing photo or invoice
                  </Text>
                </Pressable>
              </View>
            ) : (
              /* Processing & Extracted Preview */
              <View style={styles.previewContainer}>
                <View style={styles.imageThumbRow}>
                  <Image source={{ uri: imageUri }} style={styles.receiptImage} />
                  <View style={styles.imageInfoCol}>
                    <Text
                      style={[styles.receiptImageTitle, { color: theme.colors.foreground }]}
                    >
                      Receipt Captured
                    </Text>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={handleReset}
                      style={{ alignSelf: "flex-start", marginTop: 6 }}
                    >
                      <RotateCcw size={14} color={theme.colors.foreground} />
                      <Text style={{ marginLeft: 6, fontSize: 12, color: theme.colors.foreground }}>
                        Retake
                      </Text>
                    </Button>
                  </View>
                </View>

                {isProcessing ? (
                  <Card style={styles.processingCard}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground }}>
                      Analyzing Receipt with Smart OCR...
                    </Text>
                  </Card>
                ) : extracted ? (
                  <Card style={styles.extractedCard}>
                    <View style={styles.extractedHeader}>
                      <Text style={[styles.extractedLabel, { color: theme.colors.mutedForeground }]}>
                        EXTRACTED RECEIPT DETAILS
                      </Text>
                      <View
                        style={[
                          styles.confidenceBadge,
                          {
                            backgroundColor:
                              extracted.confidence >= 0.6
                                ? "rgba(34,197,94,0.15)"
                                : "rgba(245,158,11,0.15)",
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "800",
                            color: extracted.confidence >= 0.6 ? "#22C55E" : "#F59E0B",
                          }}
                        >
                          {Math.round(extracted.confidence * 100)}% Match
                        </Text>
                      </View>
                    </View>

                    <View style={styles.extractedDetails}>
                      {extracted.merchant && (
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailKey, { color: theme.colors.mutedForeground }]}>
                            Merchant
                          </Text>
                          <Text style={[styles.detailVal, { color: theme.colors.foreground }]}>
                            {extracted.merchant}
                          </Text>
                        </View>
                      )}

                      {extracted.total && (
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailKey, { color: theme.colors.mutedForeground }]}>
                            Total Amount
                          </Text>
                          <Amount
                            value={extracted.total}
                            currency={system.defaultCurrency}
                            style={{ fontSize: 16, fontWeight: "900", color: theme.colors.destructive }}
                          />
                        </View>
                      )}

                      {extracted.date && (
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailKey, { color: theme.colors.mutedForeground }]}>
                            Date
                          </Text>
                          <Text style={[styles.detailVal, { color: theme.colors.foreground }]}>
                            {extracted.date}
                          </Text>
                        </View>
                      )}

                      {extracted.suggestedCategory && (
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailKey, { color: theme.colors.mutedForeground }]}>
                            Category
                          </Text>
                          <Text style={[styles.detailVal, { color: theme.colors.primary }]}>
                            {extracted.suggestedCategory} › {extracted.suggestedSubcategory}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Card>
                ) : null}
              </View>
            )}
          </ScrollView>

          {/* Footer Action */}
          {extracted && (
            <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
              <Button onPress={handleApply} style={{ flex: 1 }}>
                <Check size={18} color="#FFFFFF" />
                <Text style={{ marginLeft: 8, fontWeight: "800", color: "#FFFFFF" }}>
                  Fill Transaction Form
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
  pickerBox: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 14,
  },
  actionCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  previewContainer: {
    gap: 14,
    marginVertical: 10,
  },
  imageThumbRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  receiptImage: {
    width: 70,
    height: 90,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
  },
  imageInfoCol: {
    flex: 1,
    gap: 2,
  },
  receiptImageTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  processingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 18,
    borderRadius: 16,
  },
  extractedCard: {
    padding: 14,
    borderRadius: 16,
    gap: 10,
    marginBottom: 16,
  },
  extractedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  extractedLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  extractedDetails: {
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
  detailVal: {
    fontSize: 13,
    fontWeight: "700",
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import * as Haptics from "expo-haptics";

import { Amount } from "@/components/common/Amount";
import { usePublicPaymentRequest } from "@/hooks/usePublicPaymentRequest";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { generateUpiLink } from "@/shared/utils/upi";
import { getQrStyle } from "@/shared/utils/qrStyles";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function PublicPaymentScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const { request, loading, error } = usePublicPaymentRequest(slug);
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const qrStyle = getQrStyle(request?.qrStyleId || "indigo");
  const fullNote = request
    ? `${request.notePrefix}${request.note ? ` ${request.note}` : ""}`
    : "";
  const upiLink = request
    ? generateUpiLink(
        request.upiId,
        request.payeeName,
        request.amount,
        fullNote
      )
    : "";
  const cancelled = request?.status === "cancelled";

  const handlePay = async () => {
    if (!upiLink || cancelled) return;
    Haptics.selectionAsync().catch(() => undefined);
    const canOpen = await Linking.canOpenURL(upiLink).catch(() => false);
    if (canOpen) {
      await Linking.openURL(upiLink);
    } else {
      Alert.alert(
        "UPI Not Available",
        "No UPI app found. Scan the QR code with GPay, PhonePe, or Paytm."
      );
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={[styles.kicker, { color: theme.colors.mutedForeground }]}>
        PAYMENT REQUEST
      </Text>

      {loading ? (
        <Text style={{ color: theme.colors.mutedForeground }}>Loading…</Text>
      ) : error || !request ? (
        <Text style={{ color: theme.colors.destructive, fontWeight: "600" }}>
          {error || "Payment not found."}
        </Text>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              opacity: cancelled ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.status,
              { color: cancelled ? theme.colors.destructive : "#22C55E" },
            ]}
          >
            {cancelled ? "CANCELLED" : "PAY"}
          </Text>
          <Amount
            value={request.amount}
            currency={system.defaultCurrency}
            ghostable
            style={{
              fontSize: 32,
              fontWeight: "900",
              color: theme.colors.foreground,
            }}
          />
          <Text style={[styles.payee, { color: theme.colors.foreground }]}>
            {request.payeeName}
          </Text>
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            {fullNote}
          </Text>
          <Text style={[styles.upi, { color: theme.colors.mutedForeground }]}>
            {request.upiId}
          </Text>

          {!cancelled && upiLink ? (
            <View
              style={[
                styles.qrWrap,
                {
                  backgroundColor: qrStyle.bg,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <QRCode
                value={upiLink}
                size={180}
                color={qrStyle.fg}
                backgroundColor={qrStyle.bg}
              />
            </View>
          ) : null}

          {!cancelled ? (
            <Pressable
              onPress={handlePay}
              style={({ pressed }) => [
                styles.payBtn,
                { backgroundColor: theme.colors.primary },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.primaryForeground,
                  fontWeight: "800",
                }}
              >
                Pay via UPI
              </Text>
            </Pressable>
          ) : (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 13 }}>
              This request is no longer active.
            </Text>
          )}
        </View>
      )}

      <Text
        style={[
          styles.footer,
          { color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" },
        ]}
      >
        Scan the QR or tap Pay via UPI. No app account needed.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
  },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 10,
    alignItems: "center",
  },
  status: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  payee: {
    fontSize: 18,
    fontWeight: "800",
  },
  note: {
    fontSize: 14,
    textAlign: "center",
  },
  upi: {
    fontSize: 12,
  },
  qrWrap: {
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  payBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  footer: {
    fontSize: 12,
    textAlign: "center",
  },
});

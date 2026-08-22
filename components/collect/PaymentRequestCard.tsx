import { Alert, Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Ban, Copy, Share2, Trash2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { usePaymentRequests } from "@/hooks/usePaymentRequests";
import type { PaymentRequest } from "@/shared/types/paymentRequest";
import { getPaymentRequestShareUrl } from "@/shared/utils/paymentRequestUrl";
import { generateUpiLink } from "@/shared/utils/upi";
import { getQrStyle } from "@/shared/utils/qrStyles";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export interface PaymentRequestCardProps {
  request: PaymentRequest;
}

export function PaymentRequestCard({ request }: PaymentRequestCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const { cancelPaymentRequest, deletePaymentRequest } = usePaymentRequests();

  const qrStyle = getQrStyle(request.qrStyleId);
  const isCancelled = request.status === "cancelled";

  const upiLink = generateUpiLink(
    request.upiId,
    request.payeeName,
    request.amount,
    `${request.notePrefix}${request.note ? ` ${request.note}` : ""}`
  );

  const shareUrl = getPaymentRequestShareUrl(request.slug);
  const fullNote = `${request.notePrefix}${request.note ? ` ${request.note}` : ""}`;

  const handleShare = async () => {
    haptic.selection().catch(() => undefined);
    const message = [
      `💸 ${request.payeeName} is requesting ${displayCurrency} ${request.amount.toFixed(2)}`,
      `📝 ${fullNote}`,
      ``,
      `Pay via UPI:`,
      upiLink,
      shareUrl ? `\nOr open payment page:\n${shareUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await Share.share({ message, title: `Pay ${request.payeeName}` });
    } catch (err) {
      logError("paymentRequestCard.share", err);
    }
  };

  const handlePayUpi = async () => {
    haptic.selection().catch(() => undefined);
    const canOpen = await Linking.canOpenURL(upiLink).catch(() => false);
    if (canOpen) {
      await Linking.openURL(upiLink);
    } else {
      Alert.alert("UPI Not Available", "No UPI app found on this device.");
    }
  };

  const handleCancel = () => {
    if (!request.id) return;
    Alert.alert("Cancel Request", "Mark this request as cancelled?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        onPress: () => cancelPaymentRequest(request.id),
      },
    ]);
  };

  const handleDelete = () => {
    if (!request.id) return;
    Alert.alert("Delete Request", "Permanently delete this payment request?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deletePaymentRequest(request.id),
      },
    ]);
  };

  return (
    <Card
      elevation={2}
      style={[
        styles.card,
        {
          borderColor: isCancelled ? theme.colors.border : theme.colors.border,
          opacity: isCancelled ? 0.65 : 1,
        },
      ]}
    >
      {/* Status badge */}
      <View style={styles.topRow}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isCancelled
                ? "rgba(239,68,68,0.12)"
                : "rgba(34,197,94,0.12)",
            },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              { color: isCancelled ? "#EF4444" : "#22C55E" },
            ]}
          >
            {isCancelled ? "CANCELLED" : "ACTIVE"}
          </Text>
        </View>
        <Text
          style={[styles.noteText, { color: theme.colors.mutedForeground }]}
          numberOfLines={1}
        >
          {fullNote}
        </Text>
      </View>

      {/* Main Content: QR + Details */}
      <View style={styles.mainRow}>
        {/* QR Code */}
        <View
          style={[
            styles.qrWrapper,
            { backgroundColor: qrStyle.bg, borderColor: theme.colors.border },
          ]}
        >
          <QRCode
            value={upiLink || "https://example.com"}
            size={96}
            color={qrStyle.fg}
            backgroundColor={qrStyle.bg}
          />
        </View>

        {/* Info */}
        <View style={styles.infoCol}>
          <Amount
            value={request.amount}
            currency={displayCurrency}
            ghostable
            style={{
              fontSize: 22,
              fontWeight: "900",
              color: theme.colors.foreground,
            }}
          />
          <Text
            style={[styles.payeeName, { color: theme.colors.mutedForeground }]}
          >
            {request.payeeName}
          </Text>
          <Text
            style={[styles.upiIdText, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            {request.upiId}
          </Text>

          {/* Action buttons */}
          {!isCancelled && (
            <View style={styles.actionRow}>
              <Pressable
                onPress={handlePayUpi}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: qrStyle.fg },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.actionBtnText}>Pay via UPI</Text>
              </Pressable>

              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [
                  styles.iconBtn,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)",
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Share2 size={16} color={theme.colors.foreground} />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Footer Actions */}
      <View
        style={[
          styles.footerRow,
          { borderTopColor: theme.colors.border },
        ]}
      >
        {!isCancelled && (
          <Pressable
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.footerBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ban size={14} color={theme.colors.mutedForeground} />
            <Text
              style={[styles.footerBtnText, { color: theme.colors.mutedForeground }]}
            >
              Cancel
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [
            styles.footerBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Trash2 size={14} color={theme.colors.destructive} />
          <Text
            style={[styles.footerBtnText, { color: theme.colors.destructive }]}
          >
            Delete
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    gap: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  noteText: {
    fontSize: 12,
    flex: 1,
    fontStyle: "italic",
  },
  mainRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  qrWrapper: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },
  payeeName: {
    fontSize: 12,
    fontWeight: "600",
  },
  upiIdText: {
    fontSize: 11,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    alignItems: "center",
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  iconBtn: {
    padding: 7,
    borderRadius: 10,
  },
  footerRow: {
    flexDirection: "row",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
});

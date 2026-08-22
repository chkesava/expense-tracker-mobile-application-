import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Share2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import type { Participant, Split } from "@/shared/types/split";
import { getPaymentRequestShareUrl, getPublicAppOrigin } from "@/shared/utils/paymentRequestUrl";
import { getQrStyle, getStoredQrStyleId } from "@/shared/utils/qrStyles";
import { generateSplitShareMessage, participantRemainingDue } from "@/shared/utils/splitMath";
import { generateUpiLink } from "@/shared/utils/upi";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";

export interface SplitPayQrCardProps {
  split: Split;
  participant: Participant;
  creatorUpiId: string;
  currency: string;
}

export function SplitPayQrCard({
  split,
  participant,
  creatorUpiId,
  currency,
}: SplitPayQrCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const qrStyle = getQrStyle(getStoredQrStyleId());
  const payeeName = split.createdByName || "Split Organizer";
  const remainingDue = participantRemainingDue(participant);
  const upiLink = generateUpiLink(
    creatorUpiId,
    payeeName,
    remainingDue,
    `Split: ${split.title}`
  );
  const origin = getPublicAppOrigin();
  const shareUrl =
    origin && participant.paymentSlug
      ? getPaymentRequestShareUrl(participant.paymentSlug)
      : "";

  const handleShare = async () => {
    haptic.selection().catch(() => undefined);
    const message = generateSplitShareMessage(
      split,
      participant,
      creatorUpiId,
      currency,
      shareUrl || undefined
    );
    try {
      await Share.share({
        message,
        title: `Pay ${payeeName} for ${split.title}`,
      });
    } catch (err) {
      logError("splitPayQrCard.share", err);
    }
  };

  if (!creatorUpiId || remainingDue <= 0) return null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
        SHARE WITH {participant.name.toUpperCase()}
      </Text>
      <View style={styles.row}>
        <View
          style={[
            styles.qrWrap,
            { backgroundColor: qrStyle.bg, borderColor: theme.colors.border },
          ]}
        >
          <QRCode
            value={upiLink || "upi://pay"}
            size={96}
            color={qrStyle.fg}
            backgroundColor={qrStyle.bg}
          />
        </View>
        <View style={styles.info}>
          <Amount
            value={remainingDue}
            currency={currency}
            ghostable
            style={{
              fontSize: 20,
              fontWeight: "900",
              color: theme.colors.foreground,
            }}
          />
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            Pay {payeeName}
          </Text>
          <Text
            style={[styles.meta, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            {creatorUpiId}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="Share payment link"
              style={({ pressed }) => [
                styles.payBtn,
                { backgroundColor: qrStyle.fg },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Share2 size={14} color="#FFFFFF" />
              <Text style={styles.payText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    borderCurve: "continuous",
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  qrWrap: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  info: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
  },
  meta: {
    fontSize: 11,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  payText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});

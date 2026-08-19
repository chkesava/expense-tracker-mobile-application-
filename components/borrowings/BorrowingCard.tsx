import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Building2,
  CreditCard,
  Landmark,
  MoreVertical,
  User,
} from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_RED,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { haptic } from "@/lib/haptics";
import type { Borrowing, BorrowingStatus, LenderType } from "@/shared/types/borrowing";
import { LENDER_TYPE_LABELS } from "@/shared/types/borrowing";
import {
  describeInterest,
  type BorrowingSummary,
} from "@/shared/utils/borrowingMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const STATUS_COLORS: Record<BorrowingStatus, string> = {
  ACTIVE: ACCOUNT_GREEN,
  PARTIALLY_SETTLED: CARD_ORANGE,
  FULLY_SETTLED: ACCOUNT_GREEN,
  OVERDUE: ACCOUNT_RED,
  CLOSED: "#94A3B8",
};

const CARD_STATUS_LABELS: Record<BorrowingStatus, string> = {
  ACTIVE: "Active",
  PARTIALLY_SETTLED: "Partial",
  FULLY_SETTLED: "Paid",
  OVERDUE: "Overdue",
  CLOSED: "Closed",
};

const LENDER_AVATAR: Record<LenderType, { bg: string; Icon: typeof User }> = {
  BANK: { bg: "rgba(99, 102, 241, 0.28)", Icon: Landmark },
  FINANCE_INSTITUTION: { bg: "rgba(251, 191, 36, 0.22)", Icon: Building2 },
  CREDIT_CARD: { bg: "rgba(109, 90, 230, 0.28)", Icon: CreditCard },
  FRIEND: { bg: "rgba(56, 189, 248, 0.22)", Icon: User },
  FAMILY: { bg: "rgba(74, 222, 128, 0.22)", Icon: User },
  OTHER: { bg: "rgba(148, 163, 184, 0.22)", Icon: User },
};

export const BorrowingCard = memo(function BorrowingCard({
  borrowing,
  summary,
  currency,
  onPress,
  onMenu,
}: {
  borrowing: Borrowing;
  summary: BorrowingSummary;
  currency?: string;
  onPress: (id: string) => void;
  onMenu: (id: string) => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const id = borrowing.id ?? "";
  const statusColor = STATUS_COLORS[summary.status];
  const avatar = LENDER_AVATAR[borrowing.lenderType];
  const AvatarIcon = avatar.Icon;
  const repaidRatio =
    summary.principalAmount > 0
      ? Math.min(1, summary.principalPaid / summary.principalAmount)
      : 0;
  const outstandingColor =
    summary.status === "OVERDUE"
      ? isDark
        ? ACCOUNT_RED
        : theme.colors.destructive
      : theme.colors.foreground;
  const repaidColor = isDark ? ACCOUNT_GREEN : theme.colors.success;

  return (
    <Pressable
      onPress={() => {
        if (!id) return;
        void haptic.selection();
        onPress(id);
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? "#10141C" : theme.colors.card,
          borderColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.border,
        },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Borrowing from ${borrowing.lenderName}`}
    >
      <View style={styles.topRow}>
        <View style={[styles.avatar, { backgroundColor: avatar.bg }]}>
          <AvatarIcon size={16} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <View style={styles.identity}>
          <Amount
            value={summary.principalAmount}
            currency={currency}
            ghostable
            style={[styles.amount, { color: theme.colors.foreground }]}
          />
          <Text
            style={[styles.lender, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            {borrowing.lenderName}
          </Text>
          <Text
            style={[styles.meta, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            {LENDER_TYPE_LABELS[borrowing.lenderType]} · {describeInterest(borrowing)}
          </Text>
        </View>
        <View style={styles.actions}>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {CARD_STATUS_LABELS[summary.status]}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (!id) return;
              void haptic.selection();
              onMenu(id);
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.menuHit, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${borrowing.lenderName}`}
          >
            <MoreVertical size={18} color={theme.colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.track,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          },
        ]}
        accessibilityLabel={`${Math.round(repaidRatio * 100)} percent repaid`}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${repaidRatio * 100}%`,
              backgroundColor: repaidColor,
            },
          ]}
        />
      </View>

      <View style={styles.footerRow}>
        <View style={styles.metric}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            OUTSTANDING
          </Text>
          <Amount
            value={summary.totalOutstanding}
            currency={currency}
            ghostable
            style={[styles.metricValue, { color: outstandingColor }]}
          />
        </View>
        <View style={[styles.metric, styles.metricEnd]}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            REPAID
          </Text>
          <Amount
            value={summary.totalPaid}
            currency={currency}
            ghostable
            style={[styles.metricValue, { color: repaidColor }]}
          />
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    borderCurve: "continuous",
    padding: 14,
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  amount: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  lender: {
    fontSize: 14,
    fontWeight: "700",
  },
  meta: {
    fontSize: 12,
    fontWeight: "500",
  },
  actions: {
    alignItems: "flex-end",
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderCurve: "continuous",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  menuHit: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  track: {
    height: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148, 163, 184, 0.16)",
  },
  metric: {
    gap: 2,
    flex: 1,
  },
  metricEnd: {
    alignItems: "flex-end",
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  pressed: {
    opacity: 0.86,
  },
});

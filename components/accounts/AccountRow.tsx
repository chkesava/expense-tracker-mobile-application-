import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { AccountEditButton } from "@/components/accounts/AccountEditButton";
import { SmsMatchingUnconfiguredText } from "@/components/accounts/SmsMatchingUnconfiguredText";
import type { Account } from "@/shared/types/expense";
import { formatAccountIdentityLine } from "@/shared/utils/accountIdentity";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

/**
 * One account in the Accounts list (SPENDLY-139).
 *
 * Deposit accounts and credit cards used to be two near-identical copies of
 * this markup that had already drifted apart — only the deposit copy carried an
 * accessibility label. They differ solely in their icon and in what sits on the
 * right, so both of those are passed in and everything else is shared.
 */
export function AccountRow({
  account,
  typeName,
  icon,
  accentBg,
  accentBorder,
  trailing,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  account: Account;
  /** Drives the identity line and the SMS-matching hint. */
  typeName: string;
  icon: ReactNode;
  accentBg: string;
  accentBorder: string;
  /** The value block — a balance, or an outstanding amount with its caption. */
  trailing: ReactNode;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const ripple = surfaces.track;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: ripple, borderless: false }}
      style={({ pressed }) => [
        styles.accountRow,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.outlineVariant,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={[
          styles.accountIconBox,
          {
            backgroundColor: accentBg,
            borderColor: accentBorder,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        {icon}
      </View>

      <View style={styles.accountMeta}>
        <Text
          style={[styles.accountName, { color: theme.colors.foreground }]}
          numberOfLines={1}
        >
          {account.name}
        </Text>
        <Text
          style={[styles.accountSub, { color: theme.colors.mutedForeground }]}
          numberOfLines={1}
        >
          {formatAccountIdentityLine(account, typeName)}
        </Text>
        <SmsMatchingUnconfiguredText account={account} typeName={typeName} />
      </View>

      <View style={styles.accountRight}>
        {trailing}
        <AccountEditButton
          label={`Edit ${account.name}`}
          color={theme.colors.mutedForeground}
          onPress={onLongPress}
        />
        <ChevronRight size={16} color={theme.colors.mutedForeground} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  accountIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  accountMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  accountSub: {
    fontSize: 12,
    fontWeight: "500",
  },
  accountRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
});

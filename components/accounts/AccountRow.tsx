import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { AccountEditButton } from "@/components/accounts/AccountEditButton";
import { NeedsReconciliationText } from "@/components/accounts/NeedsReconciliationText";
import type { Account } from "@/shared/types/expense";
import { formatAccountIdentityLine } from "@/shared/utils/accountIdentity";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";

/**
 * One account in the Accounts list (SPENDLY-139).
 *
 * Deposit accounts and credit cards used to be two near-identical copies of
 * this markup that had already drifted apart — only the deposit copy carried an
 * accessibility label. They differ solely in their icon and in what sits on the
 * right, so both of those are passed in and everything else is shared.
 *
 * SPENDLY-535: the row and its edit pencil are sibling pressables inside one
 * card. The pencil used to sit inside the row's Pressable — a button inside a
 * button, which React rejects on web and which made the two presses compete
 * on native. The icon tile now takes one theme `tint` instead of fixed hexes.
 */
export function AccountRow({
  account,
  typeName,
  icon,
  tint,
  trailing,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  account: Account;
  /** Drives the identity line. */
  typeName: string;
  icon: ReactNode;
  /** Semantic theme colour for the icon tile (washed for the fill). */
  tint: string;
  /** The value block — a balance, or an outstanding amount with its caption. */
  trailing: ReactNode;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.outlineVariant },
      ]}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        android_ripple={{ color: surfaces.track, borderless: false }}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: surfaces.wash(tint),
              borderColor: withAlpha(tint, 0.24),
            },
          ]}
        >
          {icon}
        </View>

        <View style={styles.meta}>
          <Text
            style={[styles.name, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            {account.name}
          </Text>
          <Text
            style={[styles.sub, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            numberOfLines={1}
          >
            {formatAccountIdentityLine(account, typeName)}
          </Text>
          <NeedsReconciliationText account={account} />
        </View>

        <View style={styles.trailing}>{trailing}</View>
        <ChevronRight size={16} color={theme.colors.mutedForeground} />
      </Pressable>

      <AccountEditButton
        label={`Edit ${account.name}`}
        color={theme.colors.mutedForeground}
        onPress={onLongPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingRight: 2,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 4,
  },
  pressed: {
    opacity: 0.88,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 12,
  },
  trailing: {
    alignItems: "flex-end",
    flexShrink: 0,
    maxWidth: "45%",
  },
});

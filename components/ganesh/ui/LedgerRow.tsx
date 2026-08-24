import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, RefreshCw } from "lucide-react-native";

import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { Money, type MoneySize } from "./Money";
import { StatusBadge, type StatusKind } from "./StatusBadge";
import { useGaneshTokens } from "./tokens";

export type LedgerRowBadge = {
  kind: StatusKind;
  label?: string;
};

export type LedgerRowProps = {
  id: string;
  /** Circular leading glyph — a lucide icon. */
  icon: ReactNode;
  /** Tint behind the glyph. Defaults to the neutral tile fill. */
  iconTint?: string;
  title: string;
  /** One short line under the title: method, category, house number. */
  meta?: string;
  badges?: LedgerRowBadge[];
  amount: number;
  amountSize?: MoneySize;
  /** Right-aligned line under the amount — e.g. a split or pending share. */
  amountMeta?: ReactNode;
  /** Who did what, rendered as its own muted line. */
  attribution?: string;
  /** When it happened. Rendered next to the attribution. */
  when?: string;
  /** Receipt / photo preview node. */
  media?: ReactNode;
  pending?: boolean;
  onPress?: (id: string) => void;
};

/**
 * The Ganesh list row. Mirrors the Expense Tracker's `TransactionRow`: 40dp
 * circular glyph, 14/700 title, a meta line carrying badges, and a
 * right-aligned tabular amount so values scan straight down the list.
 *
 * Ganesh adds an attribution line, because who collected or fronted the money
 * is the whole point of shared Pandal hisab.
 */
export const LedgerRow = memo(function LedgerRow({
  id,
  icon,
  iconTint,
  title,
  meta,
  badges,
  amount,
  amountSize = "primary",
  amountMeta,
  attribution,
  when,
  media,
  pending,
  onPress,
}: LedgerRowProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  const body = (
    <>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: iconTint ?? g.tile }]}>{icon}</View>

        <View style={styles.copy}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
          >
            {title}
          </Text>
          {meta || badges?.length ? (
            <View style={styles.metaLine}>
              {meta ? (
                <Text
                  numberOfLines={1}
                  style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
                >
                  {meta}
                </Text>
              ) : null}
              {badges?.map((badge) => (
                <StatusBadge key={`${badge.kind}-${badge.label ?? ""}`} kind={badge.kind} label={badge.label} size="sm" />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.value}>
          <Money value={amount} size={amountSize} />
          {amountMeta}
        </View>

        {onPress ? (
          <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2} />
        ) : null}
      </View>

      {attribution || when ? (
        <Text
          numberOfLines={2}
          style={[styles.attribution, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
        >
          {[attribution, when].filter(Boolean).join(" · ")}
        </Text>
      ) : null}

      {media}

      {pending ? (
        <View style={styles.pendingRow}>
          <RefreshCw size={11} color={theme.colors.warning} strokeWidth={2.4} />
          <Text style={[styles.pendingText, { color: theme.colors.warning, fontFamily: theme.fontFamily.medium }]}>
            Waiting to sync
          </Text>
        </View>
      ) : null}
    </>
  );

  const container = [
    styles.row,
    { backgroundColor: theme.colors.card, borderColor: g.divider },
  ];

  if (!onPress) {
    return <View style={container}>{body}</View>;
  }

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress(id);
      }}
      android_ripple={{
        color: g.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
        borderless: false,
      }}
      accessibilityRole="button"
      accessibilityLabel={[title, meta, attribution, when].filter(Boolean).join(", ")}
      style={({ pressed }) => [container, pressed && { opacity: 0.9 }]}
    >
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
    overflow: "hidden",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    flexWrap: "wrap",
  },
  meta: {
    fontSize: 11.5,
    flexShrink: 1,
  },
  value: {
    alignItems: "flex-end",
    gap: 2,
  },
  attribution: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pendingText: {
    fontSize: 11,
  },
});

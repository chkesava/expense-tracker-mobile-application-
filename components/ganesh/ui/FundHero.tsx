import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { GANESH_RADIUS, MetaLabel } from "@/components/ganesh/ui/surfaces";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { Money } from "./Money";
import { useGaneshTokens, type FundKind } from "./tokens";

export type FundBreakdownItem = {
  label: string;
  value: number;
};

export type FundHeroAction = {
  label: string;
  onPress: () => void;
};

export type FundHeroProps = {
  /** Small label above the amount, e.g. "Available God Fund". */
  eyebrow: string;
  amount: number;
  /** Drives the accent rule and glyph tint. */
  kind?: FundKind;
  /** Leading glyph. */
  icon?: ReactNode;
  /** Context above the eyebrow — festival name, committee name. */
  title?: string;
  subtitle?: string;
  /** Where the money sits: Cash / UPI / Bank. */
  breakdown?: FundBreakdownItem[];
  /** Shown instead of the breakdown when there is nothing yet. */
  emptyHint?: string;
  action?: FundHeroAction;
  footer?: ReactNode;
};

/**
 * The one place a screen may show a hero-sized amount.
 *
 * A single 3dp accent rule carries the fund identity, so God Fund, Personal
 * Money and the Permanent Fund are distinguishable at a glance without turning
 * the surface into a coloured card.
 */
export function FundHero({
  eyebrow,
  amount,
  kind = "god",
  icon,
  title,
  subtitle,
  breakdown,
  emptyHint,
  action,
  footer,
}: FundHeroProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const accent = g.fundColor(kind);

  return (
    <View
      style={[
        styles.surface,
        { backgroundColor: theme.colors.card, borderColor: g.divider },
      ]}
    >
      <View style={[styles.accentRule, { backgroundColor: accent }]} />

      <View style={styles.body}>
        {title || subtitle ? (
          <View style={styles.titleRow}>
            {icon ? (
              <View style={[styles.glyph, { backgroundColor: g.wash(accent) }]}>{icon}</View>
            ) : null}
            <View style={styles.titleCol}>
              {title ? (
                <Text
                  numberOfLines={1}
                  style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
                >
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text
                  numberOfLines={1}
                  style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.amountBlock}>
          <MetaLabel>{eyebrow}</MetaLabel>
          <Money value={amount} size="hero" adjustsFontSizeToFit numberOfLines={1} />
        </View>

        {breakdown?.length ? (
          <View style={[styles.breakdown, { borderTopColor: g.divider }]}>
            {breakdown.map((item) => (
              <View key={item.label} style={styles.breakdownItem}>
                <MetaLabel>{item.label}</MetaLabel>
                <Money value={item.value} size="secondary" />
              </View>
            ))}
          </View>
        ) : emptyHint ? (
          <Text
            style={[styles.hint, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          >
            {emptyHint}
          </Text>
        ) : null}

        {footer}

        {action ? (
          <Pressable
            onPress={() => {
              void haptic.selection();
              action.onPress();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.actionLabel, { color: accent, fontFamily: theme.fontFamily.semibold }]}>
              {action.label}
            </Text>
            <ChevronRight size={14} color={accent} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  accentRule: {
    height: 3,
    width: "100%",
  },
  body: {
    padding: 16,
    gap: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  glyph: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  amountBlock: {
    gap: 2,
  },
  breakdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  breakdownItem: {
    gap: 2,
    minWidth: 72,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    minHeight: 32,
  },
  actionLabel: {
    fontSize: 13,
  },
});

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { StatusBadge, type StatusKind } from "./StatusBadge";
import { useGaneshTokens } from "./tokens";

export type NavRowProps = {
  title: string;
  /** One supporting line. Keep it to a phrase — this is a menu, not prose. */
  meta?: string;
  /** Circular leading glyph. */
  icon?: ReactNode;
  iconTint?: string;
  /** Right-aligned count or value, shown before the chevron. */
  value?: ReactNode;
  /** Attention marker — only set it when there is something to act on. */
  badge?: { kind: StatusKind; label?: string };
  /** Hairline under the row. Set on every row but the last in a group. */
  divider?: boolean;
  /** Defaults to muted. People manage rows pass saffron to match the mock. */
  chevronColor?: string;
  onPress: () => void;
};

/**
 * A row in a grouped navigation list.
 *
 * The admin surfaces used to render every destination as its own bordered card,
 * which made a 31-item menu look like 31 pieces of content. Grouped rows inside
 * one `Section` put the emphasis back on the group heading, which is where the
 * structure actually lives.
 */
export function NavRow({
  title,
  meta,
  icon,
  iconTint,
  value,
  badge,
  divider = false,
  chevronColor,
  onPress,
}: NavRowProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={[title, meta, badge?.label].filter(Boolean).join(", ")}
      android_ripple={{
        color: g.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
        borderless: false,
      }}
      style={({ pressed }) => [
        styles.row,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: g.divider },
        pressed && { opacity: 0.85 },
      ]}
    >
      {icon ? (
        <View style={[styles.glyph, { backgroundColor: iconTint ?? g.tile }]}>{icon}</View>
      ) : null}

      <View style={styles.copy}>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
        >
          {title}
        </Text>
        {meta ? (
          <Text
            numberOfLines={2}
            style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          >
            {meta}
          </Text>
        ) : null}
      </View>

      {badge ? <StatusBadge kind={badge.kind} label={badge.label} size="sm" /> : null}
      {value}

      <ChevronRight size={16} color={chevronColor ?? theme.colors.mutedForeground} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
  },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 14.5,
    letterSpacing: -0.1,
  },
  meta: {
    fontSize: 11.5,
    lineHeight: 16,
  },
});

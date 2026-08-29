import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { GANESH_RADIUS, withAlpha } from "./surfaces";
import { useGaneshTokens } from "./tokens";

export type GaneshEmptyAction = {
  label: string;
  onPress: () => void;
};

export type GaneshEmptyStateProps = {
  /** The glyph for whatever is missing — a seva icon, a Gift, a Package. */
  icon: ReactNode;
  title: string;
  description?: string;
  action?: GaneshEmptyAction;
  compact?: boolean;
};

/**
 * Empty state for Ganesh Seva.
 *
 * Separate from `components/common/EmptyState` on purpose: that one carries the
 * Expense Tracker's finance illustrations and a "Pro Tip" card, neither of which
 * belongs in a pandal app. This one is quieter — a glyph in a niche, a sentence
 * that says what the screen is *for*, and one action.
 *
 * Copy rule: never "No data found". An empty seva list means the committee has
 * not planned anything yet, and the screen should say so in those words.
 */
export function GaneshEmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: GaneshEmptyStateProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  const niche = compact ? 48 : 64;

  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      accessibilityRole="summary"
      style={[styles.wrap, compact ? styles.compactWrap : styles.standardWrap]}
    >
      <View
        style={[
          styles.niche,
          {
            width: niche,
            height: niche,
            borderRadius: Math.round(niche * 0.34),
            backgroundColor: g.wash(g.saffron),
            borderColor: withAlpha(g.gold, 0.35),
          },
        ]}
      >
        {icon}
      </View>

      <Text
        style={[
          styles.title,
          {
            color: theme.colors.foreground,
            fontFamily: theme.fontFamily.semibold,
            fontSize: compact ? 15 : 17,
          },
        ]}
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={[
            styles.description,
            {
              color: theme.colors.mutedForeground,
              fontFamily: theme.fontFamily.regular,
              fontSize: compact ? 12.5 : 13.5,
              lineHeight: compact ? 18 : 20,
            },
          ]}
        >
          {description}
        </Text>
      ) : null}

      {action ? (
        <Button
          size={compact ? "sm" : "md"}
          style={styles.action}
          onPress={() => {
            void haptic.selection();
            action.onPress();
          }}
        >
          {action.label}
        </Button>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  standardWrap: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 10,
  },
  compactWrap: {
    paddingVertical: 18,
    paddingHorizontal: 12,
    gap: 7,
  },
  niche: {
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  title: {
    textAlign: "center",
    letterSpacing: -0.2,
  },
  description: {
    textAlign: "center",
    maxWidth: 300,
  },
  action: {
    marginTop: 6,
    minWidth: 190,
    borderRadius: GANESH_RADIUS.pill,
  },
});

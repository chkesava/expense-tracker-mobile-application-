import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertTriangle,
  ChevronRight,
  Flame,
  Sparkles,
  Target,
} from "lucide-react-native";

import { useInsightSurface } from "@/components/analytics/insightsTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type InsightAlertType = "success" | "warning" | "danger" | "neutral";

export interface InsightAlertCardProps {
  /** Comes straight from `getSmartInsight` — never re-derived here. */
  type: InsightAlertType;
  message: string;
  /** Renders a chevron and makes the card pressable. */
  onPress?: () => void;
}

const TITLES: Record<InsightAlertType, string> = {
  danger: "Overspending Alert",
  warning: "Budget Warning",
  success: "Financial Health",
  neutral: "No Budget Set",
};

export function InsightAlertCard({
  type,
  message,
  onPress,
}: InsightAlertCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = useInsightSurface();

  // SPENDLY-538: tones from the theme instead of fixed hexes.
  const accent =
    type === "danger"
      ? theme.colors.destructive
      : type === "warning"
        ? theme.colors.warning
        : type === "success"
          ? theme.colors.success
          : theme.colors.mutedForeground;

  const Icon =
    type === "danger"
      ? AlertTriangle
      : type === "warning"
        ? Flame
        : type === "success"
          ? Sparkles
          : Target;

  const body = (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[
          withAlpha(accent, isDark ? 0.16 : 0.09),
          withAlpha(accent, isDark ? 0.05 : 0.03),
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.iconBox,
          {
            backgroundColor: withAlpha(accent, isDark ? 0.16 : 0.1),
            borderColor: withAlpha(accent, isDark ? 0.34 : 0.2),
          },
        ]}
      >
        <Icon size={18} color={accent} strokeWidth={2.3} />
      </View>

      <View style={styles.copy}>
        <Text style={[styles.title, { color: accent }]} numberOfLines={1}>
          {TITLES[type].toUpperCase()}
        </Text>
        <Text
          style={[styles.body, { color: theme.colors.foreground }]}
          numberOfLines={3}
        >
          {message}
        </Text>
      </View>

      {onPress ? (
        <ChevronRight
          size={18}
          color={theme.colors.mutedForeground}
          strokeWidth={2.2}
        />
      ) : null}
    </>
  );

  const shell = [
    styles.card,
    {
      backgroundColor: surface.card,
      borderColor: withAlpha(accent, isDark ? 0.38 : 0.24),
    },
  ];

  if (!onPress) {
    return <View style={shell}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [shell, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  body: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.82,
  },
});

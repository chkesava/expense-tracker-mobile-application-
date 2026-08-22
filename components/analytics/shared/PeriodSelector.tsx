import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface PeriodSelectorProps {
  /** Already-formatted period label, e.g. "August 2026" or "2026". */
  label: string;
  /**
   * Badge text shown beside the label — "CURRENT", "THIS YEAR". Pass null for
   * a historical period so no live-period badge appears.
   */
  badge?: string | null;
  onPrev: () => void;
  onNext: () => void;
  prevLabel?: string;
  nextLabel?: string;
}

/** Shared previous / label / next strip used by the monthly and yearly views. */
export function PeriodSelector({
  label,
  badge,
  onPrev,
  onNext,
  prevLabel = "Previous month",
  nextLabel = "Next month",
}: PeriodSelectorProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);

  const renderArrow = (
    direction: "prev" | "next",
    onPress: () => void
  ) => (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={direction === "prev" ? prevLabel : nextLabel}
      style={({ pressed }) => [
        styles.arrow,
        {
          backgroundColor: surface.inset,
          borderColor: surface.insetBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      {direction === "prev" ? (
        <ChevronLeft size={18} color={theme.colors.foreground} strokeWidth={2.4} />
      ) : (
        <ChevronRight size={18} color={theme.colors.foreground} strokeWidth={2.4} />
      )}
    </Pressable>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surface.card, borderColor: surface.border },
      ]}
    >
      {renderArrow("prev", onPrev)}

      <View style={styles.center}>
        <Text
          style={[
            styles.label,
            { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {badge ? (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: accents.pinkDim,
                borderColor: isDark
                  ? "rgba(244, 63, 94, 0.32)"
                  : "rgba(220, 38, 38, 0.2)",
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: accents.pink }]} numberOfLines={1}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>

      {renderArrow("next", onNext)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  label: {
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  pressed: {
    opacity: 0.7,
  },
});

import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface YearlyInsightTile {
  id: string;
  label: string;
  icon: ReactNode;
  /** Accent used for the icon chip. */
  tintRgb: string;
  /** Headline — an already-formatted value or an `Amount` element. */
  value: ReactNode;
  /** Optional supporting line, e.g. an amount under a month name. */
  sub?: ReactNode;
}

/**
 * Compact secondary metrics. Only tiles the caller could compute from real
 * data are passed in, so an absent metric simply doesn't appear.
 */
export function YearlyInsightGrid({ tiles }: { tiles: YearlyInsightTile[] }) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);

  if (tiles.length === 0) return null;

  const isOdd = tiles.length % 2 === 1;

  return (
    <View style={styles.grid}>
      {tiles.map((tile, index) => {
        const spansRow = isOdd && index === tiles.length - 1;
        return (
          <View
            key={tile.id}
            style={[
              styles.tile,
              spansRow && styles.tileFull,
              {
                backgroundColor: surface.card,
                borderColor: surface.border,
              },
            ]}
          >
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: `rgba(${tile.tintRgb}, ${isDark ? 0.15 : 0.09})`,
                  borderColor: `rgba(${tile.tintRgb}, ${isDark ? 0.3 : 0.18})`,
                },
              ]}
            >
              {tile.icon}
            </View>
            <Text
              style={[styles.label, { color: theme.colors.mutedForeground }]}
              numberOfLines={2}
            >
              {tile.label}
            </Text>
            <View style={styles.valueSlot}>{tile.value}</View>
            {tile.sub ? <View style={styles.subSlot}>{tile.sub}</View> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Shared text style for a tile headline rendered as plain text. */
export function useYearlyTileTextStyles() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accents = insightAccents(isDark);
  // Stable identity so callers can memoise tile lists against it.
  return useMemo(
    () => ({
      value: { ...styles.value, color: theme.colors.foreground },
      sub: { ...styles.sub, color: theme.colors.mutedForeground },
      positive: { ...styles.value, color: accents.green },
      negative: { ...styles.value, color: accents.pink },
    }),
    [accents.green, accents.pink, theme.colors.foreground, theme.colors.mutedForeground]
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 0,
    padding: 13,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 5,
  },
  tileFull: {
    flexBasis: "100%",
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
  },
  valueSlot: {
    flexDirection: "row",
    alignItems: "center",
  },
  subSlot: {
    flexDirection: "row",
    alignItems: "center",
  },
  value: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: 11.5,
    fontWeight: "600",
  },
});

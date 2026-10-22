import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import type { MerchantMonogram } from "@/shared/utils/merchantMonogram";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Tile colours (SPENDLY-570). Data-viz hues with no brand or good/bad meaning;
 * one is picked per merchant from its id, so the same merchant always matches.
 * Keep the length equal to `MONOGRAM_PALETTE_SIZE`.
 */
export const MONOGRAM_COLORS: readonly string[] = [
  "#F97316",
  "#EC4899",
  "#8B5CF6",
  "#0EA5E9",
  "#14B8A6",
  "#F59E0B",
  "#6366F1",
  "#84CC16",
];

/** A merchant's initials on its tile colour; decorative (the row carries the name). */
export const MerchantMonogramTile = memo(function MerchantMonogramTile({
  monogram,
  size = 38,
}: {
  monogram: MerchantMonogram;
  size?: number;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const color = MONOGRAM_COLORS[monogram.colorIndex] ?? theme.colors.primary;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: withAlpha(color, surfaces.isDark ? 0.22 : 0.14),
          borderColor: withAlpha(color, surfaces.isDark ? 0.5 : 0.35),
        },
      ]}
    >
      <Text
        style={{
          color,
          fontFamily: theme.fontFamily.bold,
          fontSize: monogram.initials.length > 1 ? size * 0.36 : size * 0.44,
          letterSpacing: -0.3,
        }}
        numberOfLines={1}
      >
        {monogram.initials}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
});

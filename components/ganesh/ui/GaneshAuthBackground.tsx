import { StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/theme/ThemeProvider";

import { useGaneshTokens, withAlpha } from "./tokens";

/**
 * Login backdrop. Structurally identical to the Expense Tracker's
 * `AuthBackground` — same two soft blobs, same dot grid, same opacities — so
 * the two sign-in screens are recognisably the same product. Only the two
 * accent hues differ.
 */
export function GaneshAuthBackground() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { width } = useWindowDimensions();

  const base = theme.colors.background;
  const surface = theme.colors.card;
  const alpha = g.isDark ? 0.15 : 0.08;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]}>
      <LinearGradient colors={[base, surface]} style={StyleSheet.absoluteFill} />

      <View
        style={[
          styles.blob,
          {
            backgroundColor: withAlpha(g.saffron, alpha),
            width: width * 1.2,
            height: width * 1.2,
            borderRadius: width,
            top: -width * 0.4,
            left: -width * 0.3,
          },
        ]}
      />

      <View
        style={[
          styles.blob,
          {
            backgroundColor: withAlpha(g.maroon, alpha),
            width: width * 1.5,
            height: width * 1.5,
            borderRadius: width,
            top: -width * 0.2,
            right: -width * 0.6,
          },
        ]}
      />

      <View style={styles.pattern} pointerEvents="none">
        {Array.from({ length: 12 }).map((_, col) => (
          <View key={`col-${col}`} style={styles.patternCol}>
            {Array.from({ length: 8 }).map((_, row) => (
              <View
                key={`dot-${col}-${row}`}
                style={[
                  styles.dot,
                  {
                    backgroundColor: g.isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(15, 23, 42, 0.05)",
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: "absolute",
    opacity: 0.8,
  },
  pattern: {
    position: "absolute",
    top: 60,
    left: 20,
    flexDirection: "row",
    gap: 12,
  },
  patternCol: {
    flexDirection: "column",
    gap: 12,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 3,
  },
});

import { StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/theme/ThemeProvider";

export function AuthBackground() {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();

  const isDark = theme.colors.background === "#020817" || theme.colors.background === "#000000";

  // Light mode background matches the reference
  // Dark mode is a deep variant
  const baseColors = isDark 
    ? ["#0F172A", "#0B1120"] as const
    : ["#F6F9FC", "#FFFFFF"] as const;

  const accent1 = isDark ? "rgba(8, 117, 209, 0.15)" : "rgba(8, 117, 209, 0.08)";
  const accent2 = isDark ? "rgba(25, 199, 154, 0.15)" : "rgba(25, 199, 154, 0.08)";

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: baseColors[0] }]}>
      <LinearGradient
        colors={[baseColors[0], baseColors[1]]}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Top Left Blob (Blue-ish) */}
      <View
        style={[
          styles.blob,
          {
            backgroundColor: accent1,
            width: width * 1.2,
            height: width * 1.2,
            borderRadius: width,
            top: -width * 0.4,
            left: -width * 0.3,
          },
        ]}
      />

      {/* Top Right / Mid Right Wave (Teal-ish) */}
      <View
        style={[
          styles.blob,
          {
            backgroundColor: accent2,
            width: width * 1.5,
            height: width * 1.5,
            borderRadius: width,
            top: -width * 0.2,
            right: -width * 0.6,
          },
        ]}
      />

      {/* Dotted Pattern Overlay (CSS grid simulation) */}
      <View style={styles.patternContainer}>
        {Array.from({ length: 12 }).map((_, col) => (
          <View key={`col-${col}`} style={{ flexDirection: "column", gap: 12 }}>
            {Array.from({ length: 8 }).map((_, row) => (
              <View
                key={`dot-${col}-${row}`}
                style={[
                  styles.dot,
                  { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(15, 47, 75, 0.05)" },
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
    transform: [{ scale: 1 }],
  },
  patternContainer: {
    position: "absolute",
    top: 60,
    left: 20,
    flexDirection: "row",
    gap: 12,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 3,
  },
});

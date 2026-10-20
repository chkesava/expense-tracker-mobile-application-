import { StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AuraBackground } from "@/components/layout/AuraBackground";
import { ACTIVE_PRODUCT } from "@/lib/activeProduct";
import { legacyAuthBackground, usesExpenseLook } from "@/lib/authLook";
import { useTheme } from "@/theme/ThemeProvider";

export function AuthBackground() {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();

  // SPENDLY-556: Expense uses the app's own background and aura glow, so
  // sign-in reads as the same product. Nutrition keeps the previous artwork.
  if (usesExpenseLook(ACTIVE_PRODUCT)) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]}>
        <AuraBackground />
      </View>
    );
  }

  const legacy = legacyAuthBackground(theme);
  const baseColors = legacy.base;
  const accent1 = legacy.accent1;
  const accent2 = legacy.accent2;

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
                  { backgroundColor: legacy.dot },
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

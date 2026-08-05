import { StyleSheet, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function AuraBackground() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <View pointerEvents="none" style={styles.container}>
      {/* Primary ambient top-right glow */}
      <View
        style={[
          styles.glowOrb,
          {
            top: -80,
            right: -60,
            width: 260,
            height: 260,
            borderRadius: 130,
            backgroundColor: theme.colors.primary,
            opacity: isDark ? 0.12 : 0.08,
          },
        ]}
      />

      {/* Secondary accent glow bottom-left */}
      <View
        style={[
          styles.glowOrb,
          {
            bottom: 120,
            left: -80,
            width: 280,
            height: 280,
            borderRadius: 140,
            backgroundColor: isDark ? "#38BDF8" : "#818CF8",
            opacity: isDark ? 0.08 : 0.05,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  glowOrb: {
    position: "absolute",
  },
});

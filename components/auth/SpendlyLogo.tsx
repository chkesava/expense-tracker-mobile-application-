import { Image, StyleSheet, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

export function SpendlyLogo({ size = 80 }: { size?: number }) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { padding: size * 0.25 }]}>
      {/* Outer subtle rings */}
      <View
        style={[
          styles.ring1,
          {
            borderColor: theme.colors.border,
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size * 1.5,
          },
        ]}
      />
      <View
        style={[
          styles.ring2,
          {
            borderColor: theme.colors.border,
            width: size * 1.25,
            height: size * 1.25,
            borderRadius: size * 1.25,
          },
        ]}
      />
      
      {/* Small accent dots inspired by the reference image */}
      <View style={[styles.dot, { backgroundColor: theme.colors.primary, top: '15%', right: '-5%', width: 6, height: 6 }]} />
      <View style={[styles.dot, { backgroundColor: theme.colors.primary, bottom: '25%', left: '-15%', width: 5, height: 5 }]} />

      {/* Actual Logo container */}
      <View
        style={[
          styles.logoWrapper,
          {
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: theme.colors.card,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
          },
        ]}
      >
        <Image
          source={require("@/assets/branding/icon.png")}
          style={{ width: size * 0.6, height: size * 0.6, resizeMode: "contain", borderRadius: size * 0.15 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ring1: {
    position: "absolute",
    borderWidth: 1,
    opacity: 0.4,
  },
  ring2: {
    position: "absolute",
    borderWidth: 1,
    opacity: 0.6,
  },
  logoWrapper: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  dot: {
    position: "absolute",
    borderRadius: 10,
    opacity: 0.8,
  }
});

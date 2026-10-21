import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Activity } from "lucide-react-native";

import { APP_BAR_TOUCH_SIZE } from "@/components/layout/chrome";
import { isLocalTestMode } from "@/lib/env";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/**
 * The app-bar brand button, shared by `Header` and the dashboard hero
 * (SPENDLY-566). `ink` overrides the text colour when the brand sits on an
 * image; the local-test pill (SPENDLY-175) always comes along.
 */
export function AppBarBrand({ ink }: { ink?: string }) {
  const { push } = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const onImage = Boolean(ink);
  const ripple = isDark || onImage ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)";

  const handleLogoPress = () => {
    void haptic.navigation();
    push("/dashboard" as never);
  };

  return (
    <Pressable
      onPress={handleLogoPress}
      android_ripple={{ color: ripple, borderless: false }}
      style={({ pressed }) => [styles.logoButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Go to dashboard"
    >
      <View
        style={[
          styles.logoIcon,
          {
            backgroundColor: onImage
              ? theme.colors.primary
              : isDark
                ? theme.colors.secondary
                : "#1E293B",
          },
        ]}
      >
        <Activity size={15} color="#FFFFFF" strokeWidth={2.6} />
      </View>
      <Text
        style={[
          styles.logoText,
          {
            color: ink ?? theme.colors.foreground,
            fontFamily: theme.fontFamily.bold,
          },
        ]}
      >
        Vault
      </Text>
      {LOCAL_TEST_MODE ? (
        // SPENDLY-175: a local test build must never pass for the real app.
        <View
          style={[styles.testPill, { backgroundColor: theme.colors.warning }]}
          accessibilityLabel="Test data, local emulator"
        >
          <Text
            style={[
              styles.testPillText,
              { color: theme.colors.warningForeground, fontFamily: theme.fontFamily.bold },
            ]}
          >
            TEST DATA
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Build-time constant: the flag is inlined into the bundle. */
const LOCAL_TEST_MODE = isLocalTestMode();

const styles = StyleSheet.create({
  logoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: APP_BAR_TOUCH_SIZE,
    paddingRight: 8,
    borderRadius: 12,
  },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  pressed: {
    opacity: 0.72,
  },
  testPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  testPillText: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
});

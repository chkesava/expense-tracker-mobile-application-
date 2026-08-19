import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Activity } from "lucide-react-native";

import {
  APP_BAR_CONTENT_HEIGHT,
  APP_BAR_HORIZONTAL_PADDING,
  APP_BAR_TOUCH_SIZE,
} from "@/components/layout/chrome";
import { AppBarActions } from "@/components/layout/AppBarActions";
import { MonthDrawer } from "@/components/MonthDrawer";
import { SideDrawer } from "@/components/SideDrawer";
import { haptic } from "@/lib/haptics";
import { isAccountDetailRoute } from "@/shared/config/navigation";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function Header() {
  const { push } = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleLogoPress = () => {
    void haptic.navigation();
    push("/dashboard" as never);
  };

  const ripple = isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)";

  return (
    <>
      {isAccountDetailRoute(pathname) ? null : (
        <View
          style={[
            styles.container,
            {
              paddingTop: insets.top,
              backgroundColor: isDark ? theme.colors.background : theme.colors.card,
              borderBottomColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <View style={styles.content}>
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
                  { backgroundColor: isDark ? theme.colors.secondary : "#1E293B" },
                ]}
              >
                <Activity size={15} color="#FFFFFF" strokeWidth={2.6} />
              </View>
              <Text
                style={[
                  styles.logoText,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.bold,
                  },
                ]}
              >
                Vault
              </Text>
            </Pressable>

            <AppBarActions onOpenProfile={() => setIsDrawerOpen(true)} />
          </View>
        </View>
      )}

      <MonthDrawer />
      <SideDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}

export default Header;

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 80,
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  content: {
    height: APP_BAR_CONTENT_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: APP_BAR_HORIZONTAL_PADDING,
  },
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
});

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Activity, Bell, Search } from "lucide-react-native";

import {
  APP_BAR_CONTENT_HEIGHT,
  APP_BAR_HORIZONTAL_PADDING,
  APP_BAR_ICON_SIZE,
  APP_BAR_TOUCH_SIZE,
} from "@/components/layout/chrome";
import { MonthDrawer } from "@/components/MonthDrawer";
import { SideDrawer } from "@/components/SideDrawer";
import { useSmsReviewInbox } from "@/hooks/useSmsReviewInbox";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function Header() {
  const { push } = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { count: inboxCount } = useSmsReviewInbox();
  const hasUnread = inboxCount > 0;

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleLogoPress = () => {
    void haptic.navigation();
    push("/dashboard" as never);
  };

  const handleSearch = () => {
    void haptic.navigation();
    push("/ledger" as never);
  };

  const handleNotifications = () => {
    void haptic.navigation();
    push("/sms-inbox" as never);
  };

  const handleOpenProfile = () => {
    void haptic.navigation();
    setIsDrawerOpen(true);
  };

  const iconColor = theme.colors.foreground;
  const ripple = isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)";

  return (
    <>
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
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Activity size={15} color={theme.colors.primaryForeground} strokeWidth={2.6} />
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

          <View style={styles.rightSection}>
            <Pressable
              onPress={handleSearch}
              android_ripple={{ color: ripple, borderless: true, radius: 24 }}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Search transactions"
            >
              <Search size={APP_BAR_ICON_SIZE} color={iconColor} strokeWidth={2} />
            </Pressable>

            <Pressable
              onPress={handleNotifications}
              android_ripple={{ color: ripple, borderless: true, radius: 24 }}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={
                hasUnread
                  ? `Notifications, ${inboxCount} unread`
                  : "Notifications"
              }
            >
              <Bell size={APP_BAR_ICON_SIZE} color={iconColor} strokeWidth={2} />
              {hasUnread ? (
                <View
                  style={[
                    styles.unreadDot,
                    {
                      backgroundColor: theme.colors.success,
                      borderColor: isDark ? theme.colors.background : theme.colors.card,
                    },
                  ]}
                />
              ) : null}
            </Pressable>

            <Pressable
              onPress={handleOpenProfile}
              android_ripple={{
                color: "rgba(255,255,255,0.25)",
                borderless: true,
                radius: 24,
              }}
              style={({ pressed }) => [
                styles.avatarHit,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open profile and settings"
            >
              <View style={styles.avatarButton}>
                <Text style={styles.avatarText}>
                  {(
                    user?.displayName?.[0] ||
                    user?.email?.[0] ||
                    "U"
                  ).toUpperCase()}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>

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
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    width: APP_BAR_TOUCH_SIZE,
    height: APP_BAR_TOUCH_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: APP_BAR_TOUCH_SIZE / 2,
  },
  unreadDot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  avatarHit: {
    width: APP_BAR_TOUCH_SIZE,
    height: APP_BAR_TOUCH_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FBBF24",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1C1917",
  },
  pressed: {
    opacity: 0.72,
  },
});

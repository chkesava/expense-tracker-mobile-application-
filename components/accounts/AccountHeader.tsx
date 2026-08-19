import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Activity, ArrowLeft, CreditCard, Pencil } from "lucide-react-native";

import { AppBarActions } from "@/components/layout/AppBarActions";
import {
  APP_BAR_HORIZONTAL_PADDING,
  APP_BAR_TOUCH_SIZE,
} from "@/components/layout/chrome";
import { SideDrawer } from "@/components/SideDrawer";
import {
  accountAccent,
  CARD_PURPLE,
  shadeCardAccent,
} from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function AccountHeader({
  title,
  subtitle,
  warning,
  variant = "default",
  accentColor,
  onBack,
  onEdit,
}: {
  title: string;
  subtitle: string;
  warning?: ReactNode;
  variant?: "default" | "credit";
  accentColor?: string;
  onBack: () => void;
  onEdit?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const accent = accountAccent(isDark);
  const ripple = isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)";
  const isCredit = variant === "credit";
  const cardAccent = accentColor || CARD_PURPLE;

  return (
    <>
      <View
        style={[
          styles.wrap,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <View style={styles.row}>
          <Pressable
            onPress={() => {
              void haptic.navigation();
              onBack();
            }}
            android_ripple={{ color: ripple, borderless: true, radius: 24 }}
            style={({ pressed }) => [styles.iconHit, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={22} color={theme.colors.foreground} strokeWidth={2.2} />
          </Pressable>

          {isCredit ? (
            <LinearGradient
              colors={[cardAccent, shadeCardAccent(cardAccent)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.creditIcon,
                {
                  boxShadow: isDark
                    ? "0 0 16px rgba(109, 90, 230, 0.45)"
                    : "0 4px 10px rgba(67, 56, 202, 0.28)",
                },
              ]}
            >
              <CreditCard size={16} color="#FFFFFF" strokeWidth={2.2} />
            </LinearGradient>
          ) : (
            <View
              style={[
                styles.logoIcon,
                { backgroundColor: isDark ? "#111827" : "#1E293B" },
              ]}
            >
              <Activity size={15} color={accent} strokeWidth={2.6} />
            </View>
          )}

          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.title,
                  isCredit ? styles.creditTitle : null,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.bold,
                  },
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
              {onEdit ? (
                <Pressable
                  onPress={() => {
                    void haptic.impact();
                    onEdit();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Edit account"
                  style={({ pressed }) => [styles.editHit, pressed && styles.pressed]}
                >
                  <Pencil size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />
                </Pressable>
              ) : null}
            </View>
            {subtitle ? (
              <Text
                style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          <AppBarActions onOpenProfile={() => setIsDrawerOpen(true)} />
        </View>
        {warning ? <View style={styles.warning}>{warning}</View> : null}
      </View>
      <SideDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 80,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: APP_BAR_HORIZONTAL_PADDING - 8,
    gap: 8,
  },
  iconHit: {
    width: APP_BAR_TOUCH_SIZE,
    height: APP_BAR_TOUCH_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: APP_BAR_TOUCH_SIZE / 2,
  },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  creditIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  creditTitle: {
    fontSize: 17,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
  },
  editHit: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  warning: {
    paddingHorizontal: APP_BAR_HORIZONTAL_PADDING,
    paddingBottom: 8,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.72,
  },
});

import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { ACCOUNT_GREEN } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function SettingsGroupLabel({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.mutedForeground,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginLeft: 4,
        marginBottom: 2,
      }}
    >
      {label}
    </Text>
  );
}

export function SettingsHubRow({
  title,
  subtitle,
  icon: Icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
  }>;
  onPress: () => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: isDark ? "#10141C" : theme.colors.card,
          borderColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: isDark
              ? "rgba(74, 222, 128, 0.12)"
              : "rgba(22, 163, 74, 0.1)",
            borderColor: isDark
              ? "rgba(74, 222, 128, 0.28)"
              : "rgba(22, 163, 74, 0.2)",
          },
        ]}
      >
        <Icon size={18} color={isDark ? ACCOUNT_GREEN : theme.colors.success} strokeWidth={2.2} />
      </View>
      <View style={styles.copy}>
        <Text
          style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
});

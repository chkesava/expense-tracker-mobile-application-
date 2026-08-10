import { StyleSheet, Text, View } from "react-native";
import { Wallet } from "lucide-react-native";

import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardWelcome() {
  const { user } = useAuth();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const firstName =
    user?.displayName?.trim()?.split(/\s+/)[0] ||
    user?.email?.split("@")[0] ||
    "there";
  const greeting = greetingForHour(new Date().getHours());

  return (
    <View style={styles.container}>
      <View style={styles.textCol}>
        <Text
          style={[styles.greeting, { color: theme.colors.mutedForeground }]}
          numberOfLines={1}
        >
          {greeting}, {firstName}! 👋
        </Text>
        <Text
          style={[
            styles.title,
            { color: theme.colors.foreground, fontSize: theme.typography.xxl },
          ]}
          numberOfLines={1}
        >
          Dashboard
        </Text>
        <Text
          style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
          numberOfLines={1}
        >
          Your financial overview
        </Text>
      </View>

      <View
        style={[
          styles.visual,
          {
            backgroundColor: isDark
              ? "rgba(124, 58, 237, 0.18)"
              : "rgba(79, 70, 255, 0.1)",
            borderColor: isDark
              ? "rgba(168, 85, 247, 0.35)"
              : "rgba(79, 70, 255, 0.2)",
          },
        ]}
      >
        <View
          style={[
            styles.visualInner,
            {
              backgroundColor: isDark
                ? "rgba(124, 58, 237, 0.45)"
                : "rgba(79, 70, 255, 0.85)",
            },
          ]}
        >
          <Wallet size={26} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <View
          style={[
            styles.coin,
            styles.coinTop,
            { backgroundColor: "#FBBF24", borderColor: "#F59E0B" },
          ]}
        />
        <View
          style={[
            styles.coin,
            styles.coinBottom,
            { backgroundColor: "#34D399", borderColor: "#059669" },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 12,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  greeting: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  title: {
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  visual: {
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  visualInner: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  coin: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  coinTop: {
    top: 8,
    right: 8,
  },
  coinBottom: {
    bottom: 10,
    left: 8,
  },
});

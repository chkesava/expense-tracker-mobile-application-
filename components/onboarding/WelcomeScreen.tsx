import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { SlideInUp } from "react-native-reanimated";
import { ArrowRight, Compass, Sparkles, Wand2 } from "lucide-react-native";

import { useAuth } from "@/providers/AuthProvider";
import { useSetupProgress } from "@/providers/SetupProgressProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

function getFriendlyFirstName(rawName?: string): string {
  if (!rawName) return "there";
  const beforeAt = rawName.split("@")[0].trim();
  const parts = beforeAt.split(/[\s\-_.]+/);
  const first = parts[0] || "";
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function WelcomeScreen() {
  const { user } = useAuth();
  const { data } = useUserDoc();
  const { isFirstLaunch, completeWelcome, launchSetupWizard } = useSetupProgress();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const [visible, setVisible] = useState(isFirstLaunch);

  useEffect(() => {
    setVisible(isFirstLaunch);
  }, [isFirstLaunch]);

  if (!isFirstLaunch || !visible) {
    return null;
  }

  const rawName = data?.username || user?.displayName || user?.email || "";
  const firstName = getFriendlyFirstName(rawName);

  const handleStartWizard = () => {
    haptic.medium().catch(() => undefined);
    setVisible(false);
    completeWelcome();
    launchSetupWizard(0);
  };

  const handleExploreOnOwn = () => {
    haptic.selection().catch(() => undefined);
    setVisible(false);
    completeWelcome();
  };

  return (
    <Modal
      visible={visible && isFirstLaunch}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleExploreOnOwn}
    >
      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.72)" }]}>
        <Animated.View
          entering={SlideInUp.duration(350).springify().damping(18)}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: isDark ? "rgba(107, 99, 255, 0.3)" : "rgba(79, 70, 255, 0.2)",
            },
          ]}
        >
          {/* Animated Hero Badge */}
          <View
            style={[
              styles.heroIconBadge,
              { backgroundColor: isDark ? "rgba(107, 99, 255, 0.18)" : "rgba(79, 70, 255, 0.1)" },
            ]}
          >
            <Sparkles size={36} color={theme.colors.primary} />
          </View>

          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            Welcome, {firstName}!
          </Text>

          <Text style={[styles.subtitle, { color: theme.colors.primary }]}>
            Your Personal Finance Hub
          </Text>

          <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>
            Let's set up your profile, primary currency, initial accounts, and spending goals in under 2 minutes.
          </Text>

          <View style={[styles.pill, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }]}>
            <Text style={[styles.pillText, { color: theme.colors.mutedForeground }]}>
              ⏱ 5 quick steps • Fully customizable later
            </Text>
          </View>

          {/* Primary CTA: Launch Setup Wizard */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.colors.primary },
              pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
            ]}
            onPress={handleStartWizard}
            accessibilityRole="button"
            accessibilityLabel="Start interactive setup wizard"
          >
            <Wand2 size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>
              Start Setup Wizard
            </Text>
            <ArrowRight size={18} color="#FFFFFF" />
          </Pressable>

          {/* Secondary CTA: Explore on Own */}
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleExploreOnOwn}
            accessibilityRole="button"
            accessibilityLabel="Explore on my own"
          >
            <Compass size={16} color={theme.colors.mutedForeground} />
            <Text style={[styles.secondaryButtonText, { color: theme.colors.mutedForeground }]}>
              Explore on my own
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    padding: 28,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  heroIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  body: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 18,
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 24,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  primaryButton: {
    width: "100%",
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 10,
    elevation: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
});

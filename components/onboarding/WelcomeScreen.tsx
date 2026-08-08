import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, SlideInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/providers/AuthProvider";
import { useSetupProgress } from "@/providers/SetupProgressProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import { useTheme } from "@/theme/ThemeProvider";

function getFriendlyFirstName(rawName?: string): string {
  if (!rawName) return "there";
  // Remove email domain if it's an email
  const beforeAt = rawName.split("@")[0].trim();
  // Split on hyphens, underscores, dots, or spaces (e.g., "kesava-main-expense-tracking" -> "kesava")
  const parts = beforeAt.split(/[\s\-_.]+/);
  const first = parts[0] || "";
  if (!first) return "there";
  // Capitalize first letter cleanly
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function WelcomeScreen() {
  const { user } = useAuth();
  const { data } = useUserDoc();
  const { isFirstLaunch, completeWelcome } = useSetupProgress();
  const { theme } = useTheme();

  const [visible, setVisible] = useState(isFirstLaunch);

  useEffect(() => {
    setVisible(isFirstLaunch);
  }, [isFirstLaunch]);

  if (!isFirstLaunch || !visible) {
    return null;
  }

  const rawName = data?.username || user?.displayName || user?.email || "";
  const firstName = getFriendlyFirstName(rawName);

  const handleStart = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setVisible(false);
    completeWelcome();
  };

  return (
    <Modal
      visible={visible && isFirstLaunch}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleStart}
    >
      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
        <Animated.View
          entering={SlideInUp.duration(350).springify().damping(18)}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={styles.emoji}>👋</Text>

          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            Welcome, {firstName}!
          </Text>

          <Text
            style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
          >
            Welcome to Expense Tracker
          </Text>

          <Text style={[styles.body, { color: theme.colors.foreground }]}>
            Let's set up your financial workspace.
          </Text>

          <View
            style={[styles.pill, { backgroundColor: theme.colors.background }]}
          >
            <Text
              style={[styles.pillText, { color: theme.colors.mutedForeground }]}
            >
              ⏱ Estimated: 2-3 minutes
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.colors.primary },
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
            onPress={handleStart}
          >
            <Text
              style={[
                styles.buttonText,
                { color: theme.colors.primaryForeground || "#ffffff" },
              ]}
            >
              Get Started
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
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 12,
    textAlign: "center",
    fontWeight: "600",
  },
  body: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 24,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
  },
});

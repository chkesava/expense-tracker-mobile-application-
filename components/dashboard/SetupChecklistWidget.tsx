import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { SetupStepItem } from "@/components/onboarding/SetupStepItem";
import {
  useSetupProgress,
  type SetupStep,
} from "@/providers/SetupProgressProvider";
import { useTheme } from "@/theme/ThemeProvider";

export function SetupChecklistWidget() {
  const {
    steps,
    completedCount,
    totalCount,
    progress,
    isOnboarding,
    dismissOnboarding,
  } = useSetupProgress();
  const { theme } = useTheme();

  const progressWidth = useSharedValue(0);

  useEffect(() => {
    progressWidth.value = withSpring(progress, {
      damping: 20,
      stiffness: 90,
    });
  }, [progress, progressWidth]);

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: `${Math.round(progressWidth.value * 100)}%`,
    };
  });

  if (!isOnboarding) {
    return null;
  }

  const handleDismiss = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    dismissOnboarding();
  };

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(15)}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.foreground }]}>
          Getting Started
        </Text>
        <Text style={[styles.progressText, { color: theme.colors.primary }]}>
          {completedCount} / {totalCount} Completed
        </Text>
      </View>

      <View
        style={[
          styles.progressBarBg,
          { backgroundColor: theme.colors.border },
        ]}
      >
        <Animated.View
          style={[
            styles.progressBarFill,
            { backgroundColor: theme.colors.primary },
            progressStyle,
          ]}
        />
      </View>

      <View style={styles.list}>
        {steps.map((step: SetupStep) => (
          <SetupStepItem
            key={step.id}
            label={step.label}
            completed={step.completed}
            onPress={step.completed ? undefined : step.onNavigate}
          />
        ))}
      </View>

      <Pressable
        onPress={handleDismiss}
        style={({ pressed }) => [
          styles.dismissButton,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text
          style={[
            styles.dismissText,
            { color: theme.colors.mutedForeground },
          ]}
        >
          Dismiss
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  progressText: {
    fontSize: 13,
    fontWeight: "700",
  },
  progressBarBg: {
    height: 7,
    borderRadius: 4,
    width: "100%",
    marginBottom: 16,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  list: {
    marginBottom: 12,
  },
  dismissButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dismissText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

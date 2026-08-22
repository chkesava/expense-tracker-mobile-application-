import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Sparkles, Wand2 } from "lucide-react-native";

import { SetupStepItem } from "@/components/onboarding/SetupStepItem";
import {
  useSetupProgress,
  type SetupStep,
} from "@/providers/SetupProgressProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

export function SetupChecklistWidget() {
  const {
    steps,
    completedCount,
    totalCount,
    progress,
    isOnboarding,
    dismissOnboarding,
    launchSetupWizard,
  } = useSetupProgress();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const progressWidth = useSharedValue(0);

  useEffect(() => {
    progressWidth.value = withSpring(progress, {
      damping: 18,
      stiffness: 90,
    });
  }, [progress, progressWidth]);

  const animatedProgressStyle = useAnimatedStyle(() => {
    return {
      width: `${Math.round(progressWidth.value * 100)}%`,
    };
  });

  if (!isOnboarding) {
    return null;
  }

  const handleDismiss = () => {
    haptic.light().catch(() => undefined);
    dismissOnboarding();
  };

  const handleStartWizard = () => {
    haptic.selection().catch(() => undefined);
    // Find the first uncompleted step or start from step 0
    const firstPendingIdx = steps.findIndex((s) => !s.completed);
    launchSetupWizard(firstPendingIdx >= 0 ? Math.min(firstPendingIdx, 4) : 0);
  };

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(15)}
      style={[
        styles.card,
        theme.elevation[2],
        {
          backgroundColor: theme.colors.card,
          borderColor: isDark ? "rgba(107, 99, 255, 0.25)" : "rgba(79, 70, 255, 0.15)",
        },
      ]}
    >
      {/* Header: Title & Progress Counter */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Sparkles size={18} color={theme.colors.primary} />
          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            Getting Started
          </Text>
        </View>

        <View
          style={[
            styles.badge,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.18)"
                : "rgba(79, 70, 255, 0.1)",
            },
          ]}
        >
          <Text style={[styles.progressText, { color: theme.colors.primary }]}>
            {completedCount} / {totalCount} Completed
          </Text>
        </View>
      </View>

      {/* Segmented Block Progress Bar (10 Segment Units) */}
      <View style={styles.segmentsRow}>
        {Array.from({ length: totalCount || 10 }).map((_, index) => {
          const isFilled = index < completedCount;
          return (
            <View
              key={index}
              style={[
                styles.segmentBlock,
                {
                  backgroundColor: isFilled
                    ? theme.colors.primary
                    : isDark
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(0, 0, 0, 0.08)",
                },
              ]}
            />
          );
        })}
      </View>

      {/* Continuous Smooth Progress Bar */}
      <View
        style={[
          styles.progressBarBg,
          { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
        ]}
      >
        <Animated.View
          style={[
            styles.progressBarFill,
            { backgroundColor: theme.colors.primary },
            animatedProgressStyle,
          ]}
        />
      </View>

      {/* Setup Wizard Quick CTA */}
      {completedCount < totalCount && (
        <Pressable
          onPress={handleStartWizard}
          android_ripple={{
            color: "rgba(255, 255, 255, 0.2)",
            borderless: false,
          }}
          style={({ pressed }) => [
            styles.wizardCta,
            { backgroundColor: theme.colors.primary },
            pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Launch Setup Wizard"
        >
          <Wand2 size={16} color="#FFFFFF" />
          <Text style={styles.wizardCtaText}>
            Launch Setup Wizard
          </Text>
        </Pressable>
      )}

      {/* 10 Checklist Step Items */}
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

      {/* Dismiss Action */}
      <Pressable
        onPress={handleDismiss}
        style={({ pressed }) => [
          styles.dismissButton,
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Dismiss Getting Started Checklist"
      >
        <Text
          style={[
            styles.dismissText,
            { color: theme.colors.mutedForeground },
          ]}
        >
          Dismiss Checklist
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "800",
  },
  segmentsRow: {
    flexDirection: "row",
    gap: 4,
    width: "100%",
    marginBottom: 8,
  },
  segmentBlock: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  progressBarBg: {
    height: 3,
    borderRadius: 2,
    width: "100%",
    marginBottom: 16,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  wizardCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 42,
    borderRadius: 12,
    marginBottom: 12,
  },
  wizardCtaText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  list: {
    marginBottom: 8,
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

import React, { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Sparkles, Trophy, X } from "lucide-react-native";
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";

import { ConfettiCannon } from "@/components/common/ConfettiCannon";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function CelebrationOverlay() {
  const { currentCelebration, dismissCelebration } = useCelebration();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const emojiScale = useSharedValue(0.5);
  const glowPulse = useSharedValue(1);

  useEffect(() => {
    if (currentCelebration) {
      void haptic.success();

      // Bounce emoji in with spring
      emojiScale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 220 }),
        withSpring(1, { damping: 12, stiffness: 180 })
      );

      // Subtle breathing pulse for the background glow
      glowPulse.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 900 }),
          withTiming(0.95, { duration: 900 })
        ),
        -1,
        true
      );
    } else {
      // This overlay stays mounted for the whole app session (rendered once
      // at the root), so an infinite withRepeat left running after dismiss
      // would animate on the UI thread forever in the background. Stop it
      // and reset to the resting value once there's nothing to show.
      cancelAnimation(glowPulse);
      glowPulse.value = 1;
    }
  }, [currentCelebration, emojiScale, glowPulse]);

  // Safety net: stop the repeating animation if the overlay itself ever unmounts.
  useEffect(() => {
    return () => cancelAnimation(glowPulse);
  }, [glowPulse]);

  const animatedEmojiStyle = useAnimatedStyle(() => ({
    transform: [{ scale: emojiScale.value }],
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowPulse.value }],
  }));

  if (!currentCelebration) return null;

  return (
    <Modal
      visible={!!currentCelebration}
      transparent
      animationType="none"
      onRequestClose={dismissCelebration}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Subtle Particle Confetti Burst */}
        <ConfettiCannon count={45} />

        <Animated.View
          entering={ZoomIn.springify().damping(12).stiffness(180)}
          exiting={FadeOut.duration(150)}
          style={[
            styles.card,
            theme.elevation[4],
            {
              backgroundColor: theme.colors.card,
              borderColor: isDark
                ? "rgba(234, 179, 8, 0.4)"
                : "rgba(234, 179, 8, 0.3)",
            },
          ]}
        >
          {/* Close Button */}
          <Pressable
            onPress={() => {
              void haptic.selection();
              dismissCelebration();
            }}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close celebration"
          >
            <X size={18} color={theme.colors.mutedForeground} />
          </Pressable>

          {/* Glowing Badge & Animated Emoji */}
          <View style={styles.badgeWrapper}>
            <Animated.View
              style={[
                styles.iconGlow,
                {
                  backgroundColor: isDark
                    ? "rgba(234, 179, 8, 0.18)"
                    : "rgba(234, 179, 8, 0.12)",
                },
                animatedGlowStyle,
              ]}
            />
            <Animated.View style={[styles.emojiContainer, animatedEmojiStyle]}>
              <Text style={styles.emoji}>
                {currentCelebration.badgeEmoji || "🎉"}
              </Text>
            </Animated.View>
          </View>

          {/* Titles */}
          <Text
            style={[styles.title, { color: theme.colors.foreground }]}
            numberOfLines={2}
          >
            {currentCelebration.title}
          </Text>

          {currentCelebration.subtitle && (
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.mutedForeground },
              ]}
            >
              {currentCelebration.subtitle}
            </Text>
          )}

          {/* Points / XP Pill */}
          {currentCelebration.pointsEarned ? (
            <Animated.View
              entering={FadeIn.delay(200).duration(300)}
              style={[
                styles.pointsPill,
                {
                  backgroundColor: isDark
                    ? "rgba(234, 179, 8, 0.18)"
                    : "rgba(234, 179, 8, 0.1)",
                  borderColor: "rgba(234, 179, 8, 0.3)",
                },
              ]}
            >
              <Sparkles size={14} color="#EAB308" />
              <Text style={styles.pointsText}>
                +{currentCelebration.pointsEarned} XP Earned!
              </Text>
            </Animated.View>
          ) : null}

          {/* Action button */}
          <Button
            onPress={() => {
              void haptic.selection();
              dismissCelebration();
            }}
            style={styles.btn}
          >
            <Trophy size={16} color="#FFFFFF" />
            <Text style={styles.btnText}>Awesome!</Text>
          </Button>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    padding: 26,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 12,
    position: "relative",
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  badgeWrapper: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    position: "relative",
  },
  iconGlow: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  emojiContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 42,
  },
  title: {
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  pointsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 2,
  },
  pointsText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#EAB308",
  },
  btn: {
    width: "100%",
    marginTop: 8,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnText: {
    fontWeight: "800",
    color: "#FFFFFF",
    fontSize: 15,
  },
});

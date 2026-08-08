import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";

interface OnboardingCardProps {
  emoji: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function OnboardingCard({
  emoji,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: OnboardingCardProps) {
  const { theme } = useTheme();

  const handleAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAction();
  };

  const handleSecondary = () => {
    if (onSecondary) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSecondary();
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(15)}
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.description, { color: theme.colors.mutedForeground }]}>
            {description}
          </Text>
        </View>
      </View>
      
      <View style={styles.actions}>
        {secondaryLabel && onSecondary && (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              { backgroundColor: theme.colors.background },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleSecondary}
          >
            <Text style={[styles.buttonText, { color: theme.colors.foreground }]}>
              {secondaryLabel}
            </Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            { backgroundColor: theme.colors.primary },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleAction}
        >
          <Text style={[styles.buttonText, { color: theme.colors.background }]}>
            {actionLabel}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginVertical: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  emoji: {
    fontSize: 40,
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    // primary specific styles if needed
  },
  secondaryButton: {
    // secondary specific styles if needed
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
});

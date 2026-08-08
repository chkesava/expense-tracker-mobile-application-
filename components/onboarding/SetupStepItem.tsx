import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { Layout, FadeIn, FadeOut } from "react-native-reanimated";
import { Check } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";

interface SetupStepItemProps {
  label: string;
  completed: boolean;
  onPress?: () => void;
}

export function SetupStepItem({ label, completed, onPress }: SetupStepItemProps) {
  const { theme } = useTheme();

  return (
    <Animated.View layout={Layout.springify().damping(15)}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
          styles.container,
          pressed && onPress && { opacity: 0.7 },
        ]}
      >
        <View style={styles.iconContainer}>
          {completed ? (
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              style={[styles.circle, { backgroundColor: theme.colors.success, borderColor: theme.colors.success }]}
            >
              <Check size={14} color="#fff" strokeWidth={3} />
            </Animated.View>
          ) : (
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              style={[styles.circle, { borderColor: theme.colors.border }]}
            />
          )}
        </View>

        <Text
          style={[
            styles.label,
            { color: completed ? theme.colors.mutedForeground : theme.colors.foreground },
            completed && styles.completedLabel,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
  },
  completedLabel: {
    textDecorationLine: "line-through",
  },
});

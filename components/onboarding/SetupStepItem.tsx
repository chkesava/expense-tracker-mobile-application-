import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { Layout, FadeIn, FadeOut } from "react-native-reanimated";
import { Check, ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";

interface SetupStepItemProps {
  label: string;
  completed: boolean;
  onPress?: () => void;
}

export function SetupStepItem({ label, completed, onPress }: SetupStepItemProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    if (onPress) {
      Haptics.selectionAsync().catch(() => undefined);
      onPress();
    }
  };

  return (
    <Animated.View layout={Layout.springify().damping(15)}>
      <Pressable
        onPress={handlePress}
        disabled={!onPress || completed}
        android_ripple={{
          color: theme.colors.primary + "1A",
          borderless: false,
        }}
        style={({ pressed }) => [
          styles.container,
          pressed && !completed && { opacity: 0.8 },
        ]}
      >
        <View style={styles.iconContainer}>
          {completed ? (
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              style={[
                styles.circle,
                { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
              ]}
            >
              <Check size={13} color="#FFFFFF" strokeWidth={3} />
            </Animated.View>
          ) : (
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              style={[
                styles.circle,
                { borderColor: theme.colors.mutedForeground + "60", backgroundColor: "transparent" },
              ]}
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

        {!completed && onPress ? (
          <ChevronRight size={16} color={theme.colors.mutedForeground} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
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
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  completedLabel: {
    textDecorationLine: "line-through",
    opacity: 0.7,
  },
});

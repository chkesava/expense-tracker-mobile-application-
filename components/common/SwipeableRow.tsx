import { useRef, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";

export type SwipeAction = {
  icon: LucideIcon;
  label: string;
  color: string;
  onPress: () => void;
};

export type SwipeableRowProps = {
  children: ReactNode;
  rightActions: SwipeAction[];
};

/** Gmail/Google-Pay style swipe-to-reveal row actions. Tapping an action is the confirmation. */
export function SwipeableRow({ children, rightActions }: SwipeableRowProps) {
  const { theme } = useTheme();
  const swipeableRef = useRef<Swipeable>(null);

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(progress) => (
        <View style={styles.actionsRow}>
          {rightActions.map((action) => {
            const Icon = action.icon;
            const scale = progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.6, 1],
              extrapolate: "clamp",
            });
            return (
              <Pressable
                key={action.label}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                  swipeableRef.current?.close();
                  action.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={[styles.action, { backgroundColor: action.color }]}
              >
                <Animated.View style={{ transform: [{ scale }], alignItems: "center", gap: 4 }}>
                  <Icon size={theme.iconSize.lg} color={theme.colors.primaryForeground} />
                  <Text
                    style={{
                      color: theme.colors.primaryForeground,
                      fontSize: theme.typography.xs,
                      fontFamily: theme.fontFamily.semibold,
                    }}
                  >
                    {action.label}
                  </Text>
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
  },
  action: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
  },
});

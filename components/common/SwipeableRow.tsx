import { useEffect, useRef, type ReactNode } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Pressable, Swipeable } from "react-native-gesture-handler";
import type { LucideIcon } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";

export type SwipeAction = {
  icon: LucideIcon;
  label: string;
  color: string;
  onPress: () => void;
};

export type SwipeableRowProps = {
  children: ReactNode;
  rightActions: SwipeAction[];
  /** When this value changes, any open swipe closes (e.g. list scroll / recycle). */
  closeSignal?: number;
};

/** Only one ledger row stays open at a time. */
let openSwipeable: Swipeable | null = null;

export function closeOpenSwipeableRow() {
  openSwipeable?.close();
  openSwipeable = null;
}

/** Gmail/Google-Pay style swipe-to-reveal row actions. Tapping an action is the confirmation. */
export function SwipeableRow({
  children,
  rightActions,
  closeSignal,
}: SwipeableRowProps) {
  const { theme } = useTheme();
  const swipeableRef = useRef<Swipeable>(null);

  useEffect(() => {
    swipeableRef.current?.close();
  }, [closeSignal]);

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        if (openSwipeable && openSwipeable !== swipeableRef.current) {
          openSwipeable.close();
        }
        openSwipeable = swipeableRef.current;
      }}
      onSwipeableWillClose={() => {
        if (openSwipeable === swipeableRef.current) {
          openSwipeable = null;
        }
      }}
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
                  const run = action.onPress;
                  haptic.light().catch(
                    () => undefined
                  );
                  // Run the action first, then close — closing before onPress can drop taps
                  // when FlashList recycles the row mid-gesture.
                  run();
                  swipeableRef.current?.close();
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={[styles.action, { backgroundColor: action.color }]}
              >
                <Animated.View
                  style={{ transform: [{ scale }], alignItems: "center", gap: 4 }}
                >
                  <Icon
                    size={theme.iconSize.lg}
                    color={theme.colors.primaryForeground}
                  />
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

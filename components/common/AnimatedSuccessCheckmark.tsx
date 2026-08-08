import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";
import { haptic as hapticEngine } from "@/lib/haptics";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface AnimatedSuccessCheckmarkProps {
  size?: number;
  color?: string;
  backgroundColor?: string;
  haptic?: boolean;
}

export function AnimatedSuccessCheckmark({
  size = 64,
  color,
  backgroundColor,
  haptic = true,
}: AnimatedSuccessCheckmarkProps) {
  const { theme } = useTheme();
  const checkColor = color || theme.colors.success;
  const bgFill = backgroundColor || "rgba(34, 197, 94, 0.15)";

  const ringScale = useSharedValue(0.7);
  const ringOpacity = useSharedValue(0);
  const checkProgress = useSharedValue(0);

  useEffect(() => {
    if (haptic) {
      void hapticEngine.success();
    }

    ringScale.value = withSequence(
      withTiming(1.2, { duration: 250 }),
      withSpring(1, { damping: 12, stiffness: 200 })
    );
    ringOpacity.value = withSequence(
      withTiming(0.4, { duration: 150 }),
      withTiming(0, { duration: 400 })
    );

    checkProgress.value = withDelay(
      100,
      withSpring(1, { damping: 14, stiffness: 220 })
    );
  }, [checkProgress, haptic, ringOpacity, ringScale]);

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const checkAnimatedProps = useAnimatedProps(() => {
    // Total path length of checkmark: approx 32
    const totalLength = 32;
    return {
      strokeDashoffset: totalLength * (1 - checkProgress.value),
    };
  });

  return (
    <View
      style={[
        styles.container,
        { width: size * 1.3, height: size * 1.3 },
      ]}
    >
      {/* Expanding Ripple Ring */}
      <Animated.View
        style={[
          styles.rippleRing,
          {
            width: size * 1.25,
            height: size * 1.25,
            borderRadius: (size * 1.25) / 2,
            borderColor: checkColor,
          },
          ringAnimatedStyle,
        ]}
      />

      {/* Main Checkmark Badge */}
      <Animated.View
        entering={ZoomIn.springify().damping(12)}
        style={[
          styles.badge,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bgFill,
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Circle
            cx="32"
            cy="32"
            r="28"
            stroke={checkColor}
            strokeWidth="3.5"
            fill="none"
            opacity={0.85}
          />
          <AnimatedPath
            d="M20 33 L28 41 L45 23"
            stroke={checkColor}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="32"
            animatedProps={checkAnimatedProps}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default AnimatedSuccessCheckmark;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  rippleRing: {
    position: "absolute",
    borderWidth: 3,
  },
  badge: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});

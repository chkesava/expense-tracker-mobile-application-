import { memo, useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { easing, entrance, entranceDelay, useMotionReduced } from "@/theme/motion";

/**
 * SPENDLY-533 — the dashboard's one card entrance: a short fade with a small
 * rise, staggered by `index` and capped. It runs once, when the card mounts;
 * data updates re-render the card without replaying it. Under reduced motion
 * the card simply appears.
 *
 * A plain shared-value animation (opacity + translateY), not a Reanimated
 * `entering` layout animation: on web those left cards drawn over their
 * neighbours, and this never touches layout, so siblings always stack by
 * their real heights.
 */
export const DashboardEntrance = memo(function DashboardEntrance({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useMotionReduced();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      entranceDelay(index),
      withTiming(1, { duration: entrance.duration, easing: easing.standard })
    );
    // Mount-only by design: a re-render (new data, new index) must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * entrance.offsetY }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
});

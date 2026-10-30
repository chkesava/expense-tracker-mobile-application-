import { memo, useEffect, useState, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { easing, entrance, entranceDelay, entranceSettleMs, useMotionReduced } from "@/theme/motion";

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
 *
 * SPENDLY-632: on Android cold starts Reanimated pushes these frames down its
 * synchronous-props path before the native views are mounted; every frame,
 * the final `opacity: 1` included, fails ("Unable to find
 * SurfaceMountingManager for tag") and the card stayed invisible for good.
 * So once the entrance is over the animated style is dropped, and React
 * commits the card's resting state through the normal mount path, which
 * always lands.
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
  const [settled, setSettled] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      setSettled(true);
      return;
    }
    progress.value = withDelay(
      entranceDelay(index),
      withTiming(1, { duration: entrance.duration, easing: easing.standard })
    );
    const timer = setTimeout(() => setSettled(true), entranceSettleMs(index));
    return () => clearTimeout(timer);
    // Mount-only by design: a re-render (new data, new index) must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * entrance.offsetY }],
  }));

  return <Animated.View style={settled ? style : [style, animatedStyle]}>{children}</Animated.View>;
});

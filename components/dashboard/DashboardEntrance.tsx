import { memo, useEffect, useState, type ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { easing, entrance, entranceDelay, entranceSettleMs, useMotionReduced } from "@/theme/motion";

type EntranceProps = {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

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
 * SPENDLY-717 — web only. On Android, Reanimated 4.5.1 (RN 0.86) pushes the
 * fade down its synchronous-props path, which fails for views that aren't
 * mounted yet ("synchronouslyUpdateUIProps failed"). SPENDLY-632 dropped the
 * animated style once the entrance was over, which fixed the cards drawn
 * with the screen, but the "More" cards that `LazyMount` adds later still
 * stayed at opacity 0: two screens of blank space after Recent Transactions
 * (reproduced on device with Spendly Test). A card holding money figures
 * must never depend on an animation to become visible, so native draws the
 * card at rest from the first frame and never starts at opacity 0.
 */
export const DashboardEntrance = memo(function DashboardEntrance(props: EntranceProps) {
  return Platform.OS === "web" ? <FadeInEntrance {...props} /> : <View style={props.style}>{props.children}</View>;
});

function FadeInEntrance({ index = 0, children, style }: EntranceProps) {
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
}

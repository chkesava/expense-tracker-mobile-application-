import { useMemo, type ReactElement } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { useTabSwipeGestureRef } from "@/components/navigation/TabSwipeContext";

/**
 * Wrap a horizontally scrollable child (filter chips, tab strips, carousels) so
 * it wins over the app-shell tab swipe: the shell gesture waits for this one to
 * fail, meaning scrolling a chip row never switches the primary tab.
 *
 * Renders no extra view — the child element is cloned, so layout is unchanged.
 */
export function HorizontalSwipeBoundary({
  children,
}: {
  children: ReactElement;
}) {
  const swipeGestureRef = useTabSwipeGestureRef();

  const gesture = useMemo(() => {
    const native = Gesture.Native();
    return swipeGestureRef ? native.blocksExternalGesture(swipeGestureRef) : native;
  }, [swipeGestureRef]);

  if (!swipeGestureRef) return children;

  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

export default HorizontalSwipeBoundary;

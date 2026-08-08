/**
 * MD3-flavored animation tokens — shared durations & easing curves.
 */
import { Easing } from "react-native-reanimated";

export const durations = {
  short: 100,
  medium: 200,
  long: 300,
  extraLong: 400,
  /** Slow ambient loop, e.g. Skeleton pulse */
  loading: 700,
};

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  emphasized: Easing.bezier(0.3, 0, 0.8, 0.15),
};

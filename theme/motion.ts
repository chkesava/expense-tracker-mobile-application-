/**
 * MD3-flavored animation tokens — shared durations & easing curves.
 */
import { Easing, useReducedMotion } from "react-native-reanimated";

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

/**
 * Card entrance (SPENDLY-533): a short fade with a small upward drift, staggered
 * by position but capped so a long dashboard never waits on its last card.
 */
export const entrance = {
  duration: 260,
  /** Extra delay per card position. */
  stagger: 45,
  /** No card waits longer than this. */
  maxDelay: 225,
  /** How far (dp) a card rises while it fades in. */
  offsetY: 8,
};

/** Delay for the card at `index` in an entrance sequence. */
export function entranceDelay(index: number): number {
  return Math.min(Math.max(0, index) * entrance.stagger, entrance.maxDelay);
}

/**
 * SPENDLY-632: when a card's entrance is over and its resting state is
 * committed by React (`DashboardEntrance`), with a small margin.
 */
export function entranceSettleMs(index: number): number {
  return entranceDelay(index) + entrance.duration + 80;
}

/** Progress bars, counters and chart growth. */
export const valueMotion = {
  /** Width / height growth of bars and meters. */
  grow: { duration: 420 },
  /** Number count between two values. */
  counter: { duration: 650 },
};

/**
 * True when the OS asks for reduced motion. Every decorative animation in the
 * Spendly shell checks this and jumps straight to its end state instead.
 */
export function useMotionReduced(): boolean {
  return useReducedMotion();
}

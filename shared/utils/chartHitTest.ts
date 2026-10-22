/**
 * SPENDLY-533 — tap hit-testing for the SVG charts. react-native-svg forwards
 * responder props to DOM nodes on web ("Unknown event handler property"), so
 * the charts take taps on one transparent Pressable and map the touch point to
 * a slice or a point with these pure helpers.
 */

/**
 * Which donut slice sits under a touch, or `null` when the touch misses the
 * ring. `dx`/`dy` are relative to the donut's centre (y grows downward, as in
 * screen space). Slices start at 12 o'clock and run clockwise, each taking its
 * `fraction` of the turn — the same layout the chart draws.
 */
export function donutSliceAt(
  dx: number,
  dy: number,
  innerRadius: number,
  outerRadius: number,
  fractions: readonly number[]
): number | null {
  const distance = Math.hypot(dx, dy);
  if (!(distance >= innerRadius && distance <= outerRadius)) return null;
  if (fractions.length === 0) return null;

  // 0 at 12 o'clock, growing clockwise, in [0, 1).
  const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
  let cumulative = 0;
  for (let i = 0; i < fractions.length; i += 1) {
    cumulative += Math.max(0, fractions[i]);
    if (turn < cumulative) return i;
  }
  // Floating-point rounding can leave the very end of the turn uncovered.
  return fractions.length - 1;
}

export type DonutTapTarget = { kind: "center" } | { kind: "slice"; index: number } | null;

/**
 * SPENDLY-574 — what a tap on a drill-down donut means: inside the hole is the
 * centre (Total Spending), on the ring is that slice (its category), anywhere
 * else is nothing. The hole stops `gap` short of the ring's inner edge so a
 * tap on the boundary is never read as both.
 */
export function donutTapTarget(
  dx: number,
  dy: number,
  innerRadius: number,
  outerRadius: number,
  fractions: readonly number[],
  gap = 4
): DonutTapTarget {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance)) return null;
  if (distance < Math.max(0, innerRadius - gap)) return { kind: "center" };
  const index = donutSliceAt(dx, dy, innerRadius, outerRadius, fractions);
  return index === null ? null : { kind: "slice", index };
}

/** Index of the x-coordinate nearest to `x` (ties go to the earlier point), or -1. */
export function nearestPointIndex(x: number, xs: readonly number[]): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < xs.length; i += 1) {
    const distance = Math.abs(xs[i] - x);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

type PressNativeEvent = {
  locationX?: number;
  locationY?: number;
  offsetX?: number;
  offsetY?: number;
};

/**
 * The press point relative to the pressed view. Native responder events carry
 * `locationX/Y`; on web a Pressable's `onPress` gets the DOM click event,
 * which has `offsetX/Y` instead. `null` when neither is a number.
 */
export function pressPoint(nativeEvent: PressNativeEvent): { x: number; y: number } | null {
  const x = Number.isFinite(nativeEvent.locationX) ? nativeEvent.locationX : nativeEvent.offsetX;
  const y = Number.isFinite(nativeEvent.locationY) ? nativeEvent.locationY : nativeEvent.offsetY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: x as number, y: y as number };
}

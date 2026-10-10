# SPENDLY-489: Stop per-node SVG animated props in charts

**Epic:** SPENDLY-488 (Android lag fixes).

## Problem
On the device, logcat showed bursts of `Reanimated: synchronouslyUpdateUIProps failed for tag N`, caused by `RetryableMountingLayerException: Unable to find SurfaceMountingManager`.
- Run 1 had 142 failures in one second, which produced 20,057 log lines.
- Run 2 had 32 failures, including at launch.

Reanimated 4.5 on RN 0.86 pushes animated SVG props straight to native views. When the view isn't mounted yet, or isn't mounted any more, each frame's update fails and logs a stack of about 140 lines on the UI thread.

## Fix
Five components animated SVG nodes per element. Each one now renders those nodes statically:

| Component | Before | After |
|---|---|---|
| `BarChart` | An `AnimatedRect` per bar, springing its height and y | Static bars in their own SVG layer, which grows from the baseline in a single `Animated.View` (`scaleY`, origin at the bottom). The grow replays when the data changes. Gridlines and labels sit in a separate static SVG, so they never squash. |
| `DonutChart` | `AnimatedCircle` slices (dash length, radius, stroke) | Static slices. The selected slice still enlarges, instantly. The wrapping `ZoomIn` is the entrance. |
| `SpendingCurveChart` | `AnimatedCurveDot` radius springs | Static dots. The chart already fades in as one view. `animateDots` is now a deprecated no-op. |
| `PortfolioCharts` | `AnimatedCircle` allocation slices | Static slices inside the existing `ZoomIn`. |
| `AnimatedSuccessCheckmark` | `AnimatedPath` stroke draw | A static check inside the badge's `ZoomIn`. The ripple ring was already a View animation and is unchanged. |

No `Animated.createAnimatedComponent` of an SVG element remains in `app/` or `components/`.

## Tests
- `npm test`: 352 test files pass.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- Device check on Spendly Test: see the Jira comment.

/**
 * Phase 19 — gated performance diagnostics.
 * Enabled when __DEV__ or EXPO_PUBLIC_PERF_MARKS=1. No-op otherwise.
 */

const ENABLED =
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  process.env.EXPO_PUBLIC_PERF_MARKS === "1";

const appStartMs =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const marks = new Map<string, number>();

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function isPerfMarksEnabled(): boolean {
  return ENABLED;
}

/** Record a named milestone; logs ms since app module load and since prior mark. */
export function perfMark(name: string): void {
  if (!ENABLED) return;
  const t = now();
  const prev = marks.size > 0 ? Math.max(...marks.values()) : appStartMs;
  marks.set(name, t);
  const sinceStart = Math.round(t - appStartMs);
  const sincePrev = Math.round(t - prev);
  console.log(`[perf] ${name} +${sincePrev}ms (total ${sinceStart}ms)`);
}

export function getPerfMarks(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of marks) {
    out[k] = Math.round(v - appStartMs);
  }
  return out;
}

/**
 * Sample scroll FPS for `durationMs` via requestAnimationFrame.
 * Call once while flinging a list; logs average FPS.
 */
export function sampleScrollFps(
  label: string,
  durationMs = 1500
): () => void {
  if (!ENABLED) return () => undefined;

  let frames = 0;
  let raf = 0;
  let stopped = false;
  const start = now();

  const tick = () => {
    if (stopped) return;
    frames += 1;
    if (now() - start >= durationMs) {
      const elapsed = (now() - start) / 1000;
      const fps = elapsed > 0 ? frames / elapsed : 0;
      console.log(`[perf] fps:${label} ${fps.toFixed(1)} (${frames} frames / ${elapsed.toFixed(2)}s)`);
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
  };
}

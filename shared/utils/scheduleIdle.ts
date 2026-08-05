/**
 * Schedule non-critical work after animations/interactions or idle timeout.
 * Returns a cancellation function.
 */
export function scheduleIdleWork(
  work: () => void,
  options?: { timeoutMs?: number; fallbackDelayMs?: number }
): () => void {
  const fallbackDelayMs = options?.fallbackDelayMs ?? 1000;

  let cancelled = false;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let interactionHandle: { cancel: () => void } | undefined;

  const globalAny = globalThis as unknown as {
    InteractionManager?: {
      runAfterInteractions?: (cb: () => void) => { cancel: () => void };
    };
    requestIdleCallback?: (cb: () => void, opts: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  const InteractionManager = globalAny.InteractionManager;

  if (
    InteractionManager &&
    typeof InteractionManager.runAfterInteractions === "function"
  ) {
    try {
      interactionHandle = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) work();
      });
    } catch {
      timerId = setTimeout(() => {
        if (!cancelled) work();
      }, fallbackDelayMs);
    }
  } else if (
    typeof window !== "undefined" &&
    typeof (window as unknown as typeof globalAny).requestIdleCallback === "function"
  ) {
    const timeoutMs = options?.timeoutMs ?? 2500;
    const idleId = (window as unknown as typeof globalAny).requestIdleCallback!(
      () => {
        if (!cancelled) work();
      },
      { timeout: timeoutMs }
    );
    return () => {
      cancelled = true;
      if (typeof (window as unknown as typeof globalAny).cancelIdleCallback === "function") {
        (window as unknown as typeof globalAny).cancelIdleCallback!(idleId);
      }
    };
  } else {
    timerId = setTimeout(() => {
      if (!cancelled) work();
    }, fallbackDelayMs);
  }

  return () => {
    cancelled = true;
    if (interactionHandle?.cancel) {
      interactionHandle.cancel();
    }
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  };
}

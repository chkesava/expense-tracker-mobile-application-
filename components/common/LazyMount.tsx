import React, { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";

type LazyMountProps = {
  children: ReactNode;
  /** Delay before mounting (ms). Default 0 = next frame / idle. */
  delayMs?: number;
  /** Optional min height placeholder while deferred. */
  minHeight?: number;
};

/**
 * Defers mounting heavy dashboard widgets until after first paint / idle.
 */
export function LazyMount({
  children,
  delayMs = 0,
  minHeight,
}: LazyMountProps) {
  const [ready, setReady] = useState(delayMs === 0 ? false : false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;

    if (delayMs > 0) {
      timer = setTimeout(() => {
        if (!cancelled) setReady(true);
      }, delayMs);
    } else {
      raf = requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [delayMs]);

  if (!ready) {
    return minHeight ? <View style={{ minHeight }} /> : null;
  }

  return <>{children}</>;
}

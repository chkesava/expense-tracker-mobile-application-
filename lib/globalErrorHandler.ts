/**
 * Last-resort handlers for errors no `try`/`catch` and no error boundary sees:
 * throws from native callbacks, timers, event listeners, and promises nobody
 * awaited.
 *
 * Without this, an unhandled rejection is silent in release builds and an
 * uncaught exception goes straight to a native crash with the raw message.
 * Everything here routes through `logError`, so nothing sensitive is written.
 *
 * Fatal errors are still handed to React Native's default handler — swallowing
 * them would leave the app running on top of broken state, which is worse than
 * a clean restart.
 */

import { logError, logWarning } from "./errors";

type RNErrorUtils = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

type HermesGlobal = {
  HermesInternal?: {
    enablePromiseRejectionTracker?: (options: {
      allRejections?: boolean;
      onUnhandled?: (id: number, rejection: unknown) => void;
      onHandled?: (id: number) => void;
    }) => void;
  };
  ErrorUtils?: RNErrorUtils;
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
};

let installed = false;

/** Idempotent — safe to call from module scope and again on fast refresh. */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  const g = globalThis as unknown as HermesGlobal;

  // ─── Uncaught JS exceptions ────────────────────────────────────────────────
  try {
    const errorUtils = g.ErrorUtils;
    const defaultHandler = errorUtils?.getGlobalHandler?.();

    errorUtils?.setGlobalHandler?.((error, isFatal) => {
      logError("global.uncaught", error, { fatal: Boolean(isFatal) });
      // Preserve the platform's behaviour (dev red box, release crash report).
      defaultHandler?.(error, isFatal);
    });
  } catch (error) {
    logWarning("global.installUncaught", error);
  }

  // ─── Unhandled promise rejections ──────────────────────────────────────────
  try {
    const tracker = g.HermesInternal?.enablePromiseRejectionTracker;
    if (typeof tracker === "function") {
      tracker({
        allRejections: true,
        onUnhandled: (id, rejection) => {
          logError("global.unhandledRejection", rejection, { rejectionId: id });
        },
        onHandled: () => undefined,
      });
    } else if (typeof g.addEventListener === "function") {
      // Web / JSC fallback.
      g.addEventListener("unhandledrejection", (event: unknown) => {
        const reason =
          event && typeof event === "object" && "reason" in event
            ? (event as { reason: unknown }).reason
            : event;
        logError("global.unhandledRejection", reason);
      });
    }
  } catch (error) {
    logWarning("global.installRejectionTracker", error);
  }
}

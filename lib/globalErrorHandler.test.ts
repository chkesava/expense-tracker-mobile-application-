/**
 * Tests the orchestration logic of installGlobalErrorHandlers:
 *  - idempotent installation guard (never double-installs)
 *  - uncaught JS exception path
 *  - unhandled promise rejection paths (Hermes + browser-style)
 *
 * logError / logWarning are observed via console.error / console.warn because
 * the redacting logger ultimately writes there in a Node test environment.
 *
 * The module-level `installed` flag is reset between tests by resetting the
 * module registry and importing a fresh copy each time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Helper: import a fresh copy of the module (bypasses `installed` singleton).
async function freshModule() {
  vi.resetModules();
  return import("./globalErrorHandler");
}

describe("installGlobalErrorHandlers", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Clean up any RN globals left by a previous test.
    const g = globalThis as Record<string, unknown>;
    delete g.ErrorUtils;
    delete g.HermesInternal;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const g = globalThis as Record<string, unknown>;
    delete g.ErrorUtils;
    delete g.HermesInternal;
    delete g.addEventListener;
  });

  it("installs without throwing on a plain Node environment (no RN globals)", async () => {
    const { installGlobalErrorHandlers } = await freshModule();
    expect(() => installGlobalErrorHandlers()).not.toThrow();
  });

  it("wraps ErrorUtils.setGlobalHandler when the RN global is present", async () => {
    let installedHandler: ((error: unknown, isFatal?: boolean) => void) | undefined;
    const defaultHandler = vi.fn();

    const g = globalThis as Record<string, unknown>;
    g.ErrorUtils = {
      getGlobalHandler: () => defaultHandler,
      setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => {
        installedHandler = handler;
      },
    };

    const { installGlobalErrorHandlers } = await freshModule();
    installGlobalErrorHandlers();

    expect(installedHandler).toBeDefined();

    // Simulate an uncaught non-fatal error
    installedHandler!(new Error("uncaught!"), false);

    expect(consoleError).toHaveBeenCalled();
    expect(defaultHandler).toHaveBeenCalledWith(expect.any(Error), false);
  });

  it("forwards fatal errors to the default handler", async () => {
    const defaultHandler = vi.fn();
    let installedHandler: ((error: unknown, isFatal?: boolean) => void) | undefined;

    const g = globalThis as Record<string, unknown>;
    g.ErrorUtils = {
      getGlobalHandler: () => defaultHandler,
      setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => {
        installedHandler = handler;
      },
    };

    const { installGlobalErrorHandlers } = await freshModule();
    installGlobalErrorHandlers();
    installedHandler!(new Error("fatal crash"), true);

    expect(defaultHandler).toHaveBeenCalledWith(expect.any(Error), true);
  });

  it("registers the Hermes rejection tracker when HermesInternal is present", async () => {
    let capturedOnUnhandled: ((id: number, rejection: unknown) => void) | undefined;
    const hermesTracker = vi.fn(
      (opts: { onUnhandled?: (id: number, rejection: unknown) => void }) => {
        capturedOnUnhandled = opts.onUnhandled;
      }
    );

    const g = globalThis as Record<string, unknown>;
    g.HermesInternal = { enablePromiseRejectionTracker: hermesTracker };

    const { installGlobalErrorHandlers } = await freshModule();
    installGlobalErrorHandlers();

    expect(hermesTracker).toHaveBeenCalled();

    // Simulate an unhandled rejection
    capturedOnUnhandled?.(1, new Error("unhandled promise"));
    expect(consoleError).toHaveBeenCalled();
  });

  it("falls back to addEventListener for browser / JSC environments", async () => {
    const listeners: Array<(event: unknown) => void> = [];
    const g = globalThis as Record<string, unknown>;
    // Ensure Hermes path is not taken (HermesInternal absent)
    delete g.HermesInternal;
    g.addEventListener = (_type: string, listener: (event: unknown) => void) => {
      listeners.push(listener);
    };

    const { installGlobalErrorHandlers } = await freshModule();
    installGlobalErrorHandlers();

    expect(listeners.length).toBeGreaterThanOrEqual(1);

    // Simulate browser-style unhandledrejection event
    listeners[0]!({ reason: new Error("browser rejection") });
    expect(consoleError).toHaveBeenCalled();
  });

  it("is idempotent — only installs once even when called multiple times", async () => {
    const defaultHandler = vi.fn();
    let installCount = 0;

    const g = globalThis as Record<string, unknown>;
    g.ErrorUtils = {
      getGlobalHandler: () => defaultHandler,
      setGlobalHandler: () => {
        installCount += 1;
      },
    };

    const { installGlobalErrorHandlers } = await freshModule();
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();

    // setGlobalHandler must be called exactly once despite three installs
    expect(installCount).toBe(1);
  });
});

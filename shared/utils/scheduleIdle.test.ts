import { describe, expect, it, vi } from "vitest";
import { scheduleIdleWork } from "./scheduleIdle";

describe("scheduleIdleWork", () => {
  it("executes work callback after delay", async () => {
    vi.useFakeTimers();
    const mockFn = vi.fn();

    scheduleIdleWork(mockFn, { fallbackDelayMs: 200 });

    expect(mockFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(mockFn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("can be cancelled before execution", async () => {
    vi.useFakeTimers();
    const mockFn = vi.fn();

    const cancel = scheduleIdleWork(mockFn, { fallbackDelayMs: 200 });
    cancel();

    vi.advanceTimersByTime(300);
    expect(mockFn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

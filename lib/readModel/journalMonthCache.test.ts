import { describe, expect, it, vi } from "vitest";

import { createJournalMonthCache } from "./journalMonthCache";

/** SPENDLY-748 — one month-scoped read per month for the session. */
describe("journal month cache (SPENDLY-748)", () => {
  it("reads a month once: a repeat call after success reads nothing", async () => {
    const cache = createJournalMonthCache();
    const loader = vi.fn(async () => {});
    expect(await cache.load("2025-03", loader)).toBe(true);
    expect(await cache.load("2025-03", loader)).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.loaded()).toEqual(new Set(["2025-03"]));
  });

  it("shares one in-flight read between concurrent callers", async () => {
    const cache = createJournalMonthCache();
    let release!: () => void;
    const loader = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const a = cache.load("2025-03", loader);
    const b = cache.load("2025-03", loader);
    expect(cache.loaded().has("2025-03")).toBe(false);
    release();
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps each month separate", async () => {
    const cache = createJournalMonthCache();
    const loader = vi.fn(async () => {});
    await cache.load("2025-03", loader);
    await cache.load("2025-04", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("forgets a failed read, so a retry reads again", async () => {
    const cache = createJournalMonthCache();
    const onError = vi.fn();
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await cache.load("2025-03", failing, onError)).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }));
    expect(cache.loaded().has("2025-03")).toBe(false);

    const ok = vi.fn(async () => {});
    expect(await cache.load("2025-03", ok)).toBe(true);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("reset (sign-out) drops every month, and a read still in flight is not trusted", async () => {
    const cache = createJournalMonthCache();
    let release!: () => void;
    const pending = cache.load("2025-03", () => new Promise<void>((resolve) => (release = resolve)));
    cache.reset();
    release();
    expect(await pending).toBe(false);
    expect(cache.loaded().size).toBe(0);

    const next = vi.fn(async () => {});
    await cache.load("2025-03", next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

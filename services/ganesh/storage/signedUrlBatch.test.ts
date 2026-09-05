import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchSignedUrl } from "@/services/ganesh/storage/supabaseStorage";

/**
 * Client-side batching of signed-URL requests (GS-096).
 *
 * A list view mounts one `GaneshSignedPreview` per visible row, each asking for
 * its own URL. What is tested here is that those separate asks leave as one
 * request, that each row still gets its own answer, and that a row the server
 * refuses fails alone.
 */

class MockBatchUnsupportedError extends Error {
  constructor() {
    super("ganesh-files does not support downloadBatch.");
    this.name = "BatchUnsupportedError";
  }
}

const createObjectSignedUrls = vi.fn(
  async (paths: string[]): Promise<BatchSignedUrl[]> =>
    paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null }))
);
const createObjectSignedUrl = vi.fn(async (path: string) => `https://single.example/${path}`);

// `storageService` re-exports `prepareGaneshImage`, which reaches
// expo-image-manipulator and from there React Native. Nothing in these tests
// touches it; this just keeps the module graph loadable under Node.
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

vi.mock("@/services/ganesh/storage/supabaseStorage", () => ({
  createObjectSignedUrl: (path: string) => createObjectSignedUrl(path),
  createObjectSignedUrls: (paths: string[]) => createObjectSignedUrls(paths),
  removeObject: vi.fn(),
  uploadObject: vi.fn(),
  BatchUnsupportedError: MockBatchUnsupportedError,
}));

const { __resetSignedUrlState, __signedUrlCacheSize, getSignedUrl } = await import(
  "@/services/ganesh/storage/storageService"
);

const PANDAL = "pandalA";
const FESTIVAL = "fest2026";
const expected = { pandalId: PANDAL, festivalId: FESTIVAL };

function assetPath(id: string): string {
  return `pandals/${PANDAL}/assets/${id}/photo.jpg`;
}

/** Let the coalescing window elapse and the resulting request settle. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50);
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetSignedUrlState();
  createObjectSignedUrls.mockClear();
  createObjectSignedUrl.mockClear();
  createObjectSignedUrls.mockImplementation(async (paths: string[]) =>
    paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null }))
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("signed URL batching", () => {
  it("turns many rows' requests into one call, answering each correctly", async () => {
    const paths = [assetPath("a1"), assetPath("a2"), assetPath("a3")];

    const pending = paths.map((path) => getSignedUrl(path, expected));
    await flush();
    const urls = await Promise.all(pending);

    expect(createObjectSignedUrls).toHaveBeenCalledTimes(1);
    expect(createObjectSignedUrls.mock.calls[0][0]).toEqual(paths);
    expect(urls).toEqual(paths.map((path) => `https://signed.example/${path}`));
  });

  it("never falls back to one request per file while batching works", async () => {
    const pending = [assetPath("a1"), assetPath("a2")].map((path) => getSignedUrl(path, expected));
    await flush();
    await Promise.all(pending);

    expect(createObjectSignedUrl).not.toHaveBeenCalled();
  });

  it("asks once for a path two rows share", async () => {
    const path = assetPath("shared");

    const both = [getSignedUrl(path, expected), getSignedUrl(path, expected)];
    await flush();
    const [first, second] = await Promise.all(both);

    expect(createObjectSignedUrls.mock.calls[0][0]).toEqual([path]);
    expect(first).toBe(second);
  });

  it("serves a second mount of the same row from the cache, with no request", async () => {
    const path = assetPath("a1");

    const first = getSignedUrl(path, expected);
    await flush();
    await first;
    createObjectSignedUrls.mockClear();

    await expect(getSignedUrl(path, expected)).resolves.toBe(`https://signed.example/${path}`);
    expect(createObjectSignedUrls).not.toHaveBeenCalled();
  });

  it("fails only the row the server refused", async () => {
    const good = assetPath("mine");
    const bad = assetPath("gone");
    createObjectSignedUrls.mockImplementation(async (paths: string[]) =>
      paths.map((path) =>
        path === bad
          ? { path, signedUrl: null, error: "You do not have permission to open this file." }
          : { path, signedUrl: `https://signed.example/${path}`, error: null }
      )
    );

    // Settled with a handler already attached: the rejection lands during the
    // flush below, before an `await` could catch it.
    const goodPending = getSignedUrl(good, expected).catch((error) => error);
    const badPending = getSignedUrl(bad, expected).catch((error) => error);
    await flush();

    expect(await goodPending).toBe(`https://signed.example/${good}`);
    expect(await badPending).toBeInstanceOf(Error);
    expect((await badPending).message).toMatch(/permission/i);
    // The failure is not cached — the next mount may legitimately succeed.
    expect(__signedUrlCacheSize()).toBe(1);
  });

  it("rejects every waiter when the request itself fails", async () => {
    createObjectSignedUrls.mockImplementation(async () => {
      throw new Error("No internet connection.");
    });

    const pending = [assetPath("a1"), assetPath("a2")].map((path) =>
      getSignedUrl(path, expected).catch((error) => error)
    );
    await flush();

    expect((await pending[0]).message).toMatch(/No internet connection/);
    expect((await pending[1]).message).toMatch(/No internet connection/);
    expect(__signedUrlCacheSize()).toBe(0);
  });

  it("stays within the function's batch cap, flushing the overflow after", async () => {
    const paths = Array.from({ length: 60 }, (_, index) => assetPath(`a${index}`));

    const pending = paths.map((path) => getSignedUrl(path, expected));
    await flush();
    await Promise.all(pending);

    expect(createObjectSignedUrls).toHaveBeenCalledTimes(2);
    expect(createObjectSignedUrls.mock.calls[0][0]).toHaveLength(50);
    expect(createObjectSignedUrls.mock.calls[1][0]).toHaveLength(10);
  });

  it("keeps working against a function deployed before the batch action existed", async () => {
    createObjectSignedUrls.mockImplementation(async () => {
      throw new MockBatchUnsupportedError();
    });
    const paths = [assetPath("a1"), assetPath("a2")];

    const pending = paths.map((path) => getSignedUrl(path, expected));
    await flush();

    expect(await Promise.all(pending)).toEqual(paths.map((p) => `https://single.example/${p}`));
    expect(createObjectSignedUrl).toHaveBeenCalledTimes(2);

    // The probe is latched: a later screen does not pay for it again.
    createObjectSignedUrls.mockClear();
    const later = getSignedUrl(assetPath("a3"), expected);
    await flush();
    await later;
    expect(createObjectSignedUrls).not.toHaveBeenCalled();
  });

  it("refuses a path from another pandal before any request is made", async () => {
    await expect(
      getSignedUrl("pandals/otherPandal/assets/a1/photo.jpg", expected)
    ).rejects.toThrow(/does not belong/i);
    await expect(getSignedUrl("pandals/../../etc/passwd", expected)).rejects.toThrow();

    await flush();
    expect(createObjectSignedUrls).not.toHaveBeenCalled();
    expect(createObjectSignedUrl).not.toHaveBeenCalled();
  });

  it("keeps the cache bounded when whole batches are written at once", async () => {
    for (let round = 0; round < 8; round += 1) {
      const paths = Array.from({ length: 50 }, (_, index) => assetPath(`r${round}f${index}`));
      const pending = paths.map((path) => getSignedUrl(path, expected));
      await flush();
      await Promise.all(pending);
    }

    expect(__signedUrlCacheSize()).toBeLessThanOrEqual(300);
  });
});

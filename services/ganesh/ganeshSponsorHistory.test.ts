import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocs = vi.fn(async (_q?: unknown) => ({ docs: [] }));
const query = vi.fn((...args: unknown[]) => args);
const where = vi.fn((...args: unknown[]) => ({ where: args }));
const collection = vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }));
const limit = vi.fn((n: number) => ({ limit: n }));

vi.mock("firebase/firestore", () => ({
  getDocs: (q: unknown) => getDocs(q),
  query: (col: unknown, ...rest: unknown[]) => query(col, ...rest),
  where: (field: string, op: string, value: unknown) => where(field, op, value),
  collection: (db: unknown, ...segments: string[]) => collection(db, ...segments),
  limit: (n: number) => limit(n),
}));

import {
  loadSponsorHistory,
  MAX_FESTIVALS,
  MAX_PER_FESTIVAL,
  sponsorHistoryWhere,
} from "@/services/ganesh/ganeshSponsorHistory";

describe("loadSponsorHistory", () => {
  beforeEach(() => {
    getDocs.mockClear();
    query.mockClear();
    where.mockClear();
    limit.mockClear();
    collection.mockClear();
  });

  it("queries each festival by sponsorId instead of downloading every sponsorship", async () => {
    await loadSponsorHistory({} as never, "pandal-1", "sponsor-9", ["fest-a", "fest-b"]);

    expect(where).toHaveBeenCalledWith("sponsorId", "==", "sponsor-9");
    expect(getDocs).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toEqual({ where: ["sponsorId", "==", "sponsor-9"] });
    expect(collection.mock.calls[0]?.slice(1)).toEqual([
      "pandals",
      "pandal-1",
      "festivals",
      "fest-a",
      "sponsorships",
    ]);
  });

  it("uses an equality-only sponsor filter", () => {
    expect(sponsorHistoryWhere("s1")).toEqual({ where: ["sponsorId", "==", "s1"] });
  });

  it("bounds each festival query so one runaway collection cannot be downloaded", async () => {
    await loadSponsorHistory({} as never, "pandal-1", "sponsor-9", ["fest-a"]);

    expect(limit).toHaveBeenCalledWith(MAX_PER_FESTIVAL);
    expect(query.mock.calls[0]?.[2]).toEqual({ limit: MAX_PER_FESTIVAL });
  });

  it("reads only the most recent festivals rather than the whole history", async () => {
    // Callers pass festivals newest-first (useFestivals orders by year desc).
    const ids = Array.from({ length: MAX_FESTIVALS + 5 }, (_unused, i) => `fest-${i}`);
    await loadSponsorHistory({} as never, "pandal-1", "sponsor-9", ids);

    expect(getDocs).toHaveBeenCalledTimes(MAX_FESTIVALS);
    const queried = collection.mock.calls.map((call) => call[4]);
    expect(queried).toContain("fest-0");
    expect(queried).not.toContain(`fest-${MAX_FESTIVALS}`);
  });
});

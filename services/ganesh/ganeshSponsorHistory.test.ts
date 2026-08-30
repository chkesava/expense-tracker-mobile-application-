import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocs = vi.fn(async (_q?: unknown) => ({ docs: [] }));
const query = vi.fn((...args: unknown[]) => args);
const where = vi.fn((...args: unknown[]) => ({ where: args }));
const collection = vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }));

vi.mock("firebase/firestore", () => ({
  getDocs: (q: unknown) => getDocs(q),
  query: (col: unknown, ...rest: unknown[]) => query(col, ...rest),
  where: (field: string, op: string, value: unknown) => where(field, op, value),
  collection: (db: unknown, ...segments: string[]) => collection(db, ...segments),
}));

import { loadSponsorHistory, sponsorHistoryWhere } from "@/services/ganesh/ganeshSponsorHistory";

describe("loadSponsorHistory", () => {
  beforeEach(() => {
    getDocs.mockClear();
    query.mockClear();
    where.mockClear();
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
});

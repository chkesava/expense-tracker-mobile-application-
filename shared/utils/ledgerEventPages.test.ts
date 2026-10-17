import { describe, expect, it } from "vitest";

import {
  LEDGER_EVENTS_PAGE_SIZE,
  mergeEventPages,
  pageMayHaveMore,
  pushedOutRows,
  sortEventsNewestFirst,
} from "./ledgerEventPages";

const row = (id: string, v = 0) => ({ id, v });

describe("ledgerEventPages (SPENDLY-501)", () => {
  it("merges live then older, live winning on id collisions", () => {
    const merged = mergeEventPages([row("c", 1), row("b", 1)], [row("b", 0), row("a", 0)]);
    expect(merged).toEqual([row("c", 1), row("b", 1), row("a", 0)]);
  });

  it("finds rows pushed out of the live window", () => {
    expect(pushedOutRows([row("c"), row("b"), row("a")], [row("d"), row("c"), row("b")])).toEqual([row("a")]);
    expect(pushedOutRows([row("a")], [row("a")])).toEqual([]);
  });

  it("treats only a full page as possibly having more", () => {
    expect(pageMayHaveMore(LEDGER_EVENTS_PAGE_SIZE)).toBe(true);
    expect(pageMayHaveMore(LEDGER_EVENTS_PAGE_SIZE - 1)).toBe(false);
    expect(pageMayHaveMore(0)).toBe(false);
  });

  it("sorts newest first across timestamp shapes", () => {
    const rows = [
      { id: "ms", createdAt: 2_000 },
      { id: "ts", createdAt: { seconds: 3, nanoseconds: 0 } },
      { id: "iso", createdAt: "1970-01-01T00:00:01.000Z" },
      { id: "none" },
    ];
    expect(sortEventsNewestFirst(rows).map((r) => r.id)).toEqual(["ts", "ms", "iso", "none"]);
  });
});

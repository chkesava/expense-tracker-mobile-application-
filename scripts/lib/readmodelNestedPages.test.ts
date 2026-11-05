import { describe, expect, it } from "vitest";

import { readNestedPage } from "./readmodelNestedPages";
import type { Page, PageRequest } from "./readmodelSyncCore";

/** Children per parent; a page is a slice after the cursor (an index). */
function source(children: Record<string, string[]>) {
  const calls: string[] = [];
  const readChild = async (parentId: string, request: PageRequest): Promise<Page> => {
    calls.push(parentId);
    const ids = children[parentId] ?? [];
    const start = (request.after as number | undefined) ?? 0;
    const slice = ids.slice(start, start + request.limit);
    return {
      docs: slice.map((id) => ({ id, data: {}, updateTime: 1 })),
      next: slice.length ? start + slice.length : undefined,
    };
  };
  return { calls, listParents: async () => Object.keys(children), readChild };
}

async function drainAll(children: Record<string, string[]>, limit: number) {
  const s = source(children);
  const ids: string[] = [];
  let reads = 0;
  let after: unknown;
  for (;;) {
    const page = await readNestedPage(s.listParents, s.readChild, { kind: "all", limit, after });
    ids.push(...page.docs.map((d) => d.id));
    reads += page.reads ?? 0;
    if (page.next === undefined) break;
    after = page.next;
  }
  return { ids, reads, calls: s.calls };
}

describe("nested collection pages (SPENDLY-591)", () => {
  it("returns every child of every parent once, keyed '{parentId}/{id}', across page boundaries", async () => {
    const { ids } = await drainAll({ b: ["x", "y", "z"], a: ["p"], c: [] }, 2);
    expect(ids).toEqual(["a/p", "b/x", "b/y", "b/z"]);
  });

  it("counts the parent listing and every child query, empty ones included", async () => {
    // 3 parents listed (3) + a: 1 doc (1) + b: one page of 3 (3) + c: empty (1).
    const { reads } = await drainAll({ a: ["p"], b: ["x", "y", "z"], c: [] }, 10);
    expect(reads).toBe(8);
  });

  it("lists the parents once per pass, not per page", async () => {
    let listed = 0;
    const s = source({ a: ["1", "2", "3"] });
    const listParents = async () => {
      listed += 1;
      return s.listParents();
    };
    let after: unknown;
    do {
      after = (await readNestedPage(listParents, s.readChild, { kind: "all", limit: 1, after })).next;
    } while (after !== undefined);
    expect(listed).toBe(1);
  });

  it("no parents: an empty page that still costs the listing", async () => {
    const s = source({});
    const page = await readNestedPage(s.listParents, s.readChild, { kind: "all", limit: 5 });
    expect(page).toEqual({ docs: [], reads: 1, next: undefined });
  });
});

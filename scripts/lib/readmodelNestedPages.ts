import type { Page, PageRequest } from "./readmodelSyncCore";

/**
 * SPENDLY-591 — paging a nested collection (users/{uid}/{parent}/{pid}/{child})
 * as if it were one: every parent's children in turn, ids prefixed with the
 * parent id ("{pid}/{id}", the read model's doc_id for a nested row).
 *
 * Parents come from listing the parent collection, which includes "missing"
 * parents (deleted, children left behind), so orphaned children are still
 * copied. The cursor carries the parent list, so a run sees one consistent set.
 * `reads` counts the listing and every child query, empty ones included
 * (Firestore bills an empty query as one read).
 */
type NestedCursor = { parents: string[]; i: number; after?: unknown };

export async function readNestedPage(
  listParents: () => Promise<string[]>,
  readChild: (parentId: string, request: PageRequest) => Promise<Page>,
  request: PageRequest
): Promise<Page> {
  const cursor = request.after as NestedCursor | undefined;
  let reads = 0;
  let parents = cursor?.parents;
  if (!parents) {
    parents = [...(await listParents())].sort();
    reads += Math.max(1, parents.length);
  }
  let i = cursor?.i ?? 0;
  let after = cursor?.after;
  const docs: Page["docs"] = [];
  while (i < parents.length && docs.length < request.limit) {
    const limit = request.limit - docs.length;
    const page = await readChild(parents[i], { ...request, limit, after } as PageRequest);
    reads += Math.max(1, page.docs.length);
    const parentId = parents[i];
    docs.push(...page.docs.map((doc) => ({ ...doc, id: `${parentId}/${doc.id}` })));
    if (page.docs.length < limit || page.next === undefined) {
      i += 1;
      after = undefined;
    } else {
      after = page.next;
    }
  }
  return { docs, reads, next: i < parents.length ? ({ parents, i, after } satisfies NestedCursor) : undefined };
}

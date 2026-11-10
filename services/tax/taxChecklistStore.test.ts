import { beforeEach, describe, expect, it, vi } from "vitest";

/** SPENDLY-296: checklist decisions are `taxReviews` rows of kind `checklist`, written through commitMutations. */

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/"), id: segments[segments.length - 1] }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDocFromCache: vi.fn(async () => {
    throw new Error("not cached");
  }),
  getDoc: vi.fn(async (ref: { id: string }) => ({ id: ref.id, exists: () => false, data: () => undefined })),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  deleteField: () => ({ __delete: true }),
}));
vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => ({ __db: true }) }));

const commitMutations = vi.fn(async (..._args: unknown[]) => "acked" as const);
vi.mock("@/lib/commitMutations", () => ({
  commitMutations: (...args: unknown[]) => (commitMutations as (...a: unknown[]) => unknown)(...args),
}));

const { saveChecklistDecision, undoChecklistDecision } = await import("./taxChecklistStore");
type Op = { op: string; ref: { path: string }; data?: Record<string, unknown> };

beforeEach(() => commitMutations.mockClear());

describe("checklist decisions", () => {
  it("defer and resolve are stored with no amount", async () => {
    await saveChecklistDecision("u1", "2025-26", "income-confirm-3", "defer");
    await saveChecklistDecision("u1", "2025-26", "tds-statement", "resolve");
    const [first, second] = commitMutations.mock.calls.map((c) => (c[1] as Op[])[0]);
    expect(first).toMatchObject({ op: "set", ref: { path: "users/u1/taxReviews/2025-26__checklist__income-confirm-3" }, data: { sourceKind: "checklist", decision: "defer", sourceAmount: null } });
    expect(second.data).toMatchObject({ decision: "resolve", sourceId: "tds-statement" });
  });

  it("undo deletes the decision", async () => {
    await undoChecklistDecision("u1", "2025-26", "tds-statement");
    expect(commitMutations.mock.calls[0][1]).toEqual([{ op: "delete", ref: { path: "users/u1/taxReviews/2025-26__checklist__tds-statement" } }]);
  });
});

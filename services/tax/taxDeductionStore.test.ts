import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-292 (R4.3a): EPF and eligibility decisions are checked against
 * Firestore before they are written.
 */

const contributions: { id: string; data: Record<string, unknown> }[] = [];
const docs = new Map<string, Record<string, unknown>>();

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/"), id: segments[segments.length - 1] }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  query: (ref: unknown) => ref,
  where: () => ({}),
  limit: () => ({}),
  getDocs: vi.fn(async () => ({ docs: contributions.map((c) => ({ id: c.id, data: () => c.data })), metadata: { fromCache: false } })),
  getDocFromCache: vi.fn(async () => {
    throw new Error("not cached");
  }),
  getDoc: vi.fn(async (ref: { path: string; id: string }) => ({ id: ref.id, exists: () => docs.has(ref.path), data: () => docs.get(ref.path) })),
  serverTimestamp: () => ({ __ts: true }),
  deleteField: () => ({ __delete: true }),
}));
vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => ({ __db: true }) }));
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: () => undefined }));
const commitMutations = vi.fn(async (..._args: unknown[]) => "acked" as const);
vi.mock("@/lib/commitMutations", () => ({ commitMutations: (...a: unknown[]) => (commitMutations as (...x: unknown[]) => unknown)(...a) }));

const store = await import("./taxDeductionStore");
const { TaxSourceChangedError } = await import("./taxIncomeStore");
const { buildTaxEntry } = await import("@/shared/features/tax/utils/builders");

const FY = "2025-26";
const epfLine = (value: number) =>
  ({ key: "epf_contribution:employee-share", fy: FY, category: "epf_employee", value, included: true, state: "pending", provenance: { origin: "spendly_derived", fy: FY }, label: "EPF", reasons: [] }) as never;

function claim(amount: number) {
  const r = buildTaxEntry({ id: "d1", draft: { fy: FY, kind: "deduction", fields: { category: "health_parents", amount, proofStatus: "missing" } }, nowMs: 1 });
  if (!r.ok) throw new Error("expected ok");
  return r.value;
}

beforeEach(() => {
  contributions.length = 0;
  docs.clear();
  commitMutations.mockClear();
  contributions.push(
    { id: "est_2025-04", data: { establishmentId: "est", month: "2025-04", employeeShare: 1800, status: "credited" } },
    { id: "est_2025-05", data: { establishmentId: "est", month: "2025-05", employeeShare: 1800, status: "confirmed" } }
  );
});

describe("EPF decisions", () => {
  it("records the share Firestore confirms", async () => {
    await store.saveEpfDeductionDecision("u1", { line: epfLine(3600), decision: "exclude" });
    const [, ops] = commitMutations.mock.calls[0] as [string, { ref: { path: string }; data: Record<string, unknown> }[]];
    expect(ops[0].ref.path).toBe("users/u1/taxReviews/2025-26__epf_contribution__employee-share");
    expect(ops[0].data).toMatchObject({ decision: "exclude", sourceAmount: 3600 });
  });

  it("writes nothing when Firestore's share differs from what was shown", async () => {
    await expect(store.saveEpfDeductionDecision("u1", { line: epfLine(1800), decision: "confirm" })).rejects.toBeInstanceOf(TaxSourceChangedError);
    expect(commitMutations).not.toHaveBeenCalled();
  });
});

describe("eligibility", () => {
  it("records the confirmation against the amount Firestore has", async () => {
    const entry = claim(30_000);
    const { id: _id, ...data } = entry;
    docs.set("users/u1/taxEntries/d1", data);
    await store.confirmDeductionEligibility("u1", entry);
    const [, ops] = commitMutations.mock.calls[0] as [string, { ref: { path: string }; data: Record<string, unknown> }[]];
    expect(ops[0].ref.path).toBe("users/u1/taxReviews/2025-26__tax_entry__d1");
    expect(ops[0].data).toMatchObject({ decision: "confirm", sourceAmount: 30_000 });
  });

  it("writes nothing when the claim changed or is gone", async () => {
    const entry = claim(30_000);
    const { id: _id, ...data } = claim(25_000);
    docs.set("users/u1/taxEntries/d1", data);
    await expect(store.confirmDeductionEligibility("u1", entry)).rejects.toBeInstanceOf(TaxSourceChangedError);
    docs.clear();
    await expect(store.confirmDeductionEligibility("u1", entry)).rejects.toBeInstanceOf(TaxSourceChangedError);
    expect(commitMutations).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-291 (R4.3a): accepting a TDS difference re-reads the year's records
 * from Firestore and works the row out again before anything is written.
 */

const firestoreEntries: { id: string; data: Record<string, unknown> }[] = [];

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/"), id: segments[segments.length - 1] }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  query: (ref: unknown) => ref,
  where: () => ({}),
  limit: () => ({}),
  getDocs: vi.fn(async () => ({
    docs: firestoreEntries.map((e) => ({ id: e.id, data: () => e.data })),
    metadata: { fromCache: false },
  })),
  getDocFromCache: vi.fn(async () => {
    throw new Error("not cached");
  }),
  getDoc: vi.fn(async (ref: { id: string }) => ({ id: ref.id, exists: () => false, data: () => undefined })),
  serverTimestamp: () => ({ __ts: true }),
  deleteField: () => ({ __delete: true }),
}));
vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => ({ __db: true }) }));
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: () => undefined }));
const commitMutations = vi.fn(async (..._args: unknown[]) => "acked" as const);
vi.mock("@/lib/commitMutations", () => ({ commitMutations: (...a: unknown[]) => (commitMutations as (...x: unknown[]) => unknown)(...a) }));

const { acceptTdsDifference, undoTdsAcceptance } = await import("./taxTdsStore");
const { TaxSourceChangedError } = await import("./taxIncomeStore");
const { buildTaxEntry } = await import("@/shared/features/tax/utils/builders");
const { reconcileTds } = await import("@/shared/features/tax/utils/tdsReconcile");

const FY = "2025-26";

function stored(id: string, draft: Parameters<typeof buildTaxEntry>[0]["draft"]) {
  const r = buildTaxEntry({ id, draft, nowMs: 1 });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  const { id: _id, ...data } = r.value;
  return { entry: r.value, doc: { id, data: data as Record<string, unknown> } };
}

const f16 = (tds: number) =>
  stored("f16", { fy: FY, kind: "form16", fields: { employerName: "Acme", tan: "BLRA12345B", grossSalary: 1_850_000, tdsDeducted: tds } });
const line = stored("l1", {
  fy: FY,
  kind: "ais_value",
  fields: { statement: "26AS", infoCategory: "salary", sourceName: "ACME", tan: "BLRA12345B", section: "192", reportedAmount: 1_850_000, tdsAmount: 182_000 },
});

beforeEach(() => {
  firestoreEntries.length = 0;
  commitMutations.mockClear();
});

describe("acceptTdsDifference", () => {
  it("writes the acceptance with the size of the difference Firestore confirms", async () => {
    const mine = f16(182_340);
    firestoreEntries.push(mine.doc, line.doc);
    const row = reconcileTds({ fy: FY, entries: [mine.entry, line.entry], reviews: [] }).rows[0];
    expect(row.state).toBe("mismatch");
    await acceptTdsDifference("u1", FY, row);
    const [, ops] = commitMutations.mock.calls[0] as [string, { ref: { path: string }; data: Record<string, unknown> }[]];
    expect(ops[0].ref.path).toBe("users/u1/taxReviews/2025-26__reconciliation__BLRA12345B--salary");
    expect(ops[0].data).toMatchObject({ sourceKind: "reconciliation", decision: "confirm", sourceAmount: 340 });
  });

  it("writes nothing when Firestore's records give a different difference", async () => {
    const shown = f16(182_340);
    firestoreEntries.push(f16(182_500).doc, line.doc);
    const row = reconcileTds({ fy: FY, entries: [shown.entry, line.entry], reviews: [] }).rows[0];
    await expect(acceptTdsDifference("u1", FY, row)).rejects.toBeInstanceOf(TaxSourceChangedError);
    expect(commitMutations).not.toHaveBeenCalled();
  });

  it("writes nothing when the row has since come to match", async () => {
    const shown = f16(182_340);
    firestoreEntries.push(f16(182_000).doc, line.doc);
    const row = reconcileTds({ fy: FY, entries: [shown.entry, line.entry], reviews: [] }).rows[0];
    await expect(acceptTdsDifference("u1", FY, row)).rejects.toBeInstanceOf(TaxSourceChangedError);
  });
});

describe("undoTdsAcceptance", () => {
  it("deletes the acceptance", async () => {
    const row = reconcileTds({ fy: FY, entries: [f16(182_340).entry, line.entry], reviews: [] }).rows[0];
    await undoTdsAcceptance("u1", FY, row);
    expect(commitMutations.mock.calls[0][1]).toEqual([{ op: "delete", ref: { path: "users/u1/taxReviews/2025-26__reconciliation__BLRA12345B--salary" } }]);
  });
});
